import uuid
from fastapi import APIRouter, Depends, File, Form, Query, Response, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.auth.dependencies import TenantContext, get_tenant_context
from app.modules.datasets.schemas import (
    DatasetColumnResponse,
    DatasetDetailResponse,
    DatasetListItemResponse,
    DatasetPreviewResponse,
    DatasetVersionResponse,
)
from app.modules.datasets.service import (
    get_dataset_detail,
    get_dataset_preview,
    list_project_datasets,
    soft_delete_dataset,
    upload_csv_dataset,
)

router = APIRouter()


@router.post(
    "/projects/{project_id}/datasets",
    response_model=DatasetDetailResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_dataset(
    project_id: uuid.UUID,
    file: UploadFile = File(...),
    name: str | None = Form(default=None),
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> DatasetDetailResponse:
    dataset, version, columns = await upload_csv_dataset(
        db=db,
        project_id=project_id,
        tenant=tenant,
        file=file,
        dataset_name=name,
    )
    return DatasetDetailResponse(
        id=dataset.id,
        project_id=dataset.project_id,
        name=dataset.name,
        lifecycle_status=dataset.lifecycle_status,
        created_at=dataset.created_at,
        latest_version=DatasetVersionResponse.model_validate(version),
        columns=[DatasetColumnResponse.model_validate(c) for c in columns],
    )


@router.get("/projects/{project_id}/datasets", response_model=list[DatasetListItemResponse])
async def list_datasets(
    project_id: uuid.UUID,
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> list[DatasetListItemResponse]:
    datasets = await list_project_datasets(db=db, project_id=project_id, tenant=tenant)
    return [DatasetListItemResponse.model_validate(d) for d in datasets]


@router.get("/datasets/{dataset_id}", response_model=DatasetDetailResponse)
async def read_dataset_detail(
    dataset_id: uuid.UUID,
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> DatasetDetailResponse:
    dataset, version, columns = await get_dataset_detail(db=db, dataset_id=dataset_id, tenant=tenant)
    return DatasetDetailResponse(
        id=dataset.id,
        project_id=dataset.project_id,
        name=dataset.name,
        lifecycle_status=dataset.lifecycle_status,
        created_at=dataset.created_at,
        latest_version=DatasetVersionResponse.model_validate(version),
        columns=[DatasetColumnResponse.model_validate(c) for c in columns],
    )


@router.get("/datasets/{dataset_id}/preview", response_model=DatasetPreviewResponse)
async def preview_dataset(
    dataset_id: uuid.UUID,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> DatasetPreviewResponse:
    data = await get_dataset_preview(
        db=db,
        dataset_id=dataset_id,
        tenant=tenant,
        limit=limit,
        offset=offset,
    )
    return DatasetPreviewResponse(**data)


@router.delete("/datasets/{dataset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_dataset(
    dataset_id: uuid.UUID,
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await soft_delete_dataset(db=db, dataset_id=dataset_id, tenant=tenant)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
