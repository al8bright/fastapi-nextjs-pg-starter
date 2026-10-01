"""보안 응답 헤더·인증 응답 캐시 금지·Retry-After·CORS 테스트 (ARCHITECTURE.md §9, §12).

두 refresh 전달 방식(cookie/body) 모두에서 같은 보안 헤더 계약이 성립하는지 고정한다.
"""
from datetime import timedelta

import pytest
from sqlalchemy import select

from app.api.v1.auth import REFRESH_COOKIE, REFRESH_COOKIE_PATH
from app.config import get_settings
from app.core.security import BCRYPT_MAX_PASSWORD_BYTES, hash_password, now, verify_password
from app.main import CORS_ALLOW_HEADERS, CORS_ALLOW_METHODS
from app.models.auth_session import LoginThrottle
from app.services import user_service
from app.services.exceptions import ServiceError

PASSWORD = "pw123456"
LOGIN = "/api/v1/auth/login"
REFRESH = "/api/v1/auth/refresh"
LOGOUT = "/api/v1/auth/logout"
ME = "/api/v1/auth/me"
ORIGIN = "http://localhost:3000"  # config.py 기본 CORS_ORIGINS


@pytest.fixture(params=["body", "cookie"])
def transport(request, monkeypatch):
    """두 전달 방식 모두에서 같은 테스트를 돌린다 (conftest 기본은 body)."""
    monkeypatch.setenv("REFRESH_TOKEN_TRANSPORT", request.param)
    get_settings.cache_clear()
    return request.param


def _make_user(db_session, username: str = "alice"):
    return user_service.create_user(db_session, username=username, password=PASSWORD)


def _login(client, username: str = "alice", password: str = PASSWORD):
    return client.post(LOGIN, json={"username": username, "password": password})


def _lock(client, username: str) -> None:
    for _ in range(get_settings().login_max_failures):
        assert _login(client, username=username, password="wrong-password").status_code == 401


# ---------------------------------------------------------------------------
# 보안 응답 헤더
# ---------------------------------------------------------------------------


def _assert_security_headers(res) -> None:
    assert res.headers["X-Content-Type-Options"] == "nosniff"
    assert res.headers["X-Frame-Options"] == "DENY"
    assert res.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
    assert res.headers["Cross-Origin-Opener-Policy"] == "same-origin"


def test_security_headers_present(client):
    _assert_security_headers(client.get("/api/v1/health"))


def test_security_headers_present_on_error_responses(client):
    _assert_security_headers(client.get("/api/v1/does-not-exist"))  # 404
    _assert_security_headers(client.get(ME))  # 401


@pytest.mark.parametrize("path", ["/docs", "/redoc", "/openapi.json"])
def test_docs_still_served_without_csp(client, path):
    # CSP 를 붙이지 않는다 — 엄격한 CSP 는 Swagger UI/ReDoc 의 CDN·인라인 스크립트를 막는다.
    res = client.get(path)
    assert res.status_code == 200
    assert "Content-Security-Policy" not in res.headers
    _assert_security_headers(res)


def test_no_hsts_in_development_without_cookie_secure(client):
    # conftest: APP_ENV=test, COOKIE_SECURE=false — 평문 HTTP 개발 환경에는 HSTS 를 내지 않는다.
    assert "Strict-Transport-Security" not in client.get("/api/v1/health").headers


def test_hsts_when_cookie_secure(client, monkeypatch):
    monkeypatch.setenv("COOKIE_SECURE", "true")
    get_settings.cache_clear()
    res = client.get("/api/v1/health")
    assert res.headers["Strict-Transport-Security"] == "max-age=31536000"


def test_hsts_in_production_body_transport_without_cookie_secure(client, monkeypatch):
    # body 모드(BFF) 운영은 COOKIE_SECURE 를 켜지 않을 수 있다 — production 이면 HSTS 를 낸다.
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("REFRESH_TOKEN_TRANSPORT", "body")
    monkeypatch.setenv("COOKIE_SECURE", "false")
    get_settings.cache_clear()
    res = client.get("/api/v1/health")
    assert res.headers["Strict-Transport-Security"] == "max-age=31536000"


# ---------------------------------------------------------------------------
# /api/v1/auth/* — Cache-Control: no-store (성공·오류·쿠키 삭제 응답 모두)
# ---------------------------------------------------------------------------


def test_auth_success_responses_are_no_store(transport, client, db_session):
    _make_user(db_session)
    res = _login(client)
    assert res.status_code == 200
    assert res.headers["Cache-Control"] == "no-store"
    access = res.json()["access_token"]
    me = client.get(ME, headers={"Authorization": f"Bearer {access}"})
    assert me.status_code == 200
    assert me.headers["Cache-Control"] == "no-store"
    if transport == "cookie":
        refreshed = client.post(REFRESH)
    else:
        refreshed = client.post(REFRESH, json={"refresh_token": res.json()["refresh_token"]})
    assert refreshed.status_code == 200
    assert refreshed.headers["Cache-Control"] == "no-store"


def test_auth_error_responses_are_no_store(transport, client, db_session):
    _make_user(db_session)
    responses = [
        _login(client, password="wrong-password"),  # 401
        client.post(LOGIN, json={"username": "alice"}),  # 422
        client.get(ME),  # 401
    ]
    _lock(client, "bob")
    responses.append(_login(client, username="bob"))  # 429
    assert [r.status_code for r in responses] == [401, 422, 401, 429]
    for res in responses:
        assert res.headers["Cache-Control"] == "no-store", res.status_code


def test_refresh_and_logout_failures_are_no_store_in_both_transports(transport, client):
    if transport == "cookie":
        # 직접 만든 JSONResponse(401 + 쿠키 삭제)·Response(204 + 쿠키 삭제)에도 붙어야 한다.
        client.cookies.set(REFRESH_COOKIE, "1.bogus", path=REFRESH_COOKIE_PATH)
        refresh = client.post(REFRESH)
        logout = client.post(LOGOUT)
        assert [refresh.status_code, logout.status_code] == [401, 204]
        assert any(h.startswith(f"{REFRESH_COOKIE}=") for h in refresh.headers.get_list("set-cookie"))
    else:
        refresh = client.post(REFRESH, json={"refresh_token": "1.bogus"})
        logout = client.post(LOGOUT)  # 본문 누락 → 422
        assert [refresh.status_code, logout.status_code] == [401, 422]
    assert refresh.headers["Cache-Control"] == "no-store"
    assert logout.headers["Cache-Control"] == "no-store"


def test_non_auth_responses_are_not_forced_no_store(client):
    assert client.get("/api/v1/health").headers.get("Cache-Control") != "no-store"
    # 접두어만 같은 경로(/api/v1/authz)는 인증 경로가 아니다.
    assert client.get("/api/v1/authz").headers.get("Cache-Control") != "no-store"


# ---------------------------------------------------------------------------
# 429 — Retry-After (계정 존재 여부와 무관하게)
# ---------------------------------------------------------------------------


def _retry_after(res) -> int:
    value = int(res.headers["Retry-After"])
    assert 1 <= value <= get_settings().login_lockout_minutes * 60
    return value


def test_lockout_429_has_retry_after_for_known_and_unknown_username(transport, client, db_session):
    _make_user(db_session)
    _lock(client, "alice")
    _lock(client, "ghost")
    real = _login(client)
    ghost = _login(client, username="ghost")
    assert real.status_code == ghost.status_code == 429
    # 같은 잠금 시간이면 값도 거의 같다 — 헤더 유무·값으로 계정 존재가 드러나지 않는다.
    assert abs(_retry_after(real) - _retry_after(ghost)) <= 2


def test_retry_after_is_rounded_up_to_at_least_one_second(db_session):
    # 잠금이 1초 미만 남아도 0 이 아니라 1 — 0 이면 클라이언트가 즉시 재시도해 다시 429 를 받는다.
    db_session.add(
        LoginThrottle(
            username="alice",
            failed_count=get_settings().login_max_failures,
            locked_until=now() + timedelta(milliseconds=300),
        )
    )
    db_session.commit()
    with pytest.raises(ServiceError) as exc_info:
        user_service.authenticate(db_session, "alice", PASSWORD)
    assert exc_info.value.code == "too_many_attempts"
    assert exc_info.value.retry_after == 1


def test_retry_after_matches_remaining_lock_time(db_session):
    db_session.add(
        LoginThrottle(
            username="ghost",
            failed_count=get_settings().login_max_failures,
            locked_until=now() + timedelta(seconds=90),
        )
    )
    db_session.commit()
    with pytest.raises(ServiceError) as exc_info:
        user_service.authenticate(db_session, "ghost", "whatever")
    assert 89 <= exc_info.value.retry_after <= 90
    assert db_session.execute(select(LoginThrottle)).scalar_one().failed_count == (
        get_settings().login_max_failures
    )


# ---------------------------------------------------------------------------
# CORS — 메서드·헤더 명시 허용, credentials 허용
# ---------------------------------------------------------------------------


def test_cors_preflight_returns_explicit_methods_and_headers(client):
    res = client.options(
        LOGIN,
        headers={
            "Origin": ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization, content-type",
        },
    )
    assert res.status_code == 200
    assert res.headers["Access-Control-Allow-Origin"] == ORIGIN
    assert res.headers["Access-Control-Allow-Credentials"] == "true"
    allowed_methods = {m.strip() for m in res.headers["Access-Control-Allow-Methods"].split(",")}
    assert allowed_methods == set(CORS_ALLOW_METHODS)
    allowed_headers = {h.strip().lower() for h in res.headers["Access-Control-Allow-Headers"].split(",")}
    assert {h.lower() for h in CORS_ALLOW_HEADERS} <= allowed_headers
    assert "*" not in res.headers["Access-Control-Allow-Methods"]
    assert "*" not in res.headers["Access-Control-Allow-Headers"]


def test_cors_preflight_rejects_unlisted_header_and_method(client):
    bad_header = client.options(
        LOGIN,
        headers={
            "Origin": ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "x-unlisted-header",
        },
    )
    assert bad_header.status_code == 400
    bad_method = client.options(
        LOGIN, headers={"Origin": ORIGIN, "Access-Control-Request-Method": "TRACE"}
    )
    assert bad_method.status_code == 400


def test_cors_preflight_rejects_unknown_origin(client):
    res = client.options(
        LOGIN,
        headers={"Origin": "http://evil.example", "Access-Control-Request-Method": "POST"},
    )
    assert res.status_code == 400
    assert "Access-Control-Allow-Origin" not in res.headers


def test_cors_exposes_retry_after_to_spa(client, db_session):
    # 교차 출처 SPA 가 429 의 Retry-After 를 JS 로 읽으려면 expose 가 필요하다.
    _lock(client, "alice")
    res = client.post(
        LOGIN, json={"username": "alice", "password": PASSWORD}, headers={"Origin": ORIGIN}
    )
    assert res.status_code == 429
    assert res.headers["Access-Control-Allow-Origin"] == ORIGIN
    assert res.headers["Access-Control-Allow-Credentials"] == "true"
    assert "retry-after" in res.headers["Access-Control-Expose-Headers"].lower()


# ---------------------------------------------------------------------------
# bcrypt 72 bytes 경계 — 로그인 검증은 예외 없이 False
# ---------------------------------------------------------------------------


def test_verify_password_over_72_bytes_returns_false():
    # bcrypt 5 의 checkpw 는 72 bytes 초과에 ValueError — verify_password 는 예외 없이 False.
    limit = BCRYPT_MAX_PASSWORD_BYTES
    hashed = hash_password("a" * limit)
    assert verify_password("a" * limit, hashed) is True
    assert verify_password("a" * (limit + 1), hashed) is False
