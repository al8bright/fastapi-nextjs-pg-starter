"""사용자/인증 스키마 (architecture.md §8) — Pydantic v2."""
from pydantic import BaseModel, ConfigDict, Field, field_validator

# 상한의 SSOT 는 해시 생성 지점(core.security)이다. 여기서는 같은 불변식을 HTTP 입력에 미리 적용해
# 절단된 비밀번호가 동일 판정되는 착시를 막고 422 로 거부한다.
from app.core.security import BCRYPT_MAX_PASSWORD_BYTES


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("password")
    @classmethod
    def password_within_bcrypt_limit(cls, v: str) -> str:
        if len(v.encode("utf-8")) > BCRYPT_MAX_PASSWORD_BYTES:
            raise ValueError(f"비밀번호는 UTF-8 기준 {BCRYPT_MAX_PASSWORD_BYTES} bytes 이하여야 합니다.")
        return v


class TokenResponse(BaseModel):
    """로그인/리프레시 공통 응답 — 회전된 토큰 쌍과 각각의 유효 초.

    expires_in/refresh_expires_in 은 절대 시각이 아니라 "지금부터 남은 초" 다
    — 클라이언트가 서버와 시계를 맞출 필요 없이 갱신 시점을 계산할 수 있게 한다.
    """

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    refresh_expires_in: int


# refresh 토큰 형식은 "<sid>.<urlsafe 43자>" (core.security). 상한은 형식 SSOT 에 맞춘
# 엄밀값이 아니라 비정상 입력으로 SHA-256 를 대용량 문자열에 돌리지 않게 하는 방어선이다.
_REFRESH_TOKEN_MAX_LENGTH = 128


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=1, max_length=_REFRESH_TOKEN_MAX_LENGTH)


class LogoutRequest(BaseModel):
    refresh_token: str = Field(min_length=1, max_length=_REFRESH_TOKEN_MAX_LENGTH)


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    role: str
    is_active: bool
