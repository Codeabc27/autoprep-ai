import io
import uuid
from typing import Any

import numpy as np
import pandas as pd
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.core.config import get_settings
from app.core.exceptions import AppError
from app.core.storage import get_s3_client
from app.modules.auth.dependencies import TenantContext
from app.modules.datasets.models import DatasetVersion
from app.modules.datasets.service import get_authorized_dataset
from app.modules.profiling.models import DataProfile


def compute_dataframe_profile(df: pd.DataFrame) -> dict[str, Any]:
    row_count, col_count = df.shape
    duplicate_count = int(df.duplicated().sum())
    memory_bytes = int(df.memory_usage(deep=True).sum())

    missing_by_col: dict[str, Any] = {}
    for col in df.columns:
        miss = int(df[col].isna().sum())
        missing_by_col[str(col)] = {
            "missing_count": miss,
            "missing_pct": round((miss / max(row_count, 1)) * 100.0, 2),
        }

    columns_meta: dict[str, Any] = {}
    for col in df.columns:
        s = df[col]
        col_info: dict[str, Any] = {
            "dtype": str(s.dtype),
            "non_null": int(s.notna().sum()),
            "unique_count": int(s.nunique(dropna=True)),
        }
        if pd.api.types.is_numeric_dtype(s) and not pd.api.types.is_bool_dtype(s):
            clean = s.dropna()
            if len(clean) > 0:
                hist_counts, hist_edges = np.histogram(
                    clean.to_numpy(dtype=float), bins=min(10, max(1, clean.nunique()))
                )
                col_info.update({
                    "kind": "numerical",
                    "mean": round(float(clean.mean()), 4),
                    "median": round(float(clean.median()), 4),
                    "std": round(float(clean.std(ddof=1)) if len(clean) > 1 else 0.0, 4),
                    "min": round(float(clean.min()), 4),
                    "max": round(float(clean.max()), 4),
                    "q25": round(float(clean.quantile(0.25)), 4),
                    "q75": round(float(clean.quantile(0.75)), 4),
                    "histogram": {
                        "counts": [int(x) for x in hist_counts],
                        "edges": [round(float(x), 4) for x in hist_edges],
                    },
                })
            else:
                col_info["kind"] = "numerical"
        else:
            top = s.dropna().astype(str).value_counts().head(10)
            col_info.update({
                "kind": "categorical",
                "top_values": {str(k): int(v) for k, v in top.items()},
            })
        columns_meta[str(col)] = col_info

    num_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    corr_dict: dict[str, dict[str, float]] = {}
    if len(num_cols) >= 2:
        corr_df = df[num_cols].corr().fillna(0.0).round(4)
        corr_dict = {
            str(r): {str(c): float(corr_df.loc[r, c]) for c in corr_df.columns}
            for r in corr_df.index
        }

    return {
        "summary_stats": {
            "row_count": int(row_count),
            "col_count": int(col_count),
            "memory_bytes": memory_bytes,
            "columns": columns_meta,
        },
        "missing_summary": {
            "total_missing": int(df.isna().sum().sum()),
            "columns": missing_by_col,
        },
        "correlation_matrix": corr_dict,
        "duplicate_count": duplicate_count,
    }


def _fetch_and_profile(bucket: str, storage_key: str) -> dict[str, Any]:
    s3 = get_s3_client()
    obj = s3.get_object(Bucket=bucket, Key=storage_key)
    df = pd.read_csv(io.BytesIO(obj["Body"].read()))
    return compute_dataframe_profile(df)


async def profile_dataset(
    db: AsyncSession, dataset_id: uuid.UUID, tenant: TenantContext
) -> DataProfile:
    dataset, _ = await get_authorized_dataset(db, dataset_id, tenant)
    ver_res = await db.execute(
        select(DatasetVersion)
        .where(DatasetVersion.dataset_id == dataset.id)
        .order_by(DatasetVersion.version_number.desc())
        .limit(1)
    )
    version = ver_res.scalar_one_or_none()
    if version is None:
        raise AppError("VERSION_NOT_FOUND", "Dataset version not found", status_code=404)

    existing_res = await db.execute(
        select(DataProfile).where(DataProfile.dataset_version_id == version.id)
    )
    existing = existing_res.scalar_one_or_none()
    if existing is not None:
        return existing

    dataset.lifecycle_status = "INSPECTING"
    await db.commit()

    try:
        settings = get_settings()
        computed = await run_in_threadpool(_fetch_and_profile, settings.MINIO_BUCKET, version.storage_key)
    except Exception as exc:
        dataset.lifecycle_status = "FAILED"
        await db.commit()
        raise AppError("PROFILING_FAILED", f"Profiling failed: {exc}", status_code=422) from exc

    profile = DataProfile(
        dataset_version_id=version.id,
        summary_stats=computed["summary_stats"],
        missing_summary=computed["missing_summary"],
        correlation_matrix=computed["correlation_matrix"],
        duplicate_count=computed["duplicate_count"],
    )
    dataset.lifecycle_status = "PROFILED"
    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    return profile


async def get_dataset_profile(
    db: AsyncSession, dataset_id: uuid.UUID, tenant: TenantContext
) -> DataProfile:
    dataset, _ = await get_authorized_dataset(db, dataset_id, tenant)
    ver_res = await db.execute(
        select(DatasetVersion)
        .where(DatasetVersion.dataset_id == dataset.id)
        .order_by(DatasetVersion.version_number.desc())
        .limit(1)
    )
    version = ver_res.scalar_one_or_none()
    if version is None:
        raise AppError("VERSION_NOT_FOUND", "Dataset version not found", status_code=404)

    prof_res = await db.execute(
        select(DataProfile).where(DataProfile.dataset_version_id == version.id)
    )
    profile = prof_res.scalar_one_or_none()
    if profile is None:
        raise AppError("PROFILE_NOT_FOUND", "Dataset has not been profiled yet", status_code=404)
    return profile
