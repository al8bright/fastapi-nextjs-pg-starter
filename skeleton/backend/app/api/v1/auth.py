"""인증 라우터 (architecture.md §4, §9) — 얇은 HTTP 계층.

자체 계정 username/password 로그인 → access JWT + DB 세션 기반 refresh 토큰 발급.
회전(rotate)·폐기(revoke)·시도 제한의 도메인 로직은 services 에 있고, 여기서는
ServiceError 를 HTTP 상태로 변환만 한다.
"""
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.core.security import create_token
from app.dependencies import get_current_user, get_db
from app.models.auth_session import AuthSession
from app.models.user import User
from app.schemas.user import LoginRequest, LogoutRequest, RefreshRequest, TokenResponse, UserRead
from app.services import session_service, user_service
from app.services.exceptions import ServiceError

router = APIRouter(prefix="/auth", tags=["auth"])


def _token_pair_response(
    *, user_id: int, session: AuthSession, refresh_plain: str, settings: Settings
) -> TokenResponse:
    """로그인/리프레시 공통 응답 조립 — 두 경로의 응답 형태는 계약상 동일해야 한다."""
    token = create_token(
        subject=str(user_id),
        session_id=session.id,
        secret=settings.secret_key,
        expires_minutes=settings.access_token_expire_minutes,
    )
    return TokenResponse(
        access_token=token,
        refresh_token=refresh_plain,
        expires_in=settings.access_token_expire_minutes * 60,
        refresh_expires_in=session_service.refresh_expires_in_seconds(session),
    )


@router.post("/login", response_model=TokenResponse)
def login(
    body: LoginRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> TokenResponse:
    try:
        user = user_service.authenticate(db, body.username, body.password)
    except ServiceError as e:
        if e.code == "too_many_attempts":
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=e.message,
            ) from e
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=e.message,
            headers={"WWW-Authenticate": "Bearer"},
        ) from e
    session, refresh_plain = session_service.create_session(db, user_id=user.id)
    return _token_pair_response(
        user_id=user.id, session=session, refresh_plain=refresh_plain, settings=settings
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh(
    body: RefreshRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> TokenResponse:
    try:
        session, refresh_plain = session_service.rotate(db, body.refresh_token)
    except ServiceError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=e.message,
            headers={"WWW-Authenticate": "Bearer"},
        ) from e
    return _token_pair_response(
        user_id=session.user_id, session=session, refresh_plain=refresh_plain, settings=settings
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(body: LogoutRequest, db: Session = Depends(get_db)) -> Response:
    # 인증 불요 — refresh 토큰 "소지" 가 폐기 권한이다(session_service.revoke 가 해시 검증).
    # 어떤 입력에도 204 로 멱등 응답해 토큰 상태를 탐침할 수 없게 한다.
    session_service.revoke(db, body.refresh_token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=UserRead)
def me(current: User = Depends(get_current_user)) -> User:
    return current
