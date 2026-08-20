"""요청 단위 DB 세션 (architecture.md §7).

엔진/세션 팩토리는 .env 의 DATABASE_URL 로부터 모듈 로드 시 1회 생성한다.
"""
from typing import Any

from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings
from app.db.engine import create_engine_from_settings

# 세션 의미론의 단일 출처 — 테스트 픽스처(tests/conftest.py)도 이것을 import 해서 쓴다.
# 옵션이 갈리면 commit 이후 동작이 테스트와 운영에서 달라진다(§12 격리의 전제, §18 중복 제거).
SESSION_OPTIONS: dict[str, Any] = {
    "autoflush": False,
    "autocommit": False,
    "expire_on_commit": False,
}

engine = create_engine_from_settings(get_settings())
SessionLocal: sessionmaker[Session] = sessionmaker(bind=engine, **SESSION_OPTIONS)
