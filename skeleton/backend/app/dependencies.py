"""FastAPI 공통 의존성 (architecture.md §6) — 단일 파일."""
from collections.abc import Generator

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.core.security import decode_access_token
from app.db.session import SessionLocal
from app.models.user import User, UserRole
from app.services import user_service

_bearer = HTTPBearer(auto_error=False)


def get_db() -> Generator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_subject(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    settings: Settings = Depends(get_settings),
) -> str:
    """Bearer JWT 를 검증하고 subject(sub)를 반환한다 (architecture.md §9).

    실제 사용자 조회는 services 계층을 통해 구현한다.
    """
    cred_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="인증이 필요합니다.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if creds is None:
        raise cred_error
    payload = decode_access_token(creds.credentials, settings.secret_key)
    if payload is None or "sub" not in payload:
        raise cred_error
    return str(payload["sub"])


def get_current_user(
    subject: str = Depends(get_current_subject),
    db: Session = Depends(get_db),
) -> User:
    """JWT subject(=user id)로 현재 사용자를 조회한다 (architecture.md §6, §9)."""
    cred_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="인증이 필요합니다.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not subject.isdigit():
        raise cred_error
    user = user_service.get_by_id(db, int(subject))
    if user is None or not user.is_active:
        raise cred_error
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    """관리자 전용 의존성. 일반 사용자면 403."""
    if user.role != UserRole.ADMIN.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="관리자 권한이 필요합니다.",
        )
    return user
