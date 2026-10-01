"""관리자 스키마 — 대시보드·사용자·세션·로그인 스로틀 (ARCHITECTURE.md §8)."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

# UserRole(models/user.py) 값과 같아야 한다.
RoleValue = Literal["user", "admin"]


class UserCounts(BaseModel):
    total: int
    active: int
    inactive: int


class NoticeCounts(BaseModel):
    published: int
    draft: int


class DashboardRead(BaseModel):
    users: UserCounts
    active_sessions: int
    locked_accounts: int
    notices: NoticeCounts
    active_banners: int
    db: Literal["ok", "error"]
    # 적용된 Alembic 리비전. alembic_version 테이블이 없으면(테스트 DB 등) None.
    alembic_revision: str | None


class AdminUserRead(BaseModel):
    id: int
    username: str
    role: str
    is_active: bool
    created_at: datetime
    active_session_count: int


class AdminUserUpdate(BaseModel):
    """부분 수정 — 보낸 필드만 바꾼다."""

    role: RoleValue | None = None
    is_active: bool | None = None


class AdminSessionRead(BaseModel):
    id: int
    user_id: int
    username: str
    created_at: datetime
    last_used_at: datetime
    expires_at: datetime


class RevokedCount(BaseModel):
    revoked: int


class LoginThrottleRead(BaseModel):
    username: str
    failed_count: int
    locked_until: datetime | None
    last_failed_at: datetime
    is_locked: bool
