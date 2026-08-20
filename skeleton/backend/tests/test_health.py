"""헬스 체크 테스트 (architecture.md §12, §18 TDD)."""
from app.db.base import Base


def test_health_ok(client):
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_health_db_ok(client):
    res = client.get("/api/v1/health/db")
    assert res.status_code == 200
    body = res.json()
    assert body["db"] == "ok"
    assert body["table"] == "app_meta"
    # 시드가 추가돼도 깨지지 않도록 정확한 행 수 대신 형식만 단언한다.
    assert isinstance(body["rows"], int)
    assert body["rows"] >= 0


def test_health_db_failure_returns_503(client, db_session):
    # 테이블을 지워 DB 접근 실패를 재현 — unhandled 500 이 아니라 구조화된 503 이어야 한다.
    Base.metadata.drop_all(bind=db_session.get_bind())
    res = client.get("/api/v1/health/db")
    assert res.status_code == 503
    assert res.json()["db"] == "error"
