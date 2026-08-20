"""샘플 모델 (architecture.md §8).

스캐폴드 직후 DB/테이블 연결을 검증하기 위한 최소 테이블.
실제 도메인 모델을 추가하면서 이 파일은 교체/삭제해도 된다.
"""
from datetime import datetime

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.security import now
from app.db.base import Base


class AppMeta(Base):
    __tablename__ = "app_meta"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    key: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    value: Mapped[str] = mapped_column(String(500))
    # server_default: ORM 외 경로(psql 수동 INSERT, ETL)의 NOT NULL 위반 방지 (users 와 동일 정책).
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now, server_default=func.now())
