import uuid
import pytest
from app.core.exceptions import AppError
from app.modules.auth.dependencies import TenantContext, assert_project_access


def test_tenant_isolation_allows_owner():
    user_id = uuid.uuid4()
    tenant = TenantContext(user_id=user_id, email="owner@example.com", platform_role="individual")
    assert_project_access(owner_user_id=user_id, org_id=None, tenant=tenant)


def test_tenant_isolation_blocks_other_user():
    owner_id = uuid.uuid4()
    intruder_id = uuid.uuid4()
    intruder = TenantContext(user_id=intruder_id, email="other@example.com", platform_role="individual")
    with pytest.raises(AppError) as exc_info:
        assert_project_access(owner_user_id=owner_id, org_id=None, tenant=intruder)
    assert exc_info.value.status_code == 403
