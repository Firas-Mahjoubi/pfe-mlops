import io
from minio import Minio
from minio.error import S3Error

from app.config import settings

BUCKET_USER_CODE = "user-code"
BUCKET_MODELS = "models"
BUCKET_MLFLOW = "mlflow-artifacts"


def get_minio_client() -> Minio:
    return Minio(
        settings.MINIO_ENDPOINT,
        access_key=settings.MINIO_ACCESS_KEY,
        secret_key=settings.MINIO_SECRET_KEY,
        secure=settings.MINIO_SECURE,
    )


def ensure_bucket(client: Minio, bucket_name: str) -> None:
    if not client.bucket_exists(bucket_name):
        client.make_bucket(bucket_name)


def upload_file(
    bucket: str,
    object_name: str,
    data: bytes,
    content_type: str = "application/octet-stream",
) -> str:
    client = get_minio_client()
    ensure_bucket(client, bucket)
    client.put_object(
        bucket,
        object_name,
        io.BytesIO(data),
        length=len(data),
        content_type=content_type,
    )
    return f"s3://{bucket}/{object_name}"


def list_objects(bucket: str, prefix: str) -> list[dict]:
    client = get_minio_client()
    try:
        objects = client.list_objects(bucket, prefix=prefix, recursive=True)
        return [
            {
                "name": obj.object_name.split("/")[-1],
                "path": obj.object_name,
                "size": obj.size,
                "last_modified": obj.last_modified.isoformat() if obj.last_modified else None,
            }
            for obj in objects
        ]
    except S3Error:
        return []


def get_file(bucket: str, object_name: str) -> bytes:
    client = get_minio_client()
    response = client.get_object(bucket, object_name)
    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()


def delete_file(bucket: str, object_name: str) -> None:
    client = get_minio_client()
    client.remove_object(bucket, object_name)
