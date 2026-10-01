"""공지사항 모델 (ARCHITECTURE.md §8).

- Notice: 본문(body_html)은 저장 전에 서비스 계층이 sanitize_html 로 정화한 HTML 이다.
  published_at 은 처음 게시될 때 한 번 정해지고, 게시를 내렸다 다시 올려도 유지된다.
- NoticeAttachment: 첨부 파일 메타데이터. 파일 자체는 UPLOAD_DIR/private/attachments 에
  무작위 이름으로 있고(storage_key), 사용자가 올린 파일명은 original_name 에만 둔다.
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, false, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.security import now
from app.db.base import Base


class Notice(Base):
    __tablename__ = "notices"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(200))
    body_html: Mapped[str] = mapped_column(Text)
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    view_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    # 작성자 계정이 지워져도 공지는 남는다(SET NULL).
    author_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    # server_default: ORM 외 경로(psql 수동 INSERT, ETL)의 NOT NULL 위반 방지 (users 와 동일 정책).
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now, server_default=func.now())

    # 공지 삭제 시 첨부 행도 지운다 — ORM cascade.
    # SQLite(테스트)는 FK 를 강제하지 않으므로 DB 의 ON DELETE CASCADE 에만 기대지 않는다.
    attachments: Mapped[list["NoticeAttachment"]] = relationship(
        back_populates="notice",
        cascade="all, delete-orphan",
        order_by="NoticeAttachment.id",
    )


class NoticeAttachment(Base):
    __tablename__ = "notice_attachments"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    notice_id: Mapped[int] = mapped_column(ForeignKey("notices.id", ondelete="CASCADE"), index=True)
    storage_key: Mapped[str] = mapped_column(String(255))
    original_name: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now, server_default=func.now())

    notice: Mapped[Notice] = relationship(back_populates="attachments")
