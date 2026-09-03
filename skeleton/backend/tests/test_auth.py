"""인증 유저플로우 테스트 (architecture.md §12)."""
import time

import jwt
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

import app.db.session as db_session_module
from app.config import get_settings
from app.core.security import BCRYPT_MAX_PASSWORD_BYTES, create_token, hash_password, verify_password
from app.dependencies import get_db, require_admin
from app.main import app
from app.services import session_service, user_service
from app.services.exceptions import ServiceError


def _issue_token(subject: str, *, session_id: int, expires_minutes: int = 5) -> str:
    return create_token(
        subject=subject,
        session_id=session_id,
        secret=get_settings().secret_key,
        expires_minutes=expires_minutes,
    )


def _session_for(db_session, user) -> int:
    """직접 발급하는 토큰 테스트용 — 살아 있는 세션 행을 만들고 id 를 반환한다."""
    session, _ = session_service.create_session(db_session, user_id=user.id)
    return session.id


def test_ensure_admin_seeds_default_admin(db_session):
    password = get_settings().default_admin_password
    user_service.ensure_admin(db_session, password=password)
    admin = user_service.get_by_username(db_session, "admin")
    assert admin is not None
    assert admin.role == "admin"
    # 멱등성: 두 번 호출해도 중복 생성하지 않는다.
    user_service.ensure_admin(db_session, password=password)
    assert user_service.get_by_username(db_session, "admin") is not None


def test_login_success_returns_token(client, db_session):
    user_service.ensure_admin(db_session, password=get_settings().default_admin_password)
    res = client.post("/api/v1/auth/login", json={"username": "admin", "password": "admin123"})
    assert res.status_code == 200
    body = res.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]


def test_login_wrong_password_401(client, db_session):
    user_service.ensure_admin(db_session, password=get_settings().default_admin_password)
    res = client.post("/api/v1/auth/login", json={"username": "admin", "password": "nope"})
    assert res.status_code == 401


def test_login_password_over_72_bytes_422(client):
    # bcrypt 72 bytes 절단 방지 검증: 한글 25자 = UTF-8 75 bytes → 422.
    res = client.post("/api/v1/auth/login", json={"username": "admin", "password": "비" * 25})
    assert res.status_code == 422


def test_hash_password_rejects_over_72_bytes(db_session):
    # bcrypt 는 72 bytes 초과분을 예외 없이 절단한다 → 저장 경로에서 거부해야 한다.
    # 거부하지 않으면 시드는 성공하고 로그인은 영구 422 가 되어 관리자가 잠긴다.
    over_limit = "비" * 25  # UTF-8 75 bytes
    assert len(over_limit.encode("utf-8")) > BCRYPT_MAX_PASSWORD_BYTES
    with pytest.raises(ValueError):
        hash_password(over_limit)
    with pytest.raises(ValueError):
        user_service.create_user(db_session, username="toolong", password=over_limit)
    with pytest.raises(ValueError):
        user_service.ensure_admin(db_session, password=over_limit)
    assert user_service.get_by_username(db_session, "toolong") is None


def test_seeded_password_at_byte_limit_roundtrips_through_login(client, db_session):
    # 상한(72 bytes) 경계값은 시드도 되고 그 비밀번호로 로그인도 돼야 한다 — 쓰기/읽기 경로 일치.
    password = "a" * BCRYPT_MAX_PASSWORD_BYTES
    user_service.ensure_admin(db_session, password=password)
    res = client.post("/api/v1/auth/login", json={"username": "admin", "password": password})
    assert res.status_code == 200


def test_login_unknown_username_401(client, db_session):
    user_service.ensure_admin(db_session, password=get_settings().default_admin_password)
    res = client.post("/api/v1/auth/login", json={"username": "ghost", "password": "pw123456"})
    assert res.status_code == 401


def test_login_nonexistent_username_matches_wrong_password_response(client, db_session):
    password = get_settings().default_admin_password
    user_service.ensure_admin(db_session, password=password)
    missing = client.post(
        "/api/v1/auth/login", json={"username": "missing", "password": "pw123456"}
    )
    wrong = client.post(
        "/api/v1/auth/login", json={"username": "admin", "password": "wrong-password"}
    )
    assert missing.status_code == 401
    assert missing.json()["detail"] == wrong.json()["detail"]


def test_authenticate_verifies_password_once_for_unknown_user(db_session, monkeypatch):
    # 미존재 계정에서 bcrypt 검증을 건너뛰면 응답 시간으로 계정 존재 여부가 드러난다
    # (실측 186 ms vs 0.28 ms). 존재 여부와 무관하게 항상 1회 검증해야 한다.
    real_verify = user_service.verify_password
    used_hashes = []

    def counting_verify(plain: str, hashed: str) -> bool:
        used_hashes.append(hashed)
        return real_verify(plain, hashed)

    monkeypatch.setattr(user_service, "verify_password", counting_verify)
    with pytest.raises(ServiceError):
        user_service.authenticate(db_session, "ghost", "pw123456")
    assert used_hashes == [user_service.DUMMY_PASSWORD_HASH]


def test_dummy_password_hash_costs_a_real_bcrypt_round():
    # 더미 해시가 유효 형식이 아니면 verify_password 가 즉시 False 를 반환해(except ValueError)
    # 비용이 들지 않고, 타이밍 방어가 그대로 무력화된다.
    started = time.perf_counter()
    matched = verify_password("pw123456", user_service.DUMMY_PASSWORD_HASH)
    elapsed_ms = (time.perf_counter() - started) * 1000
    assert matched is False
    assert elapsed_ms > 5, f"더미 해시가 bcrypt 검증을 거치지 않았다 ({elapsed_ms:.2f} ms)"


def test_lifespan_seeds_admin_and_seeded_password_logs_in(lifespan_client):
    # TestClient 를 컨텍스트 매니저로 써야 startup 훅이 돈다. "기동하면 admin 으로 로그인된다" 는
    # 스캐폴드의 핵심 약속을 API 레벨에서 고정한다.
    password = get_settings().default_admin_password
    res = lifespan_client.post("/api/v1/auth/login", json={"username": "admin", "password": password})
    assert res.status_code == 200
    assert res.json()["access_token"]


def test_lifespan_reads_settings_at_startup_not_at_import(db_session, db_session_factory, monkeypatch):
    # main.py 가 모듈 전역 settings 를 두면 import 시점 값이 고정돼(§5 ⛔) cache_clear 이후에도
    # 갱신되지 않는다. 시드 스위치를 끈 상태로 기동해 설정이 기동 시점에 읽히는지 고정한다.
    monkeypatch.setattr(db_session_module, "SessionLocal", db_session_factory)
    monkeypatch.setenv("SEED_DEFAULT_ADMIN", "false")
    get_settings.cache_clear()

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app):
            pass
    finally:
        app.dependency_overrides.clear()

    assert user_service.get_by_username(db_session, "admin") is None


def test_plain_client_does_not_run_lifespan(client, db_session):
    # 기본 client 픽스처는 매 테스트 시드가 불필요하므로 lifespan 을 구동하지 않는다.
    assert client.get("/api/v1/health").status_code == 200
    assert user_service.get_by_username(db_session, "admin") is None


def test_login_inactive_user_401_same_message_as_wrong_password(client, db_session):
    # 응답 메시지로 계정 존재/상태가 구분되면 안 된다 — 자격증명 불일치와 동일해야 한다.
    user = user_service.create_user(db_session, username="dormant", password="pw123456")
    user.is_active = False
    db_session.commit()
    res_inactive = client.post(
        "/api/v1/auth/login", json={"username": "dormant", "password": "pw123456"}
    )
    res_wrong = client.post("/api/v1/auth/login", json={"username": "dormant", "password": "nope"})
    assert res_inactive.status_code == 401
    assert res_wrong.status_code == 401
    assert res_inactive.json()["detail"] == res_wrong.json()["detail"]


def test_create_user_duplicate_race_maps_integrity_error(db_session, monkeypatch):
    # check-then-insert 레이스 재현: 사전 조회를 무력화해 unique 제약 위반을 유도한다.
    user_service.create_user(db_session, username="dup", password="pw123456")
    monkeypatch.setattr(user_service, "get_by_username", lambda db, username: None)
    with pytest.raises(ServiceError) as exc_info:
        user_service.create_user(db_session, username="dup", password="pw123456")
    assert exc_info.value.code == "user_exists"


def test_me_with_token_returns_current_user(client, db_session):
    user_service.ensure_admin(db_session, password=get_settings().default_admin_password)
    token = client.post(
        "/api/v1/auth/login", json={"username": "admin", "password": "admin123"}
    ).json()["access_token"]
    res = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    body = res.json()
    assert body["username"] == "admin"
    assert body["role"] == "admin"
    assert body["is_active"] is True


def test_me_without_token_401(client):
    assert client.get("/api/v1/auth/me").status_code == 401


def test_me_expired_token_401(client, db_session):
    user_service.ensure_admin(db_session, password=get_settings().default_admin_password)
    admin = user_service.get_by_username(db_session, "admin")
    token = _issue_token(str(admin.id), session_id=_session_for(db_session, admin), expires_minutes=-1)
    res = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 401


def test_me_non_access_typ_token_401(client, db_session):
    # decode_access_token 은 typ != "access" 토큰을 거부해야 한다. refresh 토큰은 이제 JWT 가
    # 아니므로(불투명 토큰) 위조 typ 클레임을 직접 서명해 검증 경로를 고정한다.
    user_service.ensure_admin(db_session, password=get_settings().default_admin_password)
    admin = user_service.get_by_username(db_session, "admin")
    payload = {
        "sub": str(admin.id),
        "sid": _session_for(db_session, admin),
        "iat": int(time.time()),
        "exp": int(time.time()) + 300,
        "typ": "refresh",
    }
    token = jwt.encode(payload, get_settings().secret_key, algorithm="HS256")
    res = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 401


def test_me_token_without_sid_401(client, db_session):
    # sid 없는 토큰은 세션 폐기 검사를 우회하므로 서명이 유효해도 거부해야 한다.
    user_service.ensure_admin(db_session, password=get_settings().default_admin_password)
    admin = user_service.get_by_username(db_session, "admin")
    payload = {
        "sub": str(admin.id),
        "iat": int(time.time()),
        "exp": int(time.time()) + 300,
        "typ": "access",
    }
    token = jwt.encode(payload, get_settings().secret_key, algorithm="HS256")
    res = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 401


def test_me_tampered_token_401(client, db_session):
    # 다른 키로 서명된(= 서명 검증 실패) 토큰은 거부해야 한다.
    user_service.ensure_admin(db_session, password=get_settings().default_admin_password)
    admin = user_service.get_by_username(db_session, "admin")
    forged = create_token(
        subject=str(admin.id),
        session_id=_session_for(db_session, admin),
        secret="wrong-secret-key-of-sufficient-length-123456",
        expires_minutes=5,
    )
    res = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {forged}"})
    assert res.status_code == 401


def test_me_nonexistent_user_id_token_401(client, db_session):
    token = _issue_token("999999", session_id=999999)
    res = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 401


def test_me_deactivated_after_token_issued_401(client, db_session):
    user_service.ensure_admin(db_session, password=get_settings().default_admin_password)
    admin = user_service.get_by_username(db_session, "admin")
    token = _issue_token(str(admin.id), session_id=_session_for(db_session, admin))
    admin.is_active = False
    db_session.commit()
    res = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 401


def test_me_non_numeric_subject_401(client, db_session):
    # 세션(sid)이 살아 있어도 sub 가 사용자 id 형식이 아니면 거부해야 한다.
    user = user_service.create_user(db_session, username="subject", password="pw123456")
    token = _issue_token("not-a-number", session_id=_session_for(db_session, user))
    res = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 401


def test_me_non_bearer_authorization_header_401(client):
    res = client.get(
        "/api/v1/auth/me", headers={"Authorization": "Basic YWRtaW46YWRtaW4="}
    )
    assert res.status_code == 401


def test_require_admin_403_for_non_admin(db_session):
    user = user_service.create_user(db_session, username="plain", password="pw123456")
    with pytest.raises(HTTPException) as exc_info:
        require_admin(user)
    assert exc_info.value.status_code == 403


def test_require_admin_passes_admin(db_session):
    user_service.ensure_admin(db_session, password=get_settings().default_admin_password)
    admin = user_service.get_by_username(db_session, "admin")
    assert require_admin(admin) is admin
