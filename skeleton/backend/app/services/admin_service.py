"""관리자 서비스 — 대시보드 집계·사용자 관리·세션·로그인 스로틀 (ARCHITECTURE.md §8, §9).

사용자 권한·활성 변경 규칙:
- 관리자는 자기 자신을 강등·비활성화할 수 없다(self_modification, 409) — 실수로 관리 권한을 잃는 것을 막는다.
- 마지막 활성 관리자는 강등·비활성화할 수 없다(last_admin, 409) — 관리자가 0명이 되는 상태를 막는 최종 방어선.
- 비활성화하면 그 사용자의 살아 있는 세션을 모두 폐기한다 — access 토큰도 sid 검사로 즉시 401 이 된다.
"""

import logging
from datetime import timedelta

from sqlalchemy import case, func, inspect, or_, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.security import now
from app.models.auth_session import AuthSession, LoginThrottle
from app.models.banner import Banner
from app.models.notice import Notice
from app.models.user import User, UserRole
from app.schemas.admin import (
    AdminSessionRead,
    AdminUserRead,
    DashboardRead,
    LoginThrottleRead,
    NoticeCounts,
    UserCounts,
)
from app.schemas.common import Page
from app.services import banner_service, health_service, session_service
from app.services.exceptions import ServiceError

audit = logging.getLogger("app.audit")

# 로그인 스로틀 목록에 보일 "최근 실패" 범위. 잠금 중인 행은 기간과 무관하게 보인다.
RECENT_FAILURE_WINDOW = timedelta(hours=24)
LOGIN_THROTTLE_LIST_LIMIT = 200


def _escape_like(q: str) -> str:
    return q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _scalar_count(db: Session, stmt) -> int:
    return int(db.scalar(stmt) or 0)


# ---------------------------------------------------------------------------
# 대시보드
# ---------------------------------------------------------------------------


def _alembic_revision(db: Session) -> str | None:
    """적용된 Alembic 리비전. 테이블이 없으면 None — 실패 쿼리로 트랜잭션을 깨지 않게 먼저 존재를 확인한다."""
    try:
        if not inspect(db.get_bind()).has_table("alembic_version"):
            return None
        return db.scalar(text("SELECT version_num FROM alembic_version LIMIT 1"))
    except SQLAlchemyError:
        db.rollback()
        return None


def dashboard(db: Session) -> DashboardRead:
    current = now()
    total = _scalar_count(db, select(func.count()).select_from(User))
    active = _scalar_count(db, select(func.count()).select_from(User).where(User.is_active.is_(True)))
    published = _scalar_count(db, select(func.count()).select_from(Notice).where(Notice.is_published.is_(True)))
    notices_total = _scalar_count(db, select(func.count()).select_from(Notice))
    try:
        health_service.db_health(db)
        db_status = "ok"
    except SQLAlchemyError:
        db.rollback()
        db_status = "error"
    return DashboardRead(
        users=UserCounts(total=total, active=active, inactive=total - active),
        active_sessions=_scalar_count(
            db, select(func.count()).select_from(AuthSession).where(session_service.active_session_filter())
        ),
        locked_accounts=_scalar_count(
            db, select(func.count()).select_from(LoginThrottle).where(LoginThrottle.locked_until > current)
        ),
        notices=NoticeCounts(published=published, draft=notices_total - published),
        active_banners=_scalar_count(
            db, select(func.count()).select_from(Banner).where(banner_service.live_condition())
        ),
        db=db_status,
        alembic_revision=_alembic_revision(db),
    )


# ---------------------------------------------------------------------------
# 사용자
# ---------------------------------------------------------------------------


def _session_counts_subquery():
    return (
        select(AuthSession.user_id, func.count().label("cnt"))
        .where(session_service.active_session_filter())
        .group_by(AuthSession.user_id)
        .subquery()
    )


def _user_read(user: User, session_count: int) -> AdminUserRead:
    return AdminUserRead(
        id=user.id,
        username=user.username,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at,
        active_session_count=session_count,
    )


def list_users(db: Session, *, q: str | None, role: str | None, page: int, size: int) -> Page[AdminUserRead]:
    conditions = []
    q = (q or "").strip()
    if q:
        conditions.append(User.username.ilike(f"%{_escape_like(q)}%", escape="\\"))
    if role:
        conditions.append(User.role == role)
    counts = _session_counts_subquery()
    stmt = (
        select(User, func.coalesce(counts.c.cnt, 0))
        .outerjoin(counts, counts.c.user_id == User.id)
        .where(*conditions)
        .order_by(User.id.asc())
        .offset((page - 1) * size)
        .limit(size)
    )
    items = [_user_read(u, int(cnt)) for u, cnt in db.execute(stmt).all()]
    total = _scalar_count(db, select(func.count()).select_from(User).where(*conditions))
    return Page(items=items, total=total, page=page, size=size)


def _active_session_count(db: Session, user_id: int) -> int:
    return _scalar_count(
        db,
        select(func.count())
        .select_from(AuthSession)
        .where(AuthSession.user_id == user_id, session_service.active_session_filter()),
    )


def _get_user(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise ServiceError("not_found", "사용자를 찾을 수 없습니다.")
    return user


def update_user(
    db: Session, *, actor_id: int | None, user_id: int, role: str | None, is_active: bool | None
) -> AdminUserRead:
    """권한·활성 상태 변경. actor_id 는 요청한 관리자(None 이면 시스템 작업)."""
    user = _get_user(db, user_id)
    new_role = role if role is not None else user.role
    new_active = is_active if is_active is not None else user.is_active
    loses_admin = (
        user.role == UserRole.ADMIN.value and user.is_active and (new_role != UserRole.ADMIN.value or not new_active)
    )
    if loses_admin and actor_id == user.id:
        raise ServiceError("self_modification", "자기 자신의 관리자 권한을 해제하거나 비활성화할 수 없습니다.")
    if loses_admin:
        others = _scalar_count(
            db,
            select(func.count())
            .select_from(User)
            .where(User.role == UserRole.ADMIN.value, User.is_active.is_(True), User.id != user.id),
        )
        if others == 0:
            raise ServiceError("last_admin", "마지막 활성 관리자는 강등하거나 비활성화할 수 없습니다.")
    deactivating = user.is_active and not new_active
    user.role = new_role
    user.is_active = new_active
    if deactivating:
        session_service.revoke_all_for_user(db, user.id, commit=False)
    db.commit()
    db.refresh(user)
    audit.info(
        "관리자 사용자 변경: actor_id=%s user_id=%s role=%s is_active=%s", actor_id, user.id, user.role, user.is_active
    )
    return _user_read(user, _active_session_count(db, user.id))


def revoke_user_sessions(db: Session, user_id: int) -> int:
    _get_user(db, user_id)
    return session_service.revoke_all_for_user(db, user_id)


# ---------------------------------------------------------------------------
# 세션
# ---------------------------------------------------------------------------


def list_sessions(db: Session, *, user_id: int | None, page: int, size: int) -> Page[AdminSessionRead]:
    conditions = [session_service.active_session_filter()]
    if user_id is not None:
        conditions.append(AuthSession.user_id == user_id)
    stmt = (
        select(AuthSession, User.username)
        .join(User, User.id == AuthSession.user_id)
        .where(*conditions)
        .order_by(AuthSession.last_used_at.desc(), AuthSession.id.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    items = [
        AdminSessionRead(
            id=s.id,
            user_id=s.user_id,
            username=username,
            created_at=s.created_at,
            last_used_at=s.last_used_at,
            expires_at=s.expires_at,
        )
        for s, username in db.execute(stmt).all()
    ]
    total = _scalar_count(db, select(func.count()).select_from(AuthSession).where(*conditions))
    return Page(items=items, total=total, page=page, size=size)


def revoke_session(db: Session, session_id: int) -> None:
    if not session_service.revoke_by_id(db, session_id):
        raise ServiceError("not_found", "세션을 찾을 수 없습니다.")


# ---------------------------------------------------------------------------
# 로그인 스로틀
# ---------------------------------------------------------------------------


def list_login_throttles(db: Session) -> list[LoginThrottleRead]:
    """잠금 중이거나 최근(24시간) 실패가 있는 계정 — 잠금 먼저, 그다음 최근 실패 순."""
    current = now()
    is_locked = LoginThrottle.locked_until > current
    stmt = (
        select(LoginThrottle)
        .where(or_(is_locked, LoginThrottle.last_failed_at >= current - RECENT_FAILURE_WINDOW))
        .order_by(case((is_locked, 0), else_=1), LoginThrottle.last_failed_at.desc())
        .limit(LOGIN_THROTTLE_LIST_LIMIT)
    )
    return [
        LoginThrottleRead(
            username=t.username,
            failed_count=t.failed_count,
            locked_until=t.locked_until,
            last_failed_at=t.last_failed_at,
            is_locked=t.locked_until is not None and t.locked_until > current,
        )
        for t in db.execute(stmt).scalars().all()
    ]


def clear_login_throttle(db: Session, username: str) -> None:
    """잠금 해제·실패 카운트 초기화(행 삭제). 없으면 조용히 넘어간다(멱등)."""
    throttle = db.execute(select(LoginThrottle).where(LoginThrottle.username == username)).scalar_one_or_none()
    if throttle is None:
        return
    db.delete(throttle)
    db.commit()
    audit.info("로그인 잠금 해제(관리자): username=%s", username)
