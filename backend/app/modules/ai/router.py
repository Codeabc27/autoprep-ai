import uuid
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import AppError
from app.modules.ai.models import AIConversation, AIRecommendation
from app.modules.ai.schemas import AIRecommendationResponse, AIRecommendRequest
from app.modules.ai.service import recommend_plan_with_gemini
from app.modules.auth.dependencies import TenantContext, get_tenant_context
from app.modules.profiling.service import get_dataset_profile

router = APIRouter()


@router.post("/projects/{project_id}/ai/recommend", response_model=AIRecommendationResponse)
async def recommend_workflow(
    project_id: uuid.UUID,
    payload: AIRecommendRequest,
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> AIRecommendationResponse:
    profile = await get_dataset_profile(db=db, dataset_id=payload.dataset_id, tenant=tenant)
    plan = await recommend_plan_with_gemini(
        profile_summary=profile.summary_stats,
        missing_summary=profile.missing_summary,
        duplicate_count=profile.duplicate_count,
        user_prompt=payload.prompt,
    )

    conv = AIConversation(project_id=project_id, user_id=tenant.user_id)
    db.add(conv)
    await db.flush()

    rec = AIRecommendation(
        conversation_id=conv.id,
        user_prompt=payload.prompt,
        proposed_plan=plan.model_dump(),
        explanation=plan.explanation,
        approval_status="PENDING",
    )
    db.add(rec)
    await db.commit()
    await db.refresh(rec)
    return AIRecommendationResponse.model_validate(rec)


@router.post("/ai/recommendations/{rec_id}/approve", response_model=AIRecommendationResponse)
async def approve_recommendation(
    rec_id: uuid.UUID,
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> AIRecommendationResponse:
    res = await db.execute(select(AIRecommendation).where(AIRecommendation.id == rec_id))
    rec = res.scalar_one_or_none()
    if rec is None:
        raise AppError("RECOMMENDATION_NOT_FOUND", "AI recommendation not found", status_code=404)
    conv_res = await db.execute(select(AIConversation).where(AIConversation.id == rec.conversation_id))
    conv = conv_res.scalar_one()
    if conv.user_id != tenant.user_id:
        raise AppError("FORBIDDEN", "Not authorized to approve this recommendation", status_code=403)
    rec.approval_status = "APPROVED"
    await db.commit()
    await db.refresh(rec)
    return AIRecommendationResponse.model_validate(rec)
