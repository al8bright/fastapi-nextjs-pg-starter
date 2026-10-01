"""공지사항 스키마 (ARCHITECTURE.md §8).

body_html 은 입력 그대로 믿지 않는다 — 정화(sanitize_html)와 빈 본문 판정은 서비스 계층이 저장 직전에 한다.
"""

from datetime import datetime

from pydantic import BaseModel, Field, field_validator

# 본문 HTML 상한(문자 수) — 이미지는 URL 로만 들어가므로(base64 금지) 이 정도면 충분하다.
BODY_HTML_MAX_LENGTH = 200_000


class AttachmentRead(BaseModel):
    id: int
    original_name: str
    size_bytes: int
    content_type: str
    download_url: str


class NoticeListItem(BaseModel):
    """공개 목록 항목."""

    id: int
    title: str
    is_pinned: bool
    published_at: datetime | None
    view_count: int
    has_attachments: bool


class NoticeDetail(BaseModel):
    """공개 상세 — body_html 은 저장 시 정화된 HTML 이다."""

    id: int
    title: str
    body_html: str
    is_pinned: bool
    published_at: datetime | None
    view_count: int
    created_at: datetime
    updated_at: datetime
    attachments: list[AttachmentRead]


class AdminNoticeListItem(BaseModel):
    id: int
    title: str
    is_pinned: bool
    is_published: bool
    published_at: datetime | None
    view_count: int
    has_attachments: bool
    author_id: int | None
    author_username: str | None
    created_at: datetime
    updated_at: datetime


class AdminNoticeDetail(AdminNoticeListItem):
    body_html: str
    attachments: list[AttachmentRead]


class NoticeWrite(BaseModel):
    """생성(POST)·수정(PUT) 공통 본문 — PUT 은 전체 교체다."""

    title: str = Field(min_length=1, max_length=200)
    body_html: str = Field(max_length=BODY_HTML_MAX_LENGTH)
    is_pinned: bool = False
    is_published: bool = False

    @field_validator("title")
    @classmethod
    def _strip_title(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("제목을 입력하세요.")
        return v
