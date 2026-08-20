"""테스트 공통 픽스처 (architecture.md §12).

DB 는 SQLite in-memory 를 쓰고, get_db 의존성을 오버라이드한다.
create_all 은 테스트에서만 허용된다 (§11 예외).
"""
import os

# app 모듈 임포트 전에 주입한다.
# - DATABASE_URL: 엔진이 fail-fast 하므로(app/db/engine.py) 임포트용 최소값. 실제 쿼리는 get_db 오버라이드가 담당.
# - SECRET_KEY: RFC 7518 최소 32 bytes 이상 — PyJWT InsecureKeyLengthWarning 방지.
os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-pytest-0123456789abcdef")

# 시드 설정은 setdefault 가 아니라 대입이다 — 개발자의 backend/.env 값이 새어 들어오면
# "지침대로 DEFAULT_ADMIN_PASSWORD 를 바꾼 사람만 테스트가 깨지는" 상태가 된다.
# 운영 기본값은 config.py 에서 꺼져 있고(seed_default_admin=False), 테스트는 여기서 명시적으로 켠다.
os.environ["APP_ENV"] = "test"
os.environ["SEED_DEFAULT_ADMIN"] = "true"
os.environ["DEFAULT_ADMIN_PASSWORD"] = "admin123"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.db.session as db_session_module  # noqa: E402
import app.models  # noqa: E402,F401
from app.config import get_settings  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.db.session import SESSION_OPTIONS  # noqa: E402
from app.dependencies import get_db  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(autouse=True)
def _clear_settings_cache():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def db_session_factory():
    """테스트 엔진에 바인딩된 세션 팩토리 (운영 SessionLocal 의 테스트 대역).

    lifespan 은 get_db 가 아니라 SessionLocal 을 직접 쓰므로(app/main.py) 팩토리 자체가
    필요하다 — lifespan_client 가 이것으로 SessionLocal 을 교체한다.

    세션 옵션은 운영과 동일해야 한다(SESSION_OPTIONS). 옵션이 갈리면 commit 이후 동작이
    테스트와 운영에서 달라져 테스트의 대표성이 깨진다.
    """
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    try:
        yield sessionmaker(bind=engine, **SESSION_OPTIONS)
    finally:
        Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db_session(db_session_factory):
    session = db_session_factory()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(db_session):
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def lifespan_client(db_session, db_session_factory, monkeypatch):
    """startup/shutdown 훅(lifespan)을 실제로 구동하는 클라이언트.

    Starlette TestClient 는 `with` 블록에 들어갈 때만 lifespan 을 돌린다. 기본 client 픽스처는
    시드가 불필요하므로 그대로 두고, 기동 훅(기본 관리자 시드·SECRET_KEY 경고)을 검증할 때만
    이 픽스처를 쓴다.
    """
    monkeypatch.setattr(db_session_module, "SessionLocal", db_session_factory)

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
