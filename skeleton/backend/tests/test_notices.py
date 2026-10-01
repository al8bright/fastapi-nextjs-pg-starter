"""공지사항 — 공개 API·관리자 API·첨부 테스트."""

from datetime import timedelta
from urllib.parse import quote

import pytest
from sqlalchemy import select

from app.api.files import content_disposition
from app.config import get_settings
from app.core.security import now
from app.models.notice import Notice, NoticeAttachment

PUBLIC = "/api/v1/notices"
ADMIN = "/api/v1/admin/notices"


def _create(client, headers, **overrides):
    body = {"title": "공지", "body_html": "<p>본문</p>", "is_pinned": False, "is_published": True}
    body.update(overrides)
    res = client.post(ADMIN, json=body, headers=headers)
    assert res.status_code == 201, res.text
    return res.json()


def _attach(client, headers, notice_id, name="안내문.pdf", data=b"%PDF-1.7 test"):
    return client.post(
        f"{ADMIN}/{notice_id}/attachments", files={"file": (name, data, "application/pdf")}, headers=headers
    )


# ---------------------------------------------------------------------------
# 인가
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", ADMIN),
        ("post", ADMIN),
        ("get", f"{ADMIN}/1"),
        ("put", f"{ADMIN}/1"),
        ("delete", f"{ADMIN}/1"),
        ("post", f"{ADMIN}/1/attachments"),
        ("delete", f"{ADMIN}/1/attachments/1"),
    ],
)
def test_admin_notice_routes_require_admin(client, user_headers, method, path):
    assert getattr(client, method)(path).status_code == 401
    assert getattr(client, method)(path, headers=user_headers).status_code == 403


def test_public_routes_need_no_auth(client):
    assert client.get(PUBLIC).status_code == 200


# ---------------------------------------------------------------------------
# 관리자 CRUD
# ---------------------------------------------------------------------------


def test_create_notice_sanitizes_body(client, admin_headers, admin_user, db_session):
    created = _create(
        client,
        admin_headers,
        body_html='<p class="ql-x" style="color:red" onclick="x()">안녕<script>alert(1)</script></p>'
        '<iframe src="https://evil.example/x"></iframe><img src="data:image/png;base64,AA">',
    )
    assert created["body_html"] == "<p>안녕</p><img>"
    row = db_session.get(Notice, created["id"])
    assert row.body_html == "<p>안녕</p><img>"
    assert row.author_id == admin_user.id
    assert created["author_username"] == admin_user.username


def test_update_notice_sanitizes_body(client, admin_headers):
    created = _create(client, admin_headers)
    res = client.put(
        f"{ADMIN}/{created['id']}",
        json={"title": "수정", "body_html": '<p onclick="x()">수정본</p>', "is_pinned": True, "is_published": True},
        headers=admin_headers,
    )
    assert res.status_code == 200
    assert res.json()["body_html"] == "<p>수정본</p>"
    assert res.json()["title"] == "수정"
    assert res.json()["is_pinned"] is True


@pytest.mark.parametrize("body", ["", "<p><br></p>", "<p>&nbsp;</p>", "<script>x</script>", '<img src="data:x">'])
def test_empty_body_rejected(client, admin_headers, body):
    res = client.post(ADMIN, json={"title": "t", "body_html": body}, headers=admin_headers)
    assert res.status_code == 422


def test_image_only_body_accepted(client, admin_headers):
    _create(client, admin_headers, body_html='<p><img src="/uploads/public/editor/2026/01/01/a.png"></p>')


@pytest.mark.parametrize("title", ["", "   ", "x" * 201])
def test_invalid_title_rejected(client, admin_headers, title):
    res = client.post(ADMIN, json={"title": title, "body_html": "<p>a</p>"}, headers=admin_headers)
    assert res.status_code == 422


def test_published_at_set_on_first_publish_only(client, admin_headers, db_session):
    draft = _create(client, admin_headers, is_published=False)
    assert draft["published_at"] is None
    url = f"{ADMIN}/{draft['id']}"
    body = {"title": "공지", "body_html": "<p>본문</p>", "is_pinned": False}
    first = client.put(url, json={**body, "is_published": True}, headers=admin_headers).json()
    assert first["published_at"] is not None
    client.put(url, json={**body, "is_published": False}, headers=admin_headers)
    again = client.put(url, json={**body, "is_published": True}, headers=admin_headers).json()
    assert again["published_at"] == first["published_at"]


def test_admin_list_includes_drafts_and_search(client, admin_headers):
    _create(client, admin_headers, title="공개 공지")
    _create(client, admin_headers, title="임시 저장", is_published=False)
    res = client.get(ADMIN, headers=admin_headers).json()
    assert res["total"] == 2
    assert {i["title"] for i in res["items"]} == {"공개 공지", "임시 저장"}
    assert {"is_published", "author_username", "has_attachments"} <= set(res["items"][0])
    searched = client.get(ADMIN, params={"q": "임시"}, headers=admin_headers).json()
    assert [i["title"] for i in searched["items"]] == ["임시 저장"]


def test_admin_get_and_404(client, admin_headers):
    created = _create(client, admin_headers, is_published=False)
    assert client.get(f"{ADMIN}/{created['id']}", headers=admin_headers).json()["body_html"] == "<p>본문</p>"
    assert client.get(f"{ADMIN}/9999", headers=admin_headers).status_code == 404
    assert (
        client.put(f"{ADMIN}/9999", json={"title": "t", "body_html": "<p>a</p>"}, headers=admin_headers).status_code
        == 404
    )
    assert client.delete(f"{ADMIN}/9999", headers=admin_headers).status_code == 404


def test_delete_notice_removes_attachment_files(client, admin_headers, db_session, upload_dir):
    created = _create(client, admin_headers)
    _attach(client, admin_headers, created["id"])
    key = db_session.execute(select(NoticeAttachment.storage_key)).scalar_one()
    assert (upload_dir / key).is_file()
    assert client.delete(f"{ADMIN}/{created['id']}", headers=admin_headers).status_code == 204
    assert not (upload_dir / key).exists()
    assert db_session.execute(select(NoticeAttachment)).first() is None
    assert client.get(f"{PUBLIC}/{created['id']}").status_code == 404


# ---------------------------------------------------------------------------
# 첨부
# ---------------------------------------------------------------------------


def test_upload_attachment(client, admin_headers, upload_dir):
    created = _create(client, admin_headers)
    res = _attach(client, admin_headers, created["id"])
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["original_name"] == "안내문.pdf"
    assert body["size_bytes"] == len(b"%PDF-1.7 test")
    assert body["content_type"] == "application/pdf"
    assert body["download_url"] == f"/api/v1/notices/{created['id']}/attachments/{body['id']}"
    private_files = list((upload_dir / "private").rglob("*.pdf"))
    assert len(private_files) == 1
    assert "안내문" not in private_files[0].name


def test_attachment_disallowed_type(client, admin_headers):
    created = _create(client, admin_headers)
    assert _attach(client, admin_headers, created["id"], name="run.exe").status_code == 422


def test_attachment_too_large(client, admin_headers, monkeypatch):
    monkeypatch.setenv("MAX_ATTACHMENT_UPLOAD_MB", "1")
    get_settings.cache_clear()
    created = _create(client, admin_headers)
    res = _attach(client, admin_headers, created["id"], data=b"x" * (1024 * 1024 + 1))
    assert res.status_code == 413


def test_attachment_limit_per_notice(client, admin_headers):
    created = _create(client, admin_headers)
    for i in range(10):
        assert _attach(client, admin_headers, created["id"], name=f"{i}.txt").status_code == 201
    assert _attach(client, admin_headers, created["id"], name="11.txt").status_code == 409


def test_attachment_on_missing_notice(client, admin_headers):
    assert _attach(client, admin_headers, 9999).status_code == 404


def test_delete_attachment(client, admin_headers, upload_dir, db_session):
    created = _create(client, admin_headers)
    att = _attach(client, admin_headers, created["id"]).json()
    key = db_session.get(NoticeAttachment, att["id"]).storage_key
    url = f"{ADMIN}/{created['id']}/attachments/{att['id']}"
    assert client.delete(url, headers=admin_headers).status_code == 204
    assert not (upload_dir / key).exists()
    assert client.delete(url, headers=admin_headers).status_code == 404


def test_delete_attachment_of_other_notice_404(client, admin_headers):
    a = _create(client, admin_headers)
    b = _create(client, admin_headers)
    att = _attach(client, admin_headers, a["id"]).json()
    assert client.delete(f"{ADMIN}/{b['id']}/attachments/{att['id']}", headers=admin_headers).status_code == 404


def test_admin_can_download_draft_attachment(client, admin_headers):
    created = _create(client, admin_headers, is_published=False)
    att = _attach(client, admin_headers, created["id"]).json()
    url = f"{ADMIN}/{created['id']}/attachments/{att['id']}"
    res = client.get(url, headers=admin_headers)
    assert res.status_code == 200
    assert res.content == b"%PDF-1.7 test"
    assert client.get(url).status_code == 401


# ---------------------------------------------------------------------------
# 공개 API
# ---------------------------------------------------------------------------


def test_public_list_published_only_pinned_first(client, admin_headers, db_session):
    old = _create(client, admin_headers, title="오래된 공지")
    new = _create(client, admin_headers, title="새 공지")
    pinned = _create(client, admin_headers, title="고정 공지", is_pinned=True)
    _create(client, admin_headers, title="임시", is_published=False)
    # published_at 순서를 확정한다(같은 초 생성 대비).
    db_session.get(Notice, old["id"]).published_at = now() - timedelta(days=3)
    db_session.get(Notice, new["id"]).published_at = now() - timedelta(days=1)
    db_session.get(Notice, pinned["id"]).published_at = now() - timedelta(days=10)
    db_session.commit()
    res = client.get(PUBLIC).json()
    assert [i["title"] for i in res["items"]] == ["고정 공지", "새 공지", "오래된 공지"]
    assert res["total"] == 3
    assert (res["page"], res["size"]) == (1, 20)
    assert set(res["items"][0]) == {"id", "title", "is_pinned", "published_at", "view_count", "has_attachments"}


def test_public_list_paging_and_search(client, admin_headers):
    for i in range(5):
        _create(client, admin_headers, title=f"공지 {i}")
    _create(client, admin_headers, title="채용 안내")
    page2 = client.get(PUBLIC, params={"page": 2, "size": 2}).json()
    assert page2["total"] == 6 and len(page2["items"]) == 2 and page2["page"] == 2
    assert [i["title"] for i in client.get(PUBLIC, params={"q": "채용"}).json()["items"]] == ["채용 안내"]
    # LIKE 와일드카드는 글자 그대로 검색한다.
    assert client.get(PUBLIC, params={"q": "%"}).json()["total"] == 0
    assert client.get(PUBLIC, params={"size": 101}).status_code == 422
    assert client.get(PUBLIC, params={"page": 0}).status_code == 422


def test_public_list_has_attachments(client, admin_headers):
    created = _create(client, admin_headers)
    _attach(client, admin_headers, created["id"])
    assert client.get(PUBLIC).json()["items"][0]["has_attachments"] is True


def test_public_detail_increments_view_count(client, admin_headers):
    created = _create(client, admin_headers)
    _attach(client, admin_headers, created["id"])
    first = client.get(f"{PUBLIC}/{created['id']}").json()
    second = client.get(f"{PUBLIC}/{created['id']}").json()
    assert (first["view_count"], second["view_count"]) == (1, 2)
    assert second["body_html"] == "<p>본문</p>"
    att = second["attachments"][0]
    assert set(att) == {"id", "original_name", "size_bytes", "content_type", "download_url"}
    assert client.get(PUBLIC).json()["items"][0]["view_count"] == 2


def test_public_detail_hides_drafts(client, admin_headers):
    draft = _create(client, admin_headers, is_published=False)
    assert client.get(f"{PUBLIC}/{draft['id']}").status_code == 404
    assert client.get(f"{PUBLIC}/9999").status_code == 404


def test_public_download_headers_korean_filename(client, admin_headers):
    name = "2026 안내문 (최종).pdf"
    created = _create(client, admin_headers)
    att = _attach(client, admin_headers, created["id"], name=name).json()
    res = client.get(att["download_url"])
    assert res.status_code == 200
    assert res.content == b"%PDF-1.7 test"
    assert res.headers["content-type"] == "application/pdf"
    assert res.headers["x-content-type-options"] == "nosniff"
    assert res.headers["cache-control"] == "private, no-store"
    cd = res.headers["content-disposition"]
    assert cd.startswith("attachment;")
    assert f"filename*=UTF-8''{quote(name, safe='')}" in cd
    # ASCII 대체 이름(구형 클라이언트용)에는 비ASCII 가 없다.
    fallback = cd.split('filename="', 1)[1].split('"', 1)[0]
    assert fallback.isascii() and fallback.endswith(".pdf")


def test_content_disposition_escapes_quotes_and_backslashes():
    cd = content_disposition('a"b\\c 안.pdf')
    assert cd.startswith('attachment; filename="a_b_c _.pdf"; ')
    assert cd.endswith("filename*=UTF-8''a%22b%5Cc%20%EC%95%88.pdf")


def test_public_download_text_attachment_content_type(client, admin_headers):
    created = _create(client, admin_headers)
    att = _attach(client, admin_headers, created["id"], name="memo.txt", data=b"hello").json()
    res = client.get(att["download_url"])
    assert res.headers["content-type"].startswith("text/plain")
    assert res.headers["content-disposition"].startswith("attachment;")


def test_public_download_draft_or_mismatch_404(client, admin_headers):
    draft = _create(client, admin_headers, is_published=False)
    att = _attach(client, admin_headers, draft["id"]).json()
    assert client.get(att["download_url"]).status_code == 404
    other = _create(client, admin_headers)
    assert client.get(f"{PUBLIC}/{other['id']}/attachments/{att['id']}").status_code == 404


def test_public_download_missing_file_404(client, admin_headers, db_session, upload_dir):
    created = _create(client, admin_headers)
    att = _attach(client, admin_headers, created["id"]).json()
    (upload_dir / db_session.get(NoticeAttachment, att["id"]).storage_key).unlink()
    assert client.get(att["download_url"]).status_code == 404


def test_download_url_uses_public_files_base_url(client, admin_headers, monkeypatch):
    monkeypatch.setenv("PUBLIC_FILES_BASE_URL", "http://localhost:8000")
    get_settings.cache_clear()
    created = _create(client, admin_headers)
    att = _attach(client, admin_headers, created["id"]).json()
    assert att["download_url"] == f"http://localhost:8000/api/v1/notices/{created['id']}/attachments/{att['id']}"
