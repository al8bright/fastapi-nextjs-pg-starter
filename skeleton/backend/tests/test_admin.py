"""관리자 API — 인가·대시보드·사용자·세션·로그인 스로틀·에디터 이미지 테스트."""

from datetime import timedelta

import pytest
from sqlalchemy import select

from app.config import get_settings
from app.core.security import now
from app.models.auth_session import AuthSession, LoginThrottle
from app.models.user import UserRole
from app.services import user_service
from tests.conftest import ADMIN_PASSWORD, USER_PASSWORD, _bearer
from tests.media_factory import image_bytes

A = "/api/v1/admin"


def _login(client, username, password):
    return client.post("/api/v1/auth/login", json={"username": username, "password": password})


# ---------------------------------------------------------------------------
# 인가 (require_admin)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", f"{A}/dashboard"),
        ("get", f"{A}/users"),
        ("patch", f"{A}/users/1"),
        ("get", f"{A}/sessions"),
        ("delete", f"{A}/sessions/1"),
        ("delete", f"{A}/users/1/sessions"),
        ("get", f"{A}/login-throttles"),
        ("delete", f"{A}/login-throttles/someone"),
        ("post", f"{A}/editor/images"),
    ],
)
def test_admin_routes_require_admin(client, user_headers, method, path):
    assert getattr(client, method)(path).status_code == 401
    assert getattr(client, method)(path, headers=user_headers).status_code == 403


def test_demoted_admin_loses_access_immediately(client, db_session, admin_headers, admin_user):
    other = user_service.create_user(db_session, username="boss", password=ADMIN_PASSWORD, role=UserRole.ADMIN)
    other_headers = _bearer(client, "boss", ADMIN_PASSWORD)
    assert client.get(f"{A}/dashboard", headers=other_headers).status_code == 200
    assert client.patch(f"{A}/users/{other.id}", json={"role": "user"}, headers=admin_headers).status_code == 200
    # access 토큰이 아직 유효해도 역할은 요청마다 DB 에서 다시 본다.
    assert client.get(f"{A}/dashboard", headers=other_headers).status_code == 403


# ---------------------------------------------------------------------------
# 대시보드
# ---------------------------------------------------------------------------


def test_dashboard_counts(client, db_session, admin_headers, normal_user):
    inactive = user_service.create_user(db_session, username="gone", password=USER_PASSWORD)
    inactive.is_active = False
    db_session.add(LoginThrottle(username="victim", failed_count=5, locked_until=now() + timedelta(minutes=5)))
    db_session.add(LoginThrottle(username="old", failed_count=5, locked_until=now() - timedelta(minutes=5)))
    db_session.commit()
    client.post(
        f"{A}/notices", json={"title": "a", "body_html": "<p>a</p>", "is_published": True}, headers=admin_headers
    )
    client.post(f"{A}/notices", json={"title": "b", "body_html": "<p>b</p>"}, headers=admin_headers)

    res = client.get(f"{A}/dashboard", headers=admin_headers)
    assert res.status_code == 200
    body = res.json()
    assert body["users"] == {"total": 3, "active": 2, "inactive": 1}
    assert body["active_sessions"] == 1  # admin_headers 의 로그인 세션
    assert body["locked_accounts"] == 1
    assert body["notices"] == {"published": 1, "draft": 1}
    assert body["active_banners"] == 0
    assert body["db"] == "ok"
    assert body["alembic_revision"] is None  # 테스트 DB 는 create_all 이라 alembic_version 이 없다


# ---------------------------------------------------------------------------
# 사용자
# ---------------------------------------------------------------------------


def test_list_users_with_session_counts_and_filters(client, db_session, admin_headers, admin_user, normal_user):
    _bearer(client, normal_user.username, USER_PASSWORD)
    _bearer(client, normal_user.username, USER_PASSWORD)
    res = client.get(f"{A}/users", headers=admin_headers).json()
    assert res["total"] == 2 and (res["page"], res["size"]) == (1, 20)
    by_name = {u["username"]: u for u in res["items"]}
    assert by_name["member"]["active_session_count"] == 2
    assert by_name["root"]["active_session_count"] == 1
    assert set(by_name["member"]) == {"id", "username", "role", "is_active", "created_at", "active_session_count"}
    assert [
        u["username"] for u in client.get(f"{A}/users", params={"role": "admin"}, headers=admin_headers).json()["items"]
    ] == ["root"]
    assert [
        u["username"] for u in client.get(f"{A}/users", params={"q": "mem"}, headers=admin_headers).json()["items"]
    ] == ["member"]
    assert client.get(f"{A}/users", params={"role": "owner"}, headers=admin_headers).status_code == 422


def test_promote_user(client, admin_headers, normal_user):
    res = client.patch(f"{A}/users/{normal_user.id}", json={"role": "admin"}, headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["role"] == "admin"


def test_invalid_role_rejected(client, admin_headers, normal_user):
    assert client.patch(f"{A}/users/{normal_user.id}", json={"role": "root"}, headers=admin_headers).status_code == 422


def test_patch_missing_user_404(client, admin_headers):
    assert client.patch(f"{A}/users/9999", json={"is_active": False}, headers=admin_headers).status_code == 404


@pytest.mark.parametrize("change", [{"role": "user"}, {"is_active": False}])
def test_admin_cannot_demote_or_deactivate_self(client, db_session, admin_headers, admin_user, change):
    # 다른 활성 관리자가 있어도 자기 자신은 막는다.
    user_service.create_user(db_session, username="boss", password=ADMIN_PASSWORD, role=UserRole.ADMIN)
    res = client.patch(f"{A}/users/{admin_user.id}", json=change, headers=admin_headers)
    assert res.status_code == 409


def test_admin_can_patch_self_without_demotion(client, admin_headers, admin_user):
    res = client.patch(f"{A}/users/{admin_user.id}", json={"role": "admin", "is_active": True}, headers=admin_headers)
    assert res.status_code == 200


@pytest.mark.parametrize("change", [{"role": "user"}, {"is_active": False}])
def test_admin_can_change_other_admin(client, db_session, admin_headers, change):
    boss = user_service.create_user(db_session, username="boss", password=ADMIN_PASSWORD, role=UserRole.ADMIN)
    assert client.patch(f"{A}/users/{boss.id}", json=change, headers=admin_headers).status_code == 200


# HTTP 경로에서는 요청자 자신이 활성 관리자로 남으므로 "마지막 관리자" 는 자기 자신일 때만 생기고
# 자기 보호 규칙(409)이 먼저 막는다. 마지막 관리자 규칙은 서비스 계층의 최종 방어선이라 서비스로 직접 검증한다
# (actor_id=None: 시스템 작업 — 예: 관리 스크립트).
@pytest.mark.parametrize(("role", "is_active"), [("user", None), (None, False)])
def test_last_active_admin_guard(db_session, admin_user, role, is_active):
    from app.services import admin_service
    from app.services.exceptions import ServiceError

    inactive = user_service.create_user(db_session, username="boss", password=ADMIN_PASSWORD, role=UserRole.ADMIN)
    inactive.is_active = False  # 비활성 관리자는 "남는 관리자" 로 세지 않는다
    db_session.commit()
    with pytest.raises(ServiceError) as exc:
        admin_service.update_user(db_session, actor_id=None, user_id=admin_user.id, role=role, is_active=is_active)
    assert exc.value.code == "last_admin"
    db_session.refresh(admin_user)
    assert admin_user.role == "admin" and admin_user.is_active is True


def test_deactivate_user_revokes_sessions(client, db_session, admin_headers, normal_user):
    member_headers = _bearer(client, normal_user.username, USER_PASSWORD)
    assert client.get("/api/v1/auth/me", headers=member_headers).status_code == 200
    res = client.patch(f"{A}/users/{normal_user.id}", json={"is_active": False}, headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["is_active"] is False
    assert res.json()["active_session_count"] == 0
    sessions = db_session.execute(select(AuthSession).where(AuthSession.user_id == normal_user.id)).scalars().all()
    assert sessions and all(s.revoked_at is not None for s in sessions)
    assert client.get("/api/v1/auth/me", headers=member_headers).status_code == 401
    assert _login(client, normal_user.username, USER_PASSWORD).status_code == 401


# ---------------------------------------------------------------------------
# 세션
# ---------------------------------------------------------------------------


def test_list_sessions_active_only(client, db_session, admin_headers, normal_user):
    _bearer(client, normal_user.username, USER_PASSWORD)
    expired = AuthSession(user_id=normal_user.id, refresh_token_hash="e" * 64, expires_at=now() - timedelta(days=1))
    revoked = AuthSession(
        user_id=normal_user.id, refresh_token_hash="r" * 64, expires_at=now() + timedelta(days=1), revoked_at=now()
    )
    db_session.add_all([expired, revoked])
    db_session.commit()
    res = client.get(f"{A}/sessions", headers=admin_headers).json()
    assert res["total"] == 2
    assert set(res["items"][0]) == {"id", "user_id", "username", "created_at", "last_used_at", "expires_at"}
    only = client.get(f"{A}/sessions", params={"user_id": normal_user.id}, headers=admin_headers).json()
    assert [s["username"] for s in only["items"]] == ["member"]


def test_revoke_session(client, db_session, admin_headers, normal_user):
    member_headers = _bearer(client, normal_user.username, USER_PASSWORD)
    sid = client.get(f"{A}/sessions", params={"user_id": normal_user.id}, headers=admin_headers).json()["items"][0][
        "id"
    ]
    assert client.delete(f"{A}/sessions/{sid}", headers=admin_headers).status_code == 204
    assert client.get("/api/v1/auth/me", headers=member_headers).status_code == 401
    assert client.delete(f"{A}/sessions/{sid}", headers=admin_headers).status_code == 204  # 멱등
    assert client.delete(f"{A}/sessions/9999", headers=admin_headers).status_code == 404


def test_revoke_all_user_sessions(client, admin_headers, normal_user):
    h1 = _bearer(client, normal_user.username, USER_PASSWORD)
    h2 = _bearer(client, normal_user.username, USER_PASSWORD)
    res = client.delete(f"{A}/users/{normal_user.id}/sessions", headers=admin_headers)
    assert res.status_code == 200
    assert res.json() == {"revoked": 2}
    assert client.get("/api/v1/auth/me", headers=h1).status_code == 401
    assert client.get("/api/v1/auth/me", headers=h2).status_code == 401
    assert client.delete(f"{A}/users/9999/sessions", headers=admin_headers).status_code == 404


# ---------------------------------------------------------------------------
# 로그인 스로틀
# ---------------------------------------------------------------------------


def test_list_and_unlock_login_throttles(client, db_session, admin_headers, normal_user):
    for _ in range(get_settings().login_max_failures):
        _login(client, normal_user.username, "wrong-password")
    _login(client, "ghost", "wrong-password")
    db_session.add(LoginThrottle(username="ancient", failed_count=1, last_failed_at=now() - timedelta(days=3)))
    db_session.commit()
    assert _login(client, normal_user.username, USER_PASSWORD).status_code == 429

    items = client.get(f"{A}/login-throttles", headers=admin_headers).json()
    assert [i["username"] for i in items] == ["member", "ghost"]  # 잠금 먼저, 오래된 실패는 제외
    assert set(items[0]) == {"username", "failed_count", "locked_until", "last_failed_at", "is_locked"}
    assert items[0]["is_locked"] is True and items[0]["failed_count"] == get_settings().login_max_failures
    assert items[1]["is_locked"] is False

    assert client.delete(f"{A}/login-throttles/{normal_user.username}", headers=admin_headers).status_code == 204
    assert _login(client, normal_user.username, USER_PASSWORD).status_code == 200
    assert client.delete(f"{A}/login-throttles/nobody", headers=admin_headers).status_code == 204


# ---------------------------------------------------------------------------
# 에디터 이미지
# ---------------------------------------------------------------------------


def test_editor_image_upload(client, admin_headers, upload_dir):
    res = client.post(
        f"{A}/editor/images",
        files={"file": ("big.png", image_bytes("PNG", (3000, 600)), "image/png")},
        headers=admin_headers,
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert set(body) == {"key", "url", "width", "height"}
    assert body["key"].startswith("public/editor/")
    assert body["url"] == f"/uploads/{body['key']}"
    assert (body["width"], body["height"]) == (2000, 400)
    assert (upload_dir / body["key"]).is_file()


def test_editor_image_rejects_fake_image(client, admin_headers):
    res = client.post(
        f"{A}/editor/images",
        files={"file": ("x.png", b"<script>alert(1)</script>", "image/png")},
        headers=admin_headers,
    )
    assert res.status_code == 422


def test_editor_image_too_large(client, admin_headers, monkeypatch):
    monkeypatch.setenv("MAX_IMAGE_UPLOAD_MB", "1")
    get_settings.cache_clear()
    data = image_bytes("PNG", (10, 10)) + b"\x00" * (1024 * 1024)
    res = client.post(f"{A}/editor/images", files={"file": ("x.png", data, "image/png")}, headers=admin_headers)
    assert res.status_code == 413


def test_editor_image_requires_file_field(client, admin_headers):
    assert client.post(f"{A}/editor/images", headers=admin_headers).status_code == 422
