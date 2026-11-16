import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.auth.dependencies import TenantContext, get_tenant_context
from app.modules.profiling.schemas import DataProfileResponse
from app.modules.profiling.service import get_dataset_profile, profile_dataset

router = APIRouter()


@router.post("/datasets/{dataset_id}/profile", response_model=DataProfileResponse)
async def run_profiling(
    dataset_id: uuid.UUID,
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> DataProfileResponse:
    profile = await profile_dataset(db=db, dataset_id=dataset_id, tenant=tenant)
    return DataProfileResponse.model_validate(profile)


@router.get("/datasets/{dataset_id}/profile", response_model=DataProfileResponse)
async def read_profile(
    dataset_id: uuid.UUID,
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> DataProfileResponse:
    profile = await get_dataset_profile(db=db, dataset_id=dataset_id, tenant=tenant)
    return DataProfileResponse.model_validate(profile)
