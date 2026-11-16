import re
import boto3
from botocore.client import Config
from app.core.config import get_settings


def _sanitize_segment(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._-]", "_", value)


def build_tenant_storage_key(
    tenant_type: str,
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    version_number: int,
    filename: str,
) -> str:
    safe_name = _sanitize_segment(filename)
    return (
        f"tenants/{_sanitize_segment(tenant_type)}_{_sanitize_segment(tenant_id)}"
        f"/projects/{_sanitize_segment(project_id)}"
        f"/datasets/{_sanitize_segment(dataset_id)}/v{version_number}/{safe_name}"
    )


def get_s3_client():
    settings = get_settings()
    scheme = "https" if settings.MINIO_SECURE else "http"
    return boto3.client(
        "s3",
        endpoint_url=f"{scheme}://{settings.MINIO_ENDPOINT}",
        aws_access_key_id=settings.MINIO_ACCESS_KEY,
        aws_secret_access_key=settings.MINIO_SECRET_KEY,
        config=Config(signature_version="s3v4"),
    )
