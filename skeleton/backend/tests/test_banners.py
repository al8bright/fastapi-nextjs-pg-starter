"""배너 — 공개 노출 창(window) 로직·관리자 API·이미지 업로드 테스트."""

from datetime import UTC, datetime, timedelta

import pytest

from app.config import get_settings
from app.core.security import now
from app.models.banner import Banner
from tests.media_factory import image_bytes

PUBLIC = "/api/v1/banners"
ADMIN = "/api/v1/admin/banners"


def _upload(client, headers, data=None, name="banner.png"):
    data = image_bytes("PNG", (1200, 400)) if data is None else data
    return client.post(f"{ADMIN}/image", files={"file": (name, data, "image/png")}, headers=headers)


def _create(client, headers, **overrides):
    key = _upload(client, headers).json()["key"]
    body = {"title": "배너", "image_key": key, "link_url": "/notices/1", "alt_text": "대체 텍스트"}
    body.update(overrides)
    res = client.post(ADMIN, json=body, headers=headers)
    assert res.status_code == 201, res.text
    return res.json()


def _iso(dt):
    return dt.replace(microsecond=0).isoformat()


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", ADMIN),
        ("post", ADMIN),
        ("get", f"{ADMIN}/1"),
        ("put", f"{ADMIN}/1"),
        ("delete", f"{ADMIN}/1"),
        ("post", f"{ADMIN}/image"),
        ("patch", f"{ADMIN}/order"),
    ],
)
def test_admin_banner_routes_require_admin(client, user_headers, method, path):
    assert getattr(client, method)(path).status_code == 401
    assert getattr(client, method)(path, headers=user_headers).status_code == 403


def test_upload_banner_image(client, admin_headers, upload_dir):
    res = _upload(client, admin_headers)
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["key"].startswith("public/banners/")
    assert body["url"] == f"/uploads/{body['key']}"
    assert (body["width"], body["height"]) == (1200, 400)
    assert (upload_dir / body["key"]).is_file()


def test_upload_banner_rejects_non_image(client, admin_headers):
    assert _upload(client, admin_headers, data=b"<svg></svg>", name="x.svg").status_code == 422


def test_upload_banner_too_large(client, admin_headers, monkeypatch):
    monkeypatch.setenv("MAX_IMAGE_UPLOAD_MB", "1")
    get_settings.cache_clear()
    data = image_bytes("PNG", (10, 10)) + b"\x00" * (1024 * 1024)
    assert _upload(client, admin_headers, data=data).status_code == 413


def test_create_banner_copies_image_dimensions(client, admin_headers):
    created = _create(client, admin_headers)
    assert (created["image_width"], created["image_height"]) == (1200, 400)
    assert created["image_url"] == f"/uploads/{created['image_key']}"
    assert created["is_active"] is True
    assert created["sort_order"] == 0
    assert _create(client, admin_headers)["sort_order"] == 1


@pytest.mark.parametrize(
    "key",
    [
        "public/banners/2026/01/01/" + "0" * 32 + ".png",  # 형식은 맞지만 파일이 없다
        "public/editor/2026/01/01/" + "0" * 32 + ".png",
        "private/attachments/2026/01/01/" + "0" * 32 + ".pdf",
        "../../etc/passwd",
    ],
)
def test_create_banner_rejects_bad_image_key(client, admin_headers, key):
    res = client.post(ADMIN, json={"title": "b", "image_key": key}, headers=admin_headers)
    assert res.status_code == 422


def test_create_banner_rejects_editor_image_key(client, admin_headers):
    key = client.post(
        "/api/v1/admin/editor/images", files={"file": ("a.png", image_bytes(), "image/png")}, headers=admin_headers
    ).json()["key"]
    assert client.post(ADMIN, json={"title": "b", "image_key": key}, headers=admin_headers).status_code == 422


@pytest.mark.parametrize(
    "link",
    ["javascript:alert(1)", "//evil.example", "/\\evil.example", "ftp://x", "data:text/html,x", "notes", "https://"],
)
def test_link_url_validation_rejects(client, admin_headers, link):
    key = _upload(client, admin_headers).json()["key"]
    res = client.post(ADMIN, json={"title": "b", "image_key": key, "link_url": link}, headers=admin_headers)
    assert res.status_code == 422


@pytest.mark.parametrize("link", ["https://example.com/a?b=1", "http://example.com", "/events/3", None, ""])
def test_link_url_validation_accepts(client, admin_headers, link):
    created = _create(client, admin_headers, link_url=link)
    assert created["link_url"] == (link or None)


def test_ends_before_starts_rejected(client, admin_headers):
    key = _upload(client, admin_headers).json()["key"]
    t = now()
    res = client.post(
        ADMIN,
        json={"title": "b", "image_key": key, "starts_at": _iso(t), "ends_at": _iso(t - timedelta(hours=1))},
        headers=admin_headers,
    )
    assert res.status_code == 422


def test_update_banner_replaces_image_and_deletes_old_file(client, admin_headers, upload_dir):
    created = _create(client, admin_headers)
    old_key = created["image_key"]
    new = _upload(client, admin_headers, data=image_bytes("JPEG", (300, 100))).json()
    res = client.put(
        f"{ADMIN}/{created['id']}",
        json={"title": "새 제목", "image_key": new["key"], "alt_text": "새 대체", "is_active": False},
        headers=admin_headers,
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert (body["title"], body["image_key"], body["is_active"]) == ("새 제목", new["key"], False)
    assert (body["image_width"], body["image_height"]) == (300, 100)
    assert body["sort_order"] == created["sort_order"]  # 생략하면 유지
    assert not (upload_dir / old_key).exists()


def test_get_and_delete_banner_removes_file(client, admin_headers, upload_dir):
    created = _create(client, admin_headers)
    url = f"{ADMIN}/{created['id']}"
    assert client.get(url, headers=admin_headers).json()["id"] == created["id"]
    assert client.delete(url, headers=admin_headers).status_code == 204
    assert not (upload_dir / created["image_key"]).exists()
    assert client.get(url, headers=admin_headers).status_code == 404
    assert client.delete(url, headers=admin_headers).status_code == 404


def test_reorder_banners(client, admin_headers):
    a, b, c = (_create(client, admin_headers, title=t)["id"] for t in "abc")
    res = client.patch(f"{ADMIN}/order", json={"ids": [c, a]}, headers=admin_headers)
    assert res.status_code == 200
    # 나열한 순서대로 앞에 두고, 빠진 배너는 기존 순서대로 뒤에 붙는다.
    assert [x["id"] for x in res.json()] == [c, a, b]
    assert [x["sort_order"] for x in res.json()] == [0, 1, 2]
    assert [x["id"] for x in client.get(ADMIN, headers=admin_headers).json()] == [c, a, b]


def test_reorder_rejects_unknown_or_duplicate_ids(client, admin_headers):
    a = _create(client, admin_headers)["id"]
    assert client.patch(f"{ADMIN}/order", json={"ids": [a, 999]}, headers=admin_headers).status_code == 422
    assert client.patch(f"{ADMIN}/order", json={"ids": [a, a]}, headers=admin_headers).status_code == 422
    assert client.patch(f"{ADMIN}/order", json={"ids": []}, headers=admin_headers).status_code == 422


def test_public_banners_window_logic(client, admin_headers, db_session):
    t = now()
    live = _create(client, admin_headers, title="상시")
    in_window = _create(
        client,
        admin_headers,
        title="기간 내",
        starts_at=_iso(t - timedelta(days=1)),
        ends_at=_iso(t + timedelta(days=1)),
    )
    _create(client, admin_headers, title="예정", starts_at=_iso(t + timedelta(days=1)))
    _create(client, admin_headers, title="종료", ends_at=_iso(t - timedelta(minutes=1)))
    _create(client, admin_headers, title="비활성", is_active=False)
    res = client.get(PUBLIC)
    assert res.status_code == 200
    items = res.json()
    assert [i["title"] for i in items] == ["상시", "기간 내"]
    assert set(items[0]) == {"id", "title", "image_url", "width", "height", "link_url", "alt_text"}
    assert items[0]["image_url"] == live["image_url"]
    # 정렬은 sort_order → id.
    db_session.get(Banner, in_window["id"]).sort_order = -1
    db_session.commit()
    assert [i["title"] for i in client.get(PUBLIC).json()] == ["기간 내", "상시"]


def test_public_banner_image_url_uses_base(client, admin_headers, monkeypatch):
    monkeypatch.setenv("PUBLIC_FILES_BASE_URL", "http://localhost:8000")
    get_settings.cache_clear()
    created = _create(client, admin_headers)
    assert client.get(PUBLIC).json()[0]["image_url"] == f"http://localhost:8000/uploads/{created['image_key']}"


def test_timezone_aware_datetimes_stored_as_local_naive(client, admin_headers, db_session):
    # 오프셋이 붙은 시각(예: JS toISOString 의 Z)은 프로세스 로컬 시각(KST 정책)의 naive 로 바꿔 저장한다.
    created = _create(client, admin_headers, starts_at="2026-10-02T00:00:00+00:00")
    row = db_session.get(Banner, created["id"])
    expected = datetime(2026, 10, 2, tzinfo=UTC).astimezone().replace(tzinfo=None)
    assert row.starts_at == expected
    assert row.starts_at.tzinfo is None


def test_shared_image_kept_until_last_reference_deleted(client, admin_headers, upload_dir):
    first = _create(client, admin_headers)
    second = client.post(
        ADMIN, json={"title": "같은 이미지", "image_key": first["image_key"]}, headers=admin_headers
    ).json()
    client.delete(f"{ADMIN}/{first['id']}", headers=admin_headers)
    assert (upload_dir / first["image_key"]).is_file()
    client.delete(f"{ADMIN}/{second['id']}", headers=admin_headers)
    assert not (upload_dir / first["image_key"]).exists()
