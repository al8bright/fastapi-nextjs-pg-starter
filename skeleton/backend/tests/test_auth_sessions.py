"""DB 세션 기반 refresh 토큰·로그인 시도 제한 테스트 (architecture.md §9, §12)."""
from datetime import timedelta

import pytest
from sqlalchemy import select

from app.config import get_settings
from app.core.security import (
    PASSWORD_MIN_LENGTH,
    hash_refresh_token,
    now,
    parse_session_id,
    validate_new_password,
)
from app.models.auth_session import AuthSession, LoginThrottle
from app.services import session_service, user_service
from app.services.exceptions import ServiceError

PASSWORD = "pw123456"


def _make_user(db_session, username: str = "alice"):
    return user_service.create_user(db_session, username=username, password=PASSWORD)


def _login(client, username: str = "alice", password: str = PASSWORD):
    return client.post("/api/v1/auth/login", json={"username": username, "password": password})


def _me(client, access_token: str):
    return client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {access_token}"})


# ---------------------------------------------------------------------------
# 로그인 → 토큰 쌍 계약
# ---------------------------------------------------------------------------


def test_login_returns_token_pair_contract(client, db_session):
    _make_user(db_session)
    res = _login(client)
    assert res.status_code == 200
    body = res.json()
    settings = get_settings()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert body["refresh_token"]
    assert body["expires_in"] == settings.access_token_expire_minutes * 60
    # refresh_expires_in 은 expires_at 까지 남은 초 — 계산 시점 차로 몇 초 모자랄 수 있다.
    full = settings.refresh_token_expire_days * 24 * 3600
    assert full - 5 <= body["refresh_expires_in"] <= full


def test_login_creates_session_row_with_hash_only(client, db_session):
    user = _make_user(db_session)
    refresh_token = _login(client).json()["refresh_token"]
    sessions = db_session.execute(select(AuthSession)).scalars().all()
    assert len(sessions) == 1
    session = sessions[0]
    assert session.user_id == user.id
    assert session.revoked_at is None
    # 평문은 저장되지 않고 SHA-256 hex 만 저장된다. 토큰 앞부분은 세션 id 다.
    assert session.refresh_token_hash == hash_refresh_token(refresh_token)
    assert refresh_token not in session.refresh_token_hash
    assert parse_session_id(refresh_token) == session.id


def test_each_login_creates_independent_session(client, db_session):
    _make_user(db_session)
    first = _login(client).json()
    second = _login(client).json()
    assert first["refresh_token"] != second["refresh_token"]
    assert db_session.execute(select(AuthSession)).scalars().all().__len__() == 2
    # 한쪽을 로그아웃해도 다른 세션은 살아 있다 (기기별 독립 세션).
    client.post("/api/v1/auth/logout", json={"refresh_token": first["refresh_token"]})
    assert _me(client, first["access_token"]).status_code == 401
    assert _me(client, second["access_token"]).status_code == 200


# ---------------------------------------------------------------------------
# refresh 회전
# ---------------------------------------------------------------------------


def test_refresh_rotates_token_pair(client, db_session):
    _make_user(db_session)
    old = _login(client).json()
    res = client.post("/api/v1/auth/refresh", json={"refresh_token": old["refresh_token"]})
    assert res.status_code == 200
    new = res.json()
    assert new["refresh_token"] != old["refresh_token"]
    assert new["token_type"] == "bearer"
    assert new["expires_in"] == get_settings().access_token_expire_minutes * 60
    # 새 access 토큰은 즉시 사용 가능해야 한다.
    assert _me(client, new["access_token"]).status_code == 200
    # 세션 행은 새로 만들지 않고 같은 행을 회전한다.
    assert len(db_session.execute(select(AuthSession)).scalars().all()) == 1


def _expire_rotation_grace(db_session):
    """유예 창을 강제로 닫는다 — rotated_at 을 유예 상수보다 과거로 되돌린다."""
    session = db_session.execute(select(AuthSession)).scalar_one()
    session.rotated_at = now() - timedelta(seconds=session_service.ROTATION_GRACE_SECONDS + 1)
    db_session.commit()
    return session


def test_refresh_reuse_after_grace_revokes_session(client, db_session):
    # 유예가 지난 뒤의 이전 토큰 재사용 = 탈취 신호 → 세션 자체를 폐기해야 한다.
    _make_user(db_session)
    old = _login(client).json()
    new = client.post(
        "/api/v1/auth/refresh", json={"refresh_token": old["refresh_token"]}
    ).json()
    session = _expire_rotation_grace(db_session)
    reuse = client.post("/api/v1/auth/refresh", json={"refresh_token": old["refresh_token"]})
    assert reuse.status_code == 401
    assert session.revoked_at is not None
    # 폐기 이후에는 (정당한 쪽이 들고 있던) 최신 refresh·access 토큰도 모두 무효다.
    res = client.post("/api/v1/auth/refresh", json={"refresh_token": new["refresh_token"]})
    assert res.status_code == 401
    assert _me(client, new["access_token"]).status_code == 401


def test_refresh_reuse_within_grace_issues_new_pair(client, db_session):
    # 동시 refresh 경쟁: access 만료 후 멀티 탭/prefetch 가 같은 토큰으로 동시에 refresh 를
    # 친다. 경쟁에서 진 요청(이전 토큰)도 유예 안이면 세션 폐기 없이 새 쌍을 받아야 한다.
    _make_user(db_session)
    old = _login(client).json()
    client.post("/api/v1/auth/refresh", json={"refresh_token": old["refresh_token"]})
    reuse = client.post("/api/v1/auth/refresh", json={"refresh_token": old["refresh_token"]})
    assert reuse.status_code == 200
    body = reuse.json()
    assert body["refresh_token"] != old["refresh_token"]
    session = db_session.execute(select(AuthSession)).scalar_one()
    assert session.revoked_at is None
    # 유예 회전이 발급한 쌍은 즉시 사용 가능해야 한다.
    assert _me(client, body["access_token"]).status_code == 200
    assert (
        client.post(
            "/api/v1/auth/refresh", json={"refresh_token": body["refresh_token"]}
        ).status_code
        == 200
    )


def test_grace_rotation_does_not_extend_grace_window(client, db_session):
    # 유예 회전이 창을 연장하면(슬라이딩) 탈취된 이전 토큰이 60초마다 갱신을 반복하며 무한히
    # 살아남는다 — prev·rotated_at 은 정상 회전에서만 갱신돼야 한다.
    _make_user(db_session)
    old = _login(client).json()
    client.post("/api/v1/auth/refresh", json={"refresh_token": old["refresh_token"]})
    session = db_session.execute(select(AuthSession)).scalar_one()
    opened_at = session.rotated_at
    prev_hash = session.prev_token_hash
    assert prev_hash == hash_refresh_token(old["refresh_token"])
    reuse = client.post("/api/v1/auth/refresh", json={"refresh_token": old["refresh_token"]})
    assert reuse.status_code == 200
    assert session.rotated_at == opened_at
    assert session.prev_token_hash == prev_hash
    # 창이 닫힌 뒤에는 같은 이전 토큰이 더 이상 통하지 않고 세션이 폐기된다.
    _expire_rotation_grace(db_session)
    res = client.post("/api/v1/auth/refresh", json={"refresh_token": old["refresh_token"]})
    assert res.status_code == 401
    assert session.revoked_at is not None


def test_refresh_with_random_secret_revokes_session(client, db_session):
    # sid 는 토큰에 노출된 평문 — sid 만 알고 secret 을 무작위로 찍는 시도는 탈취 신호로
    # 세션을 폐기한다 (current·prev 둘 다 불일치).
    _make_user(db_session)
    tokens = _login(client).json()
    session = db_session.execute(select(AuthSession)).scalar_one()
    res = client.post(
        "/api/v1/auth/refresh", json={"refresh_token": f"{session.id}.attacker-guess"}
    )
    assert res.status_code == 401
    assert session.revoked_at is not None
    assert _me(client, tokens["access_token"]).status_code == 401


def test_refresh_with_malformed_or_unknown_token_401(client, db_session):
    _make_user(db_session)
    _login(client)
    for bad in ["garbage", "999999.does-not-exist", "1.wrong-secret", ".", "abc.def"]:
        res = client.post("/api/v1/auth/refresh", json={"refresh_token": bad})
        assert res.status_code == 401, bad


def test_refresh_expired_session_401(client, db_session):
    _make_user(db_session)
    tokens = _login(client).json()
    session = db_session.execute(select(AuthSession)).scalar_one()
    session.expires_at = now() - timedelta(seconds=1)
    db_session.commit()
    res = client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert res.status_code == 401
    # 만료 세션은 access 토큰도 즉시 무효다 (is_active_session 의 만료 검사).
    assert _me(client, tokens["access_token"]).status_code == 401


def test_refresh_after_user_deactivated_401_and_revokes(client, db_session):
    user = _make_user(db_session)
    tokens = _login(client).json()
    user.is_active = False
    db_session.commit()
    res = client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert res.status_code == 401
    assert db_session.execute(select(AuthSession)).scalar_one().revoked_at is not None


# ---------------------------------------------------------------------------
# logout — 즉시 무효화
# ---------------------------------------------------------------------------


def test_logout_immediately_invalidates_access_token(client, db_session):
    # 이번 변경의 핵심 목적 — 로그아웃하면 만료 전 access 토큰도 다음 요청부터 401 이다.
    _make_user(db_session)
    tokens = _login(client).json()
    assert _me(client, tokens["access_token"]).status_code == 200
    res = client.post("/api/v1/auth/logout", json={"refresh_token": tokens["refresh_token"]})
    assert res.status_code == 204
    assert _me(client, tokens["access_token"]).status_code == 401
    assert (
        client.post(
            "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
        ).status_code
        == 401
    )


def test_logout_is_idempotent_and_never_errors(client, db_session):
    _make_user(db_session)
    tokens = _login(client).json()
    for _ in range(2):
        res = client.post("/api/v1/auth/logout", json={"refresh_token": tokens["refresh_token"]})
        assert res.status_code == 204
    # 형식 오류/미존재 토큰도 204 — 응답으로 토큰 상태를 탐침할 수 없어야 한다.
    assert client.post("/api/v1/auth/logout", json={"refresh_token": "garbage"}).status_code == 204
    assert (
        client.post("/api/v1/auth/logout", json={"refresh_token": "999999.x"}).status_code == 204
    )


def test_logout_with_prev_token_revokes_session(client, db_session):
    # 동시 refresh 경쟁에서 진 탭은 낡은(이전) 토큰을 들고 있다 — 그 토큰으로도 로그아웃은
    # 성공해야 한다. 폐기는 넓게 받아도 안전이 강해질 뿐이다.
    _make_user(db_session)
    old = _login(client).json()
    new = client.post(
        "/api/v1/auth/refresh", json={"refresh_token": old["refresh_token"]}
    ).json()
    res = client.post("/api/v1/auth/logout", json={"refresh_token": old["refresh_token"]})
    assert res.status_code == 204
    session = db_session.execute(select(AuthSession)).scalar_one()
    assert session.revoked_at is not None
    assert _me(client, new["access_token"]).status_code == 401


def test_logout_with_wrong_secret_does_not_revoke(client, db_session):
    # sid 는 토큰에 노출된 평문이다 — sid 만 알고 secret 이 틀리면 남의 세션을 끊을 수 없어야 한다.
    _make_user(db_session)
    tokens = _login(client).json()
    session = db_session.execute(select(AuthSession)).scalar_one()
    res = client.post(
        "/api/v1/auth/logout", json={"refresh_token": f"{session.id}.attacker-guess"}
    )
    assert res.status_code == 204
    assert _me(client, tokens["access_token"]).status_code == 200


# ---------------------------------------------------------------------------
# 로그인 시도 제한 (DB 스로틀)
# ---------------------------------------------------------------------------


def test_throttle_locks_after_max_failures(client, db_session):
    _make_user(db_session)
    limit = get_settings().login_max_failures
    for _ in range(limit):
        assert _login(client, password="wrong-password").status_code == 401
    # 잠금 이후에는 올바른 비밀번호라도 429 다.
    res = _login(client)
    assert res.status_code == 429
    assert res.json()["detail"] == user_service.TOO_MANY_ATTEMPTS_MESSAGE
    throttle = db_session.execute(select(LoginThrottle)).scalar_one()
    assert throttle.failed_count == limit
    assert throttle.locked_until is not None


def test_throttle_applies_to_unknown_username_with_same_message(client, db_session):
    # 미존재 계정도 같은 조건에서 같은 429 — 잠금 응답 유무로 계정 존재가 드러나면 안 된다.
    _make_user(db_session)
    for _ in range(get_settings().login_max_failures):
        assert _login(client, username="ghost", password="wrong-password").status_code == 401
    ghost = _login(client, username="ghost", password="wrong-password")
    for _ in range(get_settings().login_max_failures):
        assert _login(client, password="wrong-password").status_code == 401
    real = _login(client, password="wrong-password")
    assert ghost.status_code == real.status_code == 429
    assert ghost.json()["detail"] == real.json()["detail"]


def test_throttle_resets_on_successful_login(client, db_session):
    _make_user(db_session)
    limit = get_settings().login_max_failures
    for _ in range(limit - 1):
        assert _login(client, password="wrong-password").status_code == 401
    assert _login(client).status_code == 200
    # 성공이 카운터를 지웠으므로 다시 (limit-1)회 실패해도 잠기지 않는다.
    assert db_session.execute(select(LoginThrottle)).scalar_one_or_none() is None
    for _ in range(limit - 1):
        assert _login(client, password="wrong-password").status_code == 401
    assert _login(client).status_code == 200


def test_throttle_expired_lock_restarts_counting(db_session):
    # 잠금이 풀린 뒤의 실패는 처음부터 다시 센다 — 풀리자마자 1회 실패로 재잠금되면 영구 잠금이다.
    _make_user(db_session)
    throttle = LoginThrottle(
        username="alice",
        failed_count=get_settings().login_max_failures,
        locked_until=now() - timedelta(seconds=1),
    )
    db_session.add(throttle)
    db_session.commit()
    with pytest.raises(ServiceError) as exc_info:
        user_service.authenticate(db_session, "alice", "wrong-password")
    assert exc_info.value.code == "invalid_credentials"  # 429 아님 — 잠금은 이미 풀렸다
    assert throttle.failed_count == 1
    assert throttle.locked_until is None


# ---------------------------------------------------------------------------
# 비밀번호 정책·refresh 토큰 헬퍼
# ---------------------------------------------------------------------------


def test_validate_new_password_enforces_min_length():
    with pytest.raises(ValueError):
        validate_new_password("a" * (PASSWORD_MIN_LENGTH - 1))
    validate_new_password("a" * PASSWORD_MIN_LENGTH)  # 경계값은 통과


def test_create_user_rejects_short_password(db_session):
    with pytest.raises(ValueError):
        user_service.create_user(db_session, username="shorty", password="pw12345")  # 7자
    assert user_service.get_by_username(db_session, "shorty") is None


def test_ensure_admin_rejects_short_password(db_session):
    with pytest.raises(ValueError):
        user_service.ensure_admin(db_session, password="pw12345")
    assert user_service.get_by_username(db_session, "admin") is None


def test_parse_session_id_returns_none_on_malformed_input():
    assert parse_session_id("123.secret") == 123
    for bad in ["", "123", ".secret", "abc.secret", "12a.secret", "-1.secret"]:
        assert parse_session_id(bad) is None, bad


def test_is_active_session_checks_revoked_and_expired(db_session):
    user = _make_user(db_session)
    session, _ = session_service.create_session(db_session, user_id=user.id)
    assert session_service.is_active_session(db_session, session.id) is True
    assert session_service.is_active_session(db_session, 999999) is False
    session.revoked_at = now()
    db_session.commit()
    assert session_service.is_active_session(db_session, session.id) is False
    session.revoked_at = None
    session.expires_at = now() - timedelta(seconds=1)
    db_session.commit()
    assert session_service.is_active_session(db_session, session.id) is False
