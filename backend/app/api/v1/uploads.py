import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_db
from app.models.project import Project
from app.models.user import User
from app.utils.minio_client import BUCKET_USER_CODE, upload_file, list_objects

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
    object_name = f"{project_id}/{upload_id}/{file.filename}"

    content_type = file.content_type or "application/octet-stream"
    s3_path = upload_file(BUCKET_USER_CODE, object_name, data, content_type)

    return {
        "filename": file.filename,
        "path": object_name,
        "s3_uri": s3_path,
        "size": len(data),
    }


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
