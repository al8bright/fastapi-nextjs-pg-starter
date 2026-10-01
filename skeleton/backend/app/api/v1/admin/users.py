"""관리자 — 사용자·세션·로그인 스로틀 라우터 (얇은 HTTP 계층)."""

from fastapi import APIRouter, Depends, Path, Query, Response, status
from sqlalchemy.orm import Session

from app.dependencies import get_db, require_admin
from app.models.user import User
from app.schemas.admin import (
    AdminSessionRead,
    AdminUserRead,
    AdminUserUpdate,
    LoginThrottleRead,
    RevokedCount,
    RoleValue,
)
from app.schemas.common import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, MAX_QUERY_LENGTH, Page
from app.services import admin_service

router = APIRouter()


@router.get("/users", response_model=Page[AdminUserRead])
def list_users(
    q: str | None = Query(None, max_length=MAX_QUERY_LENGTH),
    role: RoleValue | None = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    db: Session = Depends(get_db),
) -> Page[AdminUserRead]:
    return admin_service.list_users(db, q=q, role=role, page=page, size=size)


@router.patch("/users/{user_id}", response_model=AdminUserRead)
def update_user(
    user_id: int,
    body: AdminUserUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> AdminUserRead:
    return admin_service.update_user(db, actor_id=admin.id, user_id=user_id, role=body.role, is_active=body.is_active)


@router.delete("/users/{user_id}/sessions", response_model=RevokedCount)
def revoke_user_sessions(user_id: int, db: Session = Depends(get_db)) -> RevokedCount:
    return RevokedCount(revoked=admin_service.revoke_user_sessions(db, user_id))


@router.get("/sessions", response_model=Page[AdminSessionRead])
def list_sessions(
    user_id: int | None = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    db: Session = Depends(get_db),
) -> Page[AdminSessionRead]:
    return admin_service.list_sessions(db, user_id=user_id, page=page, size=size)


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_session(session_id: int, db: Session = Depends(get_db)) -> Response:
    admin_service.revoke_session(db, session_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/login-throttles", response_model=list[LoginThrottleRead])
def list_login_throttles(db: Session = Depends(get_db)) -> list[LoginThrottleRead]:
    return admin_service.list_login_throttles(db)


@router.delete("/login-throttles/{username}", status_code=status.HTTP_204_NO_CONTENT)
def clear_login_throttle(username: str = Path(min_length=1, max_length=50), db: Session = Depends(get_db)) -> Response:
    admin_service.clear_login_throttle(db, username)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
