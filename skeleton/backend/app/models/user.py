"""사용자 모델 (architecture.md §8).

자체 계정 인증용 users 테이블. role 로 일반/관리자를 구분한다.
"""
import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, func, true
from sqlalchemy.orm import Mapped, mapped_column

from app.core.security import now
from app.db.base import Base


class UserRole(str, enum.Enum):
    """사용자 권한 (str 상속 — DB 에는 값 문자열로 저장)."""

    USER = "user"
    ADMIN = "admin"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(
        String(20), default=UserRole.USER.value, server_default=UserRole.USER.value
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
    # server_default: ORM 외 경로(psql 수동 INSERT, ETL)의 NOT NULL 위반 방지.
    # DB 세션 timezone 이 Asia/Seoul 이므로(engine.py) DB-side now() 도 KST 기준이다.
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now, server_default=func.now())

    @property
    def is_admin(self) -> bool:
        return self.role == UserRole.ADMIN.value
