"""refresh 토큰 cookie 전달 모드 테스트 (ARCHITECTURE.md §9, §12).

conftest 는 기존 계약(body 모드)을 기본으로 둔다. 이 모듈은 REFRESH_TOKEN_TRANSPORT=cookie 로
바꿔 브라우저 SPA 계약을 검증한다 — httpOnly 쿠키 발급·회전·삭제, 본문 refresh_token=null.
마지막 절은 body 모드에서 본문이 여전히 필수인지(시그니처상 선택이 된 뒤의 회귀)를 고정한다.
"""
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.api.v1.auth import REFRESH_COOKIE, REFRESH_COOKIE_PATH
from app.config import Settings, get_settings
from app.core.security import now, parse_session_id
from app.dependencies import get_db
from app.main import app
from app.models.auth_session import AuthSession
from app.services import session_service, user_service

PASSWORD = "pw123456"
LOGIN = "/api/v1/auth/login"
REFRESH = "/api/v1/auth/refresh"
LOGOUT = "/api/v1/auth/logout"


@pytest.fixture
def cookie_mode(monkeypatch):
    monkeypatch.setenv("REFRESH_TOKEN_TRANSPORT", "cookie")
    get_settings.cache_clear()


@pytest.fixture
def cookie_client(cookie_mode, client):
    return client


def _make_user(db_session, username: str = "alice"):
    return user_service.create_user(db_session, username=username, password=PASSWORD)


def _login(client, username: str = "alice", password: str = PASSWORD):
    return client.post(LOGIN, json={"username": username, "password": password})


def _me(client, access_token: str):
    return client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {access_token}"})


def _refresh_set_cookie(res) -> str:
    """응답의 refresh 쿠키 Set-Cookie 헤더 1개를 돌려준다."""
    headers = [h for h in res.headers.get_list("set-cookie") if h.startswith(f"{REFRESH_COOKIE}=")]
    assert len(headers) == 1, res.headers.get_list("set-cookie")
    return headers[0]


def _attrs(set_cookie: str) -> dict[str, str]:
    """Set-Cookie 속성을 소문자 키 dict 로 (값 없는 플래그는 "")."""
    parts = [p.strip() for p in set_cookie.split(";")]
    attrs = {}
    for part in parts[1:]:
        key, _, value = part.partition("=")
        attrs[key.lower()] = value
    return attrs


def _cookie_value(set_cookie: str) -> str:
    return set_cookie.split(";", 1)[0].split("=", 1)[1].strip('"')


def _assert_cookie_deleted(res) -> None:
    header = _refresh_set_cookie(res)
    attrs = _attrs(header)
    assert attrs["max-age"] == "0"
    assert attrs["path"] == REFRESH_COOKIE_PATH
    assert "httponly" in attrs


def _put_cookie(client, value: str) -> None:
    """클라이언트 쿠키 저장소를 지정한 refresh 토큰 하나로 교체한다 (탈취·재사용 시나리오 재현)."""
    client.cookies.clear()
    client.cookies.set(REFRESH_COOKIE, value, path=REFRESH_COOKIE_PATH)


# ---------------------------------------------------------------------------
# login — httpOnly 쿠키 발급, 본문 refresh_token=null
# ---------------------------------------------------------------------------


def test_login_sets_httponly_refresh_cookie_and_hides_token_from_body(cookie_client, db_session):
    _make_user(db_session)
    res = _login(cookie_client)
    assert res.status_code == 200
    body = res.json()
    assert body["refresh_token"] is None
    assert body["access_token"]
    assert body["token_type"] == "bearer"

    header = _refresh_set_cookie(res)
    attrs = _attrs(header)
    assert "httponly" in attrs
    assert attrs["path"] == REFRESH_COOKIE_PATH
    assert attrs["samesite"].lower() == "lax"
    assert "secure" not in attrs  # COOKIE_SECURE=false (개발 기본값)
    # 쿠키 수명 = 응답의 refresh_expires_in (세션의 남은 절대 수명) — 계산 시점 차로 1초 어긋날 수 있다.
    assert abs(int(attrs["max-age"]) - body["refresh_expires_in"]) <= 1
    full = get_settings().refresh_token_expire_days * 24 * 3600
    assert full - 5 <= int(attrs["max-age"]) <= full

    session = db_session.execute(select(AuthSession)).scalar_one()
    assert parse_session_id(_cookie_value(header)) == session.id
    assert _me(cookie_client, body["access_token"]).status_code == 200


def test_cookie_secure_flag_follows_setting(cookie_mode, client, db_session, monkeypatch):
    monkeypatch.setenv("COOKIE_SECURE", "true")
    get_settings.cache_clear()
    _make_user(db_session)
    attrs = _attrs(_refresh_set_cookie(_login(client)))
    assert "secure" in attrs


def test_refresh_cookie_is_scoped_to_auth_path(cookie_client, db_session):
    # path=/api/v1/auth — refresh/logout 요청에만 실리고 일반 API 요청에는 실리지 않는다.
    _make_user(db_session)
    _login(cookie_client)
    health = cookie_client.get("/api/v1/health")
    assert REFRESH_COOKIE not in health.request.headers.get("cookie", "")
    res = cookie_client.post(REFRESH)
    assert f"{REFRESH_COOKIE}=" in res.request.headers.get("cookie", "")
    assert res.status_code == 200


# ---------------------------------------------------------------------------
# refresh — 쿠키로 받고 쿠키로 회전, 실패는 401 + 쿠키 삭제
# ---------------------------------------------------------------------------


def test_refresh_via_cookie_rotates_cookie(cookie_client, db_session):
    _make_user(db_session)
    first = _refresh_set_cookie(_login(cookie_client))
    res = cookie_client.post(REFRESH)  # 본문 없음 — cookie 모드에서 422 가 나면 안 된다
    assert res.status_code == 200
    body = res.json()
    assert body["refresh_token"] is None
    second = _refresh_set_cookie(res)
    assert _cookie_value(second) != _cookie_value(first)
    assert "httponly" in _attrs(second)
    assert abs(int(_attrs(second)["max-age"]) - body["refresh_expires_in"]) <= 1
    # 클라이언트 저장소가 새 쿠키로 갱신돼 연속 회전이 된다.
    assert cookie_client.cookies.get(REFRESH_COOKIE) == _cookie_value(second)
    assert cookie_client.post(REFRESH).status_code == 200
    assert _me(cookie_client, body["access_token"]).status_code == 200


def test_refresh_reuse_of_old_cookie_after_grace_revokes_session(cookie_client, db_session):
    _make_user(db_session)
    old = _cookie_value(_refresh_set_cookie(_login(cookie_client)))
    new_res = cookie_client.post(REFRESH)
    new_access = new_res.json()["access_token"]
    new = _cookie_value(_refresh_set_cookie(new_res))

    session = db_session.execute(select(AuthSession)).scalar_one()
    session.rotated_at = now() - timedelta(seconds=session_service.ROTATION_GRACE_SECONDS + 1)
    db_session.commit()

    _put_cookie(cookie_client, old)
    reuse = cookie_client.post(REFRESH)
    assert reuse.status_code == 401
    _assert_cookie_deleted(reuse)
    assert session.revoked_at is not None
    # 폐기 이후에는 최신 쿠키·access 토큰도 무효다.
    _put_cookie(cookie_client, new)
    assert cookie_client.post(REFRESH).status_code == 401
    assert _me(cookie_client, new_access).status_code == 401


def test_refresh_without_cookie_401_and_deletes_cookie(cookie_client, db_session):
    res = cookie_client.post(REFRESH)
    assert res.status_code == 401
    assert res.headers["www-authenticate"] == "Bearer"
    assert res.json()["detail"] == session_service.INVALID_REFRESH_MESSAGE
    _assert_cookie_deleted(res)


@pytest.mark.parametrize("bad", ["garbage", "999999.x", "1." + "a" * 200])
def test_refresh_with_invalid_cookie_401_and_deletes_cookie(cookie_client, db_session, bad):
    _put_cookie(cookie_client, bad)
    res = cookie_client.post(REFRESH)
    assert res.status_code == 401
    _assert_cookie_deleted(res)


def test_refresh_expired_session_cookie_401_and_deletes_cookie(cookie_client, db_session):
    _make_user(db_session)
    _login(cookie_client)
    session = db_session.execute(select(AuthSession)).scalar_one()
    session.expires_at = now() - timedelta(seconds=1)
    db_session.commit()
    res = cookie_client.post(REFRESH)
    assert res.status_code == 401
    _assert_cookie_deleted(res)


def test_refresh_ignores_body_token_in_cookie_mode(cookie_client, db_session):
    # cookie 모드는 쿠키로만 받는다 — 본문 토큰 경로가 열려 있으면 JS 노출 토큰 운용이 가능해진다.
    _make_user(db_session)
    token = _cookie_value(_refresh_set_cookie(_login(cookie_client)))
    cookie_client.cookies.clear()
    res = cookie_client.post(REFRESH, json={"refresh_token": token})
    assert res.status_code == 401
    _assert_cookie_deleted(res)


# ---------------------------------------------------------------------------
# logout — 항상 204 + 쿠키 삭제, 세션 즉시 무효화
# ---------------------------------------------------------------------------


def test_logout_revokes_session_and_deletes_cookie(cookie_client, db_session):
    _make_user(db_session)
    access = _login(cookie_client).json()["access_token"]
    assert _me(cookie_client, access).status_code == 200
    res = cookie_client.post(LOGOUT)
    assert res.status_code == 204
    _assert_cookie_deleted(res)
    assert db_session.execute(select(AuthSession)).scalar_one().revoked_at is not None
    # 같은 sid 의 access 토큰은 만료 전이어도 즉시 401 이다.
    assert _me(cookie_client, access).status_code == 401
    # 클라이언트 저장소에서도 쿠키가 지워졌다.
    assert cookie_client.cookies.get(REFRESH_COOKIE) is None
    assert cookie_client.post(REFRESH).status_code == 401


def test_logout_without_cookie_is_idempotent_204(cookie_client, db_session):
    for _ in range(2):
        res = cookie_client.post(LOGOUT)
        assert res.status_code == 204
        _assert_cookie_deleted(res)
    _put_cookie(cookie_client, "garbage")
    assert cookie_client.post(LOGOUT).status_code == 204


# ---------------------------------------------------------------------------
# 로그인 시도 제한은 전달 방식과 무관하다
# ---------------------------------------------------------------------------


def test_lockout_429_is_unaffected_by_cookie_transport(cookie_client, db_session):
    _make_user(db_session)
    for _ in range(get_settings().login_max_failures):
        assert _login(cookie_client, password="wrong-password").status_code == 401
    res = _login(cookie_client)
    assert res.status_code == 429
    assert res.json()["detail"] == user_service.TOO_MANY_ATTEMPTS_MESSAGE
    assert not [h for h in res.headers.get_list("set-cookie") if h.startswith(f"{REFRESH_COOKIE}=")]


# ---------------------------------------------------------------------------
# production fail-fast — cookie 모드 + COOKIE_SECURE=false 는 기동 거부
# ---------------------------------------------------------------------------


def _start_app(db_session) -> None:
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app):
            pass
    finally:
        app.dependency_overrides.clear()


def _production_env(monkeypatch, *, transport: str, secure: str) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("SEED_DEFAULT_ADMIN", "false")
    monkeypatch.setenv("REFRESH_TOKEN_TRANSPORT", transport)
    monkeypatch.setenv("COOKIE_SECURE", secure)
    get_settings.cache_clear()


def test_production_refuses_cookie_transport_without_secure(db_session, monkeypatch):
    _production_env(monkeypatch, transport="cookie", secure="false")
    with pytest.raises(RuntimeError, match="COOKIE_SECURE"):
        _start_app(db_session)


@pytest.mark.parametrize(("transport", "secure"), [("cookie", "true"), ("body", "false")])
def test_production_starts_with_secure_cookie_or_body_transport(
    db_session, monkeypatch, transport, secure
):
    _production_env(monkeypatch, transport=transport, secure=secure)
    _start_app(db_session)


def test_transport_defaults_to_cookie(monkeypatch):
    # 코드 기본값은 안전한 쪽(cookie)이다 — .env 에서 body 를 명시해야만 본문으로 나간다.
    monkeypatch.delenv("REFRESH_TOKEN_TRANSPORT", raising=False)
    monkeypatch.delenv("COOKIE_SECURE", raising=False)
    settings = Settings(_env_file=None)
    assert settings.refresh_token_transport == "cookie"
    assert settings.cookie_secure is False


# ---------------------------------------------------------------------------
# body 모드 회귀 — 본문은 여전히 필수, 쿠키는 쓰지 않는다
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("path", [REFRESH, LOGOUT])
def test_body_mode_requires_body(client, path):
    res = client.post(path)
    assert res.status_code == 422


@pytest.mark.parametrize("path", [REFRESH, LOGOUT])
def test_body_mode_rejects_empty_token(client, path):
    assert client.post(path, json={"refresh_token": ""}).status_code == 422


def test_body_mode_sets_no_cookie_and_ignores_cookie(client, db_session):
    _make_user(db_session)
    res = _login(client)
    assert res.json()["refresh_token"]
    assert res.headers.get_list("set-cookie") == []
    _put_cookie(client, res.json()["refresh_token"])
    # 쿠키만 있고 본문이 없으면 body 모드에서는 422 — 쿠키 경로는 열려 있지 않다.
    assert client.post(REFRESH).status_code == 422
