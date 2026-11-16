import hashlib
import io
import uuid
from datetime import datetime, timezone
from typing import Any

import pandas as pd
from botocore.exceptions import ClientError
from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.core.config import get_settings
from app.core.exceptions import AppError
from app.core.storage import build_tenant_storage_key, get_s3_client
from app.modules.auth.dependencies import TenantContext, assert_project_access
from app.modules.datasets.models import Dataset, DatasetColumn, DatasetVersion
from app.modules.projects.models import Project


def _infer_semantic_type(series: pd.Series) -> str:
    if pd.api.types.is_bool_dtype(series):
        return "boolean"
    if pd.api.types.is_numeric_dtype(series):
        return "numerical"
    if pd.api.types.is_datetime64_any_dtype(series):
        return "datetime"
    if series.dtype == object:
        non_null = series.dropna()
        if len(non_null) > 0:
            sample = non_null.head(50).astype(str)
            try:
                pd.to_datetime(sample, format="mixed", errors="raise")
                return "datetime"
            except (ValueError, TypeError):
                pass
            unique_ratio = non_null.nunique() / max(len(non_null), 1)
            if unique_ratio <= 0.5 or non_null.nunique() <= 50:
                return "categorical"
        return "text"
    return "categorical"


def _ensure_bucket(s3_client: Any, bucket: str) -> None:
    try:
        s3_client.head_bucket(Bucket=bucket)
    except ClientError:
        s3_client.create_bucket(Bucket=bucket)


def _put_s3_object(bucket: str, key: str, body: bytes, content_type: str) -> None:
    s3 = get_s3_client()
    _ensure_bucket(s3, bucket)
    s3.put_object(Bucket=bucket, Key=key, Body=body, ContentType=content_type)


def _get_s3_bytes(bucket: str, key: str) -> bytes:
    s3 = get_s3_client()
    obj = s3.get_object(Bucket=bucket, Key=key)
    return obj["Body"].read()


def _parse_csv_and_infer_columns(raw_bytes: bytes) -> tuple[int, int, list[tuple[str, str, str, int]]]:
    df = pd.read_csv(io.BytesIO(raw_bytes))
    row_count, col_count = df.shape
    cols: list[tuple[str, str, str, int]] = []
    for idx, col_name in enumerate(df.columns):
        cols.append((
            str(col_name),
            str(df[col_name].dtype),
            _infer_semantic_type(df[col_name]),
            idx,
        ))
    return row_count, col_count, cols


def _build_preview_slice(raw_bytes: bytes, limit: int, offset: int) -> tuple[int, list[str], list[dict[str, Any]]]:
    df = pd.read_csv(io.BytesIO(raw_bytes))
    slice_df = df.iloc[offset : offset + limit].copy()
    slice_df = slice_df.where(pd.notnull(slice_df), None)
    return int(len(df)), [str(c) for c in df.columns], slice_df.to_dict(orient="records")


async def _get_authorized_project(
    db: AsyncSession, project_id: uuid.UUID, tenant: TenantContext
) -> Project:
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if project is None:
        raise AppError("PROJECT_NOT_FOUND", "Project not found", status_code=404)
    assert_project_access(project.owner_user_id, project.org_id, tenant)
    return project


async def get_authorized_dataset(
    db: AsyncSession, dataset_id: uuid.UUID, tenant: TenantContext
) -> tuple[Dataset, Project]:
    result = await db.execute(
        select(Dataset).where(Dataset.id == dataset_id, Dataset.deleted_at.is_(None))
    )
    dataset = result.scalar_one_or_none()
    if dataset is None:
        raise AppError("DATASET_NOT_FOUND", "Dataset not found", status_code=404)
    project = await _get_authorized_project(db, dataset.project_id, tenant)
    return dataset, project


async def get_dataset_detail(
    db: AsyncSession, dataset_id: uuid.UUID, tenant: TenantContext
) -> tuple[Dataset, DatasetVersion, list[DatasetColumn]]:
    dataset, _ = await get_authorized_dataset(db, dataset_id, tenant)
    ver_result = await db.execute(
        select(DatasetVersion)
        .where(DatasetVersion.dataset_id == dataset.id)
        .order_by(DatasetVersion.version_number.desc())
        .limit(1)
    )
    version = ver_result.scalar_one_or_none()
    if version is None:
        raise AppError("VERSION_NOT_FOUND", "Dataset version not found", status_code=404)

    col_result = await db.execute(
        select(DatasetColumn)
        .where(DatasetColumn.dataset_version_id == version.id)
        .order_by(DatasetColumn.ordinal_position.asc())
    )
    columns = list(col_result.scalars().all())
    return dataset, version, columns


async def upload_csv_dataset(
    db: AsyncSession,
    project_id: uuid.UUID,
    tenant: TenantContext,
    file: UploadFile,
    dataset_name: str | None = None,
) -> tuple[Dataset, DatasetVersion, list[DatasetColumn]]:
    project = await _get_authorized_project(db, project_id, tenant)
    settings = get_settings()

    filename = file.filename or "dataset.csv"
    if not filename.lower().endswith(".csv"):
        raise AppError("UNSUPPORTED_FILE_TYPE", "Only .csv files are supported in MVP", status_code=415)

    raw_bytes = await file.read()
    size_bytes = len(raw_bytes)
    if size_bytes == 0:
        raise AppError("EMPTY_FILE", "Uploaded CSV file is empty", status_code=400)

    max_bytes = settings.MAX_UPLOAD_MB * 1024 * 1024
    if size_bytes > max_bytes:
        raise AppError(
            "FILE_TOO_LARGE",
            f"File exceeds maximum allowed size of {settings.MAX_UPLOAD_MB} MB",
            status_code=413,
        )

    try:
        row_count, col_count, inferred_cols = await run_in_threadpool(_parse_csv_and_infer_columns, raw_bytes)
    except Exception as exc:
        raise AppError("INVALID_CSV", f"Failed to parse CSV file: {exc}", status_code=400) from exc

    if col_count == 0:
        raise AppError("INVALID_CSV", "CSV contains no columns", status_code=400)
    if row_count > settings.MAX_ROW_COUNT:
        raise AppError(
            "ROW_LIMIT_EXCEEDED",
            f"Dataset has {row_count} rows, exceeding MVP limit of {settings.MAX_ROW_COUNT}",
            status_code=413,
        )

    dataset = Dataset(
        project_id=project.id,
        name=(dataset_name or filename).strip(),
        lifecycle_status="UPLOADED",
    )
    db.add(dataset)
    await db.flush()

    tenant_type = "org" if project.org_id else "user"
    tenant_id = str(project.org_id or project.owner_user_id)
    storage_key = build_tenant_storage_key(
        tenant_type=tenant_type,
        tenant_id=tenant_id,
        project_id=str(project.id),
        dataset_id=str(dataset.id),
        version_number=1,
        filename="original.csv",
    )

    await run_in_threadpool(_put_s3_object, settings.MINIO_BUCKET, storage_key, raw_bytes, "text/csv")

    sha256_hex = hashlib.sha256(raw_bytes).hexdigest()
    version = DatasetVersion(
        dataset_id=dataset.id,
        version_number=1,
        version_type="ORIGINAL",
        storage_key=storage_key,
        size_bytes=size_bytes,
        row_count=row_count,
        col_count=col_count,
        sha256=sha256_hex,
    )
    db.add(version)
    await db.flush()

    columns: list[DatasetColumn] = []
    for name, dtype_str, semantic_type, idx in inferred_cols:
        col = DatasetColumn(
            dataset_version_id=version.id,
            name=name,
            inferred_dtype=dtype_str,
            semantic_type=semantic_type,
            ordinal_position=idx,
        )
        db.add(col)
        columns.append(col)

    await db.commit()
    await db.refresh(dataset)
    await db.refresh(version)
    for col in columns:
        await db.refresh(col)
    return dataset, version, columns


async def list_project_datasets(
    db: AsyncSession, project_id: uuid.UUID, tenant: TenantContext
) -> list[Dataset]:
    await _get_authorized_project(db, project_id, tenant)
    result = await db.execute(
        select(Dataset)
        .where(Dataset.project_id == project_id, Dataset.deleted_at.is_(None))
        .order_by(Dataset.created_at.desc())
    )
    return list(result.scalars().all())


async def get_dataset_preview(
    db: AsyncSession,
    dataset_id: uuid.UUID,
    tenant: TenantContext,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    dataset, _ = await get_authorized_dataset(db, dataset_id, tenant)
    ver_result = await db.execute(
        select(DatasetVersion)
        .where(DatasetVersion.dataset_id == dataset.id)
        .order_by(DatasetVersion.version_number.desc())
        .limit(1)
    )
    version = ver_result.scalar_one_or_none()
    if version is None:
        raise AppError("VERSION_NOT_FOUND", "Dataset version not found", status_code=404)

    settings = get_settings()
    raw_bytes = await run_in_threadpool(_get_s3_bytes, settings.MINIO_BUCKET, version.storage_key)
    total_rows, cols, rows = await run_in_threadpool(_build_preview_slice, raw_bytes, limit, offset)

    return {
        "dataset_id": dataset.id,
        "version_id": version.id,
        "total_rows": total_rows,
        "limit": limit,
        "offset": offset,
        "columns": cols,
        "rows": rows,
    }


async def soft_delete_dataset(
    db: AsyncSession, dataset_id: uuid.UUID, tenant: TenantContext
) -> None:
    dataset, _ = await get_authorized_dataset(db, dataset_id, tenant)
    dataset.deleted_at = datetime.now(timezone.utc)
    await db.commit()
