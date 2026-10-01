"""/uploads 정적 서빙 테스트 — public 만 서빙되고 private 첨부는 어떤 경로로도 닿지 않아야 한다."""

import pytest

from app.core import storage
from tests.media_factory import image_bytes


def test_public_upload_served_with_security_headers(client, upload_dir):
    stored = storage.save_image(image_bytes("PNG", (8, 8)), category="editor")
    res = client.get(storage.public_url(stored.key))
    assert res.status_code == 200
    assert res.headers["content-type"] == "image/png"
    assert res.content == (upload_dir / stored.key).read_bytes()
    assert res.headers["x-content-type-options"] == "nosniff"
    assert "immutable" in res.headers["cache-control"]


def test_public_upload_missing_is_404(client):
    assert client.get("/uploads/public/editor/2026/01/01/" + "0" * 32 + ".png").status_code == 404


@pytest.mark.parametrize(
    "path_template",
    [
        "/uploads/{key}",
        "/uploads/public/../{key}",
        "/uploads/public/%2e%2e/{key}",
        "/uploads/public/..%2f{key}",
        "/uploads/public/%2e%2e%2f{key}",
        "/uploads/public/..%5c{key}",
    ],
)
def test_private_attachment_not_reachable(client, path_template):
    stored = storage.save_attachment(b"secret-content", "a.pdf")
    res = client.get(path_template.format(key=stored.key))
    assert res.status_code == 404
    assert b"secret-content" not in res.content


def test_lifespan_creates_upload_dirs(lifespan_client, upload_dir):
    assert (upload_dir / "public").is_dir()
    assert (upload_dir / "private").is_dir()
