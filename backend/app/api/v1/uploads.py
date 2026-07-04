import os
import tempfile
import uuid
import zipfile

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_db
from app.models.project import Project
from app.models.user import User
from app.services import code_analyzer, notebook_converter
from app.utils.minio_client import BUCKET_USER_CODE, get_file, upload_file, list_objects

router = APIRouter(prefix="/projects/{project_id}", tags=["uploads"])

ALLOWED_EXTENSIONS = {".py", ".zip", ".ipynb", ".txt", ".yaml", ".yml", ".json", ".csv"}


@router.post("/upload")
async def upload_code(
    project_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == current_user.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    ext = "." + file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type '{ext}' not allowed. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    data = await file.read()
    upload_id = str(uuid.uuid4())[:8]

    # Notebooks are converted to a runnable script at upload time, so failures
    # surface here (with warnings the UI can show) instead of minutes later in
    # the training pod. Both the original and the script are stored.
    conversion: dict | None = None
    notebook_conversions: list[dict] = []

    if ext == ".ipynb":
        result = notebook_converter.convert_notebook_bytes(data, file.filename)
        conversion = {
            "ok": result.ok,
            "warnings": [w.to_dict() for w in result.warnings],
            "pip_packages": result.pip_packages,
        }
        if result.ok:
            script_filename = file.filename.rsplit(".", 1)[0] + ".py"
            script_object = f"{project_id}/{upload_id}/{script_filename}"
            upload_file(
                BUCKET_USER_CODE,
                script_object,
                result.script.encode("utf-8"),
                "text/x-python",
            )
            conversion["script_filename"] = script_filename
            conversion["script_path"] = script_object
    elif ext == ".zip":
        data, notebook_conversions = notebook_converter.convert_notebooks_in_zip(data)

    object_name = f"{project_id}/{upload_id}/{file.filename}"
    content_type = file.content_type or "application/octet-stream"
    s3_path = upload_file(BUCKET_USER_CODE, object_name, data, content_type)

    return {
        "filename": file.filename,
        "path": object_name,
        "s3_uri": s3_path,
        "size": len(data),
        "conversion": conversion,
        "notebook_conversions": notebook_conversions,
    }


class AnalyzeRequest(BaseModel):
    path: str                       # MinIO object name returned by /upload
    entry_script: str = ""          # optional, only used for .zip uploads


@router.post("/files/analyze")
async def analyze_uploaded_file(
    project_id: str,
    body: AnalyzeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Run the static code analyzer on an uploaded file.

    Purely advisory -- never blocks the user. The frontend renders the
    returned warnings so the user can fix issues before clicking Run.
    """
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == current_user.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    # Don't let the user analyze someone else's file: enforce the
    # project_id/ prefix the upload endpoint sets at line 41.
    if not body.path.startswith(f"{project_id}/"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Path does not belong to this project",
        )

    try:
        blob = get_file(BUCKET_USER_CODE, body.path)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"File not found in storage: {exc}",
        )

    filename = body.path.rsplit("/", 1)[-1]
    suffix = ("." + filename.rsplit(".", 1)[-1].lower()) if "." in filename else ""

    with tempfile.TemporaryDirectory(prefix="analyze-") as tmpdir:
        if suffix == ".zip":
            zip_path = os.path.join(tmpdir, filename)
            with open(zip_path, "wb") as fh:
                fh.write(blob)
            try:
                with zipfile.ZipFile(zip_path) as z:
                    z.extractall(tmpdir)
            except zipfile.BadZipFile:
                return {
                    "entry_script": "",
                    "warnings": [{
                        "code": "bad_zip",
                        "message": "Uploaded .zip is not a valid archive.",
                        "severity": "warn",
                        "line_no": None,
                        "snippet": None,
                    }],
                }
            os.remove(zip_path)
            target: str = tmpdir
        else:
            target = os.path.join(tmpdir, filename)
            with open(target, "wb") as fh:
                fh.write(blob)

        return code_analyzer.analyze(target, entry_hint=body.entry_script)


@router.get("/files")
async def list_files(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == current_user.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    files = list_objects(BUCKET_USER_CODE, prefix=f"{project_id}/")
    return {"files": files}
