"""FastAPI 공통 의존성 (architecture.md §6) — 단일 파일."""
from collections.abc import Generator

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.core.security import decode_access_token
from app.db.session import SessionLocal
from app.models.user import User, UserRole
from app.services import session_service, user_service

_bearer = HTTPBearer(auto_error=False)


def get_db() -> Generator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_token_payload(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Bearer JWT 를 검증하고 페이로드를 반환한다 (architecture.md §9).

    sub(사용자)와 sid(세션) 두 클레임이 모두 있어야 한다 — sid 가 없으면 세션 폐기 검사를
    우회하는 토큰이 되므로 구형/변조 토큰은 여기서 거부한다.
    """
    cred_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="인증이 필요합니다.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if creds is None:
        raise cred_error
    payload = decode_access_token(creds.credentials, settings.secret_key)
    if payload is None or "sub" not in payload or "sid" not in payload:
        raise cred_error
    return payload


def get_current_user(
    payload: dict = Depends(get_token_payload),
    db: Session = Depends(get_db),
) -> User:
    """JWT sub(=user id)로 현재 사용자를 조회한다 (architecture.md §6, §9).

    sid 세션이 폐기·만료됐으면 access 토큰이 아직 만료 전이어도 401 이다
    — 로그아웃·강제 폐기의 즉시 무효화가 이 검사에서 실현된다.
    """
    cred_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="인증이 필요합니다.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    subject = str(payload["sub"])
    if not subject.isdigit():
        raise cred_error
    if not isinstance(payload["sid"], int) or not session_service.is_active_session(db, payload["sid"]):
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
