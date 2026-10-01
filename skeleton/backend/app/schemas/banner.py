"""배너 스키마 (ARCHITECTURE.md §8)."""

from datetime import datetime
from urllib.parse import urlsplit

from pydantic import BaseModel, Field, field_validator, model_validator

LINK_URL_MAX_LENGTH = 500


def validate_link_url(value: str | None) -> str | None:
    """http(s) 절대 URL 또는 "/" 로 시작하는 사이트 내부 경로만 허용한다. 빈 값은 None.

    javascript:·data: 같은 스킴, 프로토콜 상대 URL("//host"), 브라우저가 "//" 로 해석하는 "/\\host" 는 거부한다.
    """
    if value is None:
        return None
    value = value.strip()
    if not value:
        return None
    if any(ch.isspace() or ord(ch) < 0x20 or ord(ch) == 0x7F for ch in value):
        raise ValueError("링크 URL 에 공백·제어 문자를 넣을 수 없습니다.")
    if value.startswith("/"):
        if value.startswith(("//", "/\\")):
            raise ValueError("링크는 http(s) 주소 또는 / 로 시작하는 내부 경로만 쓸 수 있습니다.")
        return value
    parts = urlsplit(value)
    if parts.scheme.lower() not in ("http", "https") or not parts.netloc or "\\" in value:
        raise ValueError("링크는 http(s) 주소 또는 / 로 시작하는 내부 경로만 쓸 수 있습니다.")
    return value


def _to_local_naive(value: datetime | None) -> datetime | None:
    """오프셋이 붙은 시각은 프로세스 로컬 시각(KST 정책, §10)의 naive 로 바꾼다. naive 는 그대로."""
    if value is None or value.tzinfo is None:
        return value
    return value.astimezone().replace(tzinfo=None)


class BannerPublic(BaseModel):
    id: int
    title: str
    image_url: str
    width: int
    height: int
    link_url: str | None
    alt_text: str


class BannerAdminRead(BaseModel):
    id: int
    title: str
    image_key: str
    image_url: str
    image_width: int
    image_height: int
    link_url: str | None
    alt_text: str
    starts_at: datetime | None
    ends_at: datetime | None
    sort_order: int
    is_active: bool
    created_at: datetime
    updated_at: datetime


class BannerWrite(BaseModel):
    """생성(POST)·수정(PUT) 공통 본문 — PUT 은 전체 교체이고, sort_order 를 생략하면 생성 시 맨 뒤·수정 시 유지."""

    title: str = Field(min_length=1, max_length=200)
    image_key: str = Field(min_length=1, max_length=255)
    link_url: str | None = Field(default=None, max_length=LINK_URL_MAX_LENGTH)
    alt_text: str = Field(default="", max_length=200)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    sort_order: int | None = None
    is_active: bool = True

    @field_validator("title")
    @classmethod
    def _strip_title(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("제목을 입력하세요.")
        return v

    @field_validator("alt_text")
    @classmethod
    def _strip_alt(cls, v: str) -> str:
        return v.strip()

    @field_validator("link_url")
    @classmethod
    def _check_link(cls, v: str | None) -> str | None:
        return validate_link_url(v)

    @field_validator("starts_at", "ends_at")
    @classmethod
    def _naive(cls, v: datetime | None) -> datetime | None:
        return _to_local_naive(v)

    @model_validator(mode="after")
    def _check_window(self) -> "BannerWrite":
        if self.starts_at and self.ends_at and self.ends_at <= self.starts_at:
            raise ValueError("종료 시각은 시작 시각보다 뒤여야 합니다.")
        return self


class BannerOrder(BaseModel):
    """노출 순서 변경 — 나열한 id 가 앞에서부터 0,1,2… 가 되고 빠진 배너는 기존 순서대로 뒤에 붙는다."""

    ids: list[int] = Field(min_length=1, max_length=1000)

    @field_validator("ids")
    @classmethod
    def _unique(cls, v: list[int]) -> list[int]:
        if len(set(v)) != len(v):
            raise ValueError("id 가 중복되었습니다.")
        return v
