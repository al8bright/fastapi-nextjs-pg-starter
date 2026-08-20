"""인증 라우터 (architecture.md §4, §9) — 얇은 HTTP 계층.

자체 계정 username/password 로그인 → access JWT 발급.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.core.security import create_token
from app.dependencies import get_current_user, get_db
from app.models.user import User
from app.schemas.user import LoginRequest, TokenResponse, UserRead
from app.services import user_service
from app.services.exceptions import ServiceError

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(
    body: LoginRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> TokenResponse:
    try:
        user = user_service.authenticate(db, body.username, body.password)
    except ServiceError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=e.message,
            headers={"WWW-Authenticate": "Bearer"},
        ) from e
    token = create_token(
        subject=str(user.id),
        secret=settings.secret_key,
        expires_minutes=settings.access_token_expire_minutes,
    )
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserRead)
def me(current: User = Depends(get_current_user)) -> User:
    return current
