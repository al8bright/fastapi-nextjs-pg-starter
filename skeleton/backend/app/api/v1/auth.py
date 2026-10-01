"""인증 라우터 (ARCHITECTURE.md §4, §9) — 얇은 HTTP 계층.

자체 계정 username/password 로그인 → access JWT + DB 세션 기반 refresh 토큰 발급.
회전(rotate)·폐기(revoke)·시도 제한의 도메인 로직은 services 에 있고, 여기서는
ServiceError 를 HTTP 상태로 변환만 한다.

refresh 토큰 전달 방식은 REFRESH_TOKEN_TRANSPORT 로 고른다 (§9).
- cookie: 백엔드가 httpOnly 쿠키로 심고 읽는다. 응답 본문의 refresh_token 은 null (브라우저 SPA).
- body:   JSON 본문으로 주고받는다. 쿠키를 쓰지 않는다 (BFF 가 자기 쿠키에 보관).
"""
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.core.security import create_token
from app.dependencies import get_current_user, get_db
from app.models.auth_session import AuthSession
from app.models.user import User
from app.schemas.user import (
    REFRESH_TOKEN_MAX_LENGTH,
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
    TokenResponse,
    UserRead,
)
from app.services import session_service, user_service
from app.services.exceptions import ServiceError

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE = "refresh_token"
# refresh/logout 에만 전송되도록 경로를 좁힌다 — 일반 API 요청에는 refresh 쿠키가 실리지 않는다.
REFRESH_COOKIE_PATH = "/api/v1/auth"


def _uses_cookie(settings: Settings) -> bool:
    return settings.refresh_token_transport == "cookie"


def _set_refresh_cookie(
    response: Response, *, refresh_plain: str, session: AuthSession, settings: Settings
) -> None:
    # 쿠키 수명 = 세션의 남은 절대 수명(응답의 refresh_expires_in 과 같은 값) — 회전해도 연장되지 않는다.
    response.set_cookie(
        REFRESH_COOKIE,
        refresh_plain,
        max_age=session_service.refresh_expires_in_seconds(session),
        path=REFRESH_COOKIE_PATH,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
    )


def _delete_refresh_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        REFRESH_COOKIE,
        path=REFRESH_COOKIE_PATH,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
    )


def _cookie_refresh_token(request: Request) -> str | None:
    """요청 쿠키의 refresh 토큰. 비었거나 비정상적으로 길면 None (본문 스키마와 같은 상한)."""
    raw = request.cookies.get(REFRESH_COOKIE)
    if not raw or len(raw) > REFRESH_TOKEN_MAX_LENGTH:
        return None
    return raw


def _require_body(body: RefreshRequest | LogoutRequest | None) -> str:
    """body 모드에서는 본문이 필수다 — 시그니처상 선택(쿠키 모드 422 방지)이라 여기서 422 를 낸다."""
    if body is None:
        raise RequestValidationError(
            [{"type": "missing", "loc": ("body",), "msg": "Field required", "input": None}]
        )
    return body.refresh_token


def _unauthorized_clearing_cookie(settings: Settings, detail: str) -> JSONResponse:
    """401 + refresh 쿠키 삭제. HTTPException 을 raise 하면 Set-Cookie 가 실리지 않으므로 직접 만든다."""
    response = JSONResponse(
        status_code=status.HTTP_401_UNAUTHORIZED,
        content={"detail": detail},
        headers={"WWW-Authenticate": "Bearer"},
    )
    _delete_refresh_cookie(response, settings)
    return response


def _token_pair_response(
    *,
    response: Response,
    user_id: int,
    session: AuthSession,
    refresh_plain: str,
    settings: Settings,
) -> TokenResponse:
    """로그인/리프레시 공통 응답 조립 — 두 경로의 응답 형태는 계약상 동일해야 한다.

    cookie 모드는 refresh 토큰을 쿠키로만 내보내고 본문에는 싣지 않는다(null).
    """
    token = create_token(
        subject=str(user_id),
        session_id=session.id,
        secret=settings.secret_key,
        expires_minutes=settings.access_token_expire_minutes,
    )
    if _uses_cookie(settings):
        _set_refresh_cookie(
            response, refresh_plain=refresh_plain, session=session, settings=settings
        )
    return TokenResponse(
        access_token=token,
        refresh_token=None if _uses_cookie(settings) else refresh_plain,
        expires_in=settings.access_token_expire_minutes * 60,
        refresh_expires_in=session_service.refresh_expires_in_seconds(session),
    )


@router.post("/login", response_model=TokenResponse)
def login(
    body: LoginRequest,
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> TokenResponse:
    try:
        user = user_service.authenticate(db, body.username, body.password)
    except ServiceError as e:
        if e.code == "too_many_attempts":
            # Retry-After(초) — 클라이언트가 잠금 해제 시점을 알 수 있게 한다 (RFC 9110 §10.2.3).
            headers = {"Retry-After": str(e.retry_after)} if e.retry_after else None
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=e.message,
                headers=headers,
            ) from e
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=e.message,
            headers={"WWW-Authenticate": "Bearer"},
        ) from e
    session, refresh_plain = session_service.create_session(db, user_id=user.id)
    return _token_pair_response(
        response=response,
        user_id=user.id,
        session=session,
        refresh_plain=refresh_plain,
        settings=settings,
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh(
    request: Request,
    response: Response,
    body: RefreshRequest | None = None,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> TokenResponse | Response:
    if _uses_cookie(settings):
        # cookie 모드는 본문을 보지 않는다 — refresh 토큰은 쿠키로만 받는다.
        # 실패(쿠키 없음/형식 오류/만료/폐기/재사용)는 원인 무관 401 + 쿠키 삭제다.
        refresh_token = _cookie_refresh_token(request)
        if refresh_token is None:
            return _unauthorized_clearing_cookie(settings, session_service.INVALID_REFRESH_MESSAGE)
        try:
            session, refresh_plain = session_service.rotate(db, refresh_token)
        except ServiceError as e:
            return _unauthorized_clearing_cookie(settings, e.message)
    else:
        refresh_token = _require_body(body)
        try:
            session, refresh_plain = session_service.rotate(db, refresh_token)
        except ServiceError as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=e.message,
                headers={"WWW-Authenticate": "Bearer"},
            ) from e
    return _token_pair_response(
        response=response,
        user_id=session.user_id,
        session=session,
        refresh_plain=refresh_plain,
        settings=settings,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request,
    body: LogoutRequest | None = None,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> Response:
    # 인증 불요 — refresh 토큰 "소지" 가 폐기 권한이다(session_service.revoke 가 해시 검증).
    # 어떤 입력에도 204 로 멱등 응답해 토큰 상태를 탐침할 수 없게 한다.
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    if _uses_cookie(settings):
        refresh_token = _cookie_refresh_token(request)
        if refresh_token is not None:
            session_service.revoke(db, refresh_token)
        _delete_refresh_cookie(response, settings)
    else:
        session_service.revoke(db, _require_body(body))
    return response


@router.get("/me", response_model=UserRead)
def me(current: User = Depends(get_current_user)) -> User:
    return current
