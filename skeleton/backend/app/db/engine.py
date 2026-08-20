"""SQLAlchemy 엔진 팩토리 (architecture.md §7).

PostgreSQL 세션 타임존을 Asia/Seoul 로 고정한다 (§10 KST 단일 기준).
SQLite(테스트) / PostgreSQL(운영) 양쪽을 지원한다.
"""
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.pool import StaticPool

from app.config import ENV_FILE, Settings


def postgres_connect_args() -> dict[str, str]:
    return {"options": "-c timezone=Asia/Seoul"}


def create_engine_from_settings(settings: Settings) -> Engine:
    # DATABASE_URL 미설정 시 조용한 폴백 없이 fail-fast 한다 (alembic/env.py 와 동일 정책).
    url = settings.database_url
    if not url:
        raise RuntimeError(f"DATABASE_URL 이 설정되지 않았습니다 ({ENV_FILE} 확인).")
    kwargs: dict = {}
    if url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
        if ":memory:" in url:
            kwargs["poolclass"] = StaticPool
    elif "postgresql" in url:
        kwargs["connect_args"] = postgres_connect_args()
    return create_engine(url, pool_pre_ping=True, **kwargs)
