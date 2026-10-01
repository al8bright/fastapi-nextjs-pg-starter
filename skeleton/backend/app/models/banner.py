"""배너 모델 (ARCHITECTURE.md §8).

공개 노출 조건: is_active 이고 (starts_at 이 없거나 ≤ 현재) 이고 (ends_at 이 없거나 > 현재) — 현재는 KST naive.
이미지는 UPLOAD_DIR/public/banners 의 파일(image_key)이며 크기는 업로드 시 서버가 잰 값이다.
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, func, true
from sqlalchemy.orm import Mapped, mapped_column

from app.core.security import now
from app.db.base import Base


class Banner(Base):
    __tablename__ = "banners"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(200))
    image_key: Mapped[str] = mapped_column(String(255))
    image_width: Mapped[int] = mapped_column(Integer)
    image_height: Mapped[int] = mapped_column(Integer)
    # http(s) 절대 URL 또는 "/" 로 시작하는 사이트 내부 경로만 (schemas/banner.py 에서 검증).
    link_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    alt_text: Mapped[str] = mapped_column(String(200), default="", server_default="")
    starts_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now, server_default=func.now())
