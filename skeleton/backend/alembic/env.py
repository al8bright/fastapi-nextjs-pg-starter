"""Alembic 환경 (architecture.md §11).

- DB URL 은 app.config.get_settings() 에서 가져온다.
- import app.models 로 모든 모델을 로드한 뒤 Base.metadata 를 target 으로 한다.
- PostgreSQL 세션 타임존은 Asia/Seoul 로 고정한다 (§10).
"""
import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import create_engine
from sqlalchemy.pool import NullPool, StaticPool

backend_root = Path(__file__).resolve().parent.parent
if str(backend_root) not in sys.path:
    sys.path.insert(0, str(backend_root))

import app.models  # noqa: E402,F401  모든 모델 로드
from app.config import ENV_FILE, get_settings  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.db.engine import postgres_connect_args  # noqa: E402

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def get_url() -> str:
    url = get_settings().database_url
    if not url:
        raise RuntimeError(f"DATABASE_URL 이 설정되지 않았습니다 ({ENV_FILE} 확인).")
    return url


def _engine():
    url = get_url()
    kwargs: dict = {}
    if url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
        kwargs["poolclass"] = StaticPool if ":memory:" in url else NullPool
    elif "postgresql" in url:
        kwargs["connect_args"] = postgres_connect_args()
        kwargs["poolclass"] = NullPool
    else:
        kwargs["poolclass"] = NullPool
    return create_engine(url, **kwargs)


def run_migrations_offline() -> None:
    context.configure(
        url=get_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = _engine()
    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
