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
    access_token: str
    token_type: str = "bearer"


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    role: str
    is_active: bool
