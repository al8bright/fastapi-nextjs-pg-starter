"""로컬 업로드 저장소 테스트 — 이미지 검증·재인코딩·축소, 첨부 허용 목록, 경로 탈출 방지."""

import io
import re

import pytest

from app.config import BACKEND_ROOT, get_settings
from app.core import storage
from app.core.storage import StorageError
from tests.media_factory import EXIF_ORIENTATION_TAG, EXIF_ROTATE_90, image_bytes, open_image

KEY_RE = re.compile(r"^public/editor/\d{4}/\d{2}/\d{2}/[0-9a-f]{32}\.(png|jpg|webp|gif)$")


def test_default_upload_dir_is_backend_uploads(monkeypatch):
    monkeypatch.delenv("UPLOAD_DIR")
    get_settings.cache_clear()
    assert get_settings().upload_dir == BACKEND_ROOT / "uploads"


def test_relative_upload_dir_resolves_against_backend_root(monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", "data/files")
    get_settings.cache_clear()
    assert get_settings().upload_dir == BACKEND_ROOT / "data" / "files"


def test_upload_dir_comes_from_settings(upload_dir):
    assert get_settings().upload_dir == upload_dir


# ---------------------------------------------------------------------------
# 이미지
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(("fmt", "ext"), [("PNG", "png"), ("JPEG", "jpg"), ("WEBP", "webp"), ("GIF", "gif")])
def test_save_image_accepts_allowed_formats(upload_dir, fmt, ext):
    stored = storage.save_image(image_bytes(fmt, (40, 20)), category="editor")
    assert KEY_RE.match(stored.key)
    assert stored.key.endswith("." + ext)
    assert (stored.width, stored.height) == (40, 20)
    assert (upload_dir / stored.key).is_file()


def test_large_png_downscaled_to_max_long_edge(upload_dir):
    stored = storage.save_image(image_bytes("PNG", (3000, 1500)), category="editor")
    assert (stored.width, stored.height) == (storage.MAX_LONG_EDGE, 1000)
    saved = open_image((upload_dir / stored.key).read_bytes())
    assert saved.size == (2000, 1000)


def test_portrait_downscaled_by_height(upload_dir):
    stored = storage.save_image(image_bytes("JPEG", (1000, 4000)), category="editor")
    assert (stored.width, stored.height) == (500, 2000)


def test_small_image_not_upscaled():
    stored = storage.save_image(image_bytes("PNG", (10, 10)), category="editor")
    assert (stored.width, stored.height) == (10, 10)


def test_jpeg_exif_applied_then_stripped(upload_dir):
    # 가로 60x30 원본 + Orientation=6(90도 회전) → 저장본은 세로 30x60, EXIF 없음.
    data = image_bytes("JPEG", (60, 30), orientation=EXIF_ROTATE_90)
    assert open_image(data).getexif().get(EXIF_ORIENTATION_TAG) == EXIF_ROTATE_90
    stored = storage.save_image(data, category="editor")
    assert (stored.width, stored.height) == (30, 60)
    saved_bytes = (upload_dir / stored.key).read_bytes()
    saved = open_image(saved_bytes)
    assert saved.size == (30, 60)
    assert len(saved.getexif()) == 0
    assert b"TestCamera" not in saved_bytes


def test_gif_stored_byte_for_byte(upload_dir):
    data = image_bytes("GIF", (30, 30))
    stored = storage.save_image(data, category="editor")
    assert (upload_dir / stored.key).read_bytes() == data


@pytest.mark.parametrize(
    "data",
    [
        b"not an image at all",
        b"%PDF-1.7\n...",
        b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>",
        b"\x89PNG\r\n\x1a\n" + b"\x00" * 32,  # 시그니처만 맞고 깨진 PNG
        b"",
    ],
)
def test_non_image_rejected(upload_dir, data):
    with pytest.raises(StorageError) as exc:
        storage.save_image(data, category="editor")
    assert exc.value.code == "invalid_image"
    assert not upload_dir.exists() or not any(p.is_file() for p in upload_dir.rglob("*"))


def test_bmp_rejected_even_though_pillow_can_open():
    buf = io.BytesIO()
    from PIL import Image

    Image.new("RGB", (4, 4)).save(buf, format="BMP")
    with pytest.raises(StorageError) as exc:
        storage.save_image(buf.getvalue(), category="editor")
    assert exc.value.code == "invalid_image"


def test_banner_category_prefix():
    stored = storage.save_image(image_bytes(), category="banners")
    assert stored.key.startswith("public/banners/")


def test_unknown_category_rejected():
    with pytest.raises(ValueError):
        storage.save_image(image_bytes(), category="../private")


# ---------------------------------------------------------------------------
# 크기 제한 읽기
# ---------------------------------------------------------------------------


def test_read_limited_within_limit():
    assert storage.read_limited(io.BytesIO(b"abc"), 3) == b"abc"


def test_read_limited_oversize_rejected():
    with pytest.raises(StorageError) as exc:
        storage.read_limited(io.BytesIO(b"abcd"), 3)
    assert exc.value.code == "file_too_large"


# ---------------------------------------------------------------------------
# 첨부
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "name", ["보고서.pdf", "a.HWP", "b.hwpx", "c.docx", "d.xlsx", "e.pptx", "f.txt", "g.csv", "h.zip", "i.JPEG"]
)
def test_attachment_allowed_extensions(upload_dir, name):
    stored = storage.save_attachment(b"content", name)
    ext = name.rsplit(".", 1)[1].lower()
    assert re.match(rf"^private/attachments/\d{{4}}/\d{{2}}/\d{{2}}/[0-9a-f]{{32}}\.{ext}$", stored.key)
    assert stored.size_bytes == 7
    path = upload_dir / stored.key
    assert path.read_bytes() == b"content"
    # 디스크에는 사용자의 파일명이 아니라 무작위 이름으로 저장된다.
    assert re.fullmatch(rf"[0-9a-f]{{32}}\.{ext}", path.name)


@pytest.mark.parametrize("name", ["x.exe", "x.html", "x.svg", "x.js", "noext", "x.pdf.exe", ".pdf", ""])
def test_attachment_disallowed_extensions(name):
    with pytest.raises(StorageError) as exc:
        storage.save_attachment(b"x", name)
    assert exc.value.code == "unsupported_file_type"


def test_attachment_content_type_from_extension_not_client():
    assert storage.save_attachment(b"x", "a.pdf").content_type == "application/pdf"
    assert storage.save_attachment(b"x", "a.hwp").content_type == "application/x-hwp"
    assert storage.save_attachment(b"x", "a.txt").content_type == "text/plain"


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("C:\\Users\\me\\보고서.pdf", "보고서.pdf"),
        ("../../etc/passwd.txt", "passwd.txt"),
        ("a\x00b\r\n.pdf", "ab.pdf"),
    ],
)
def test_clean_original_name(raw, expected):
    assert storage.clean_original_name(raw) == expected


def test_clean_original_name_truncates_keeping_extension():
    name = storage.clean_original_name("가" * 300 + ".pdf")
    assert len(name) == 255
    assert name.endswith(".pdf")


# ---------------------------------------------------------------------------
# 키 해석 · 경로 탈출 방지 · 삭제 · URL
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "key",
    [
        "../secret.txt",
        "public/../../secret.txt",
        "public/editor/2026/01/01/../../../../x.png",
        "/etc/passwd",
        "C:/Windows/win.ini",
        "public\\editor\\x.png",
        "public/editor/x.png",  # 서버가 만든 형식이 아니다
        "",
    ],
)
def test_resolve_rejects_untrusted_keys(key):
    with pytest.raises(StorageError) as exc:
        storage.resolve_key(key)
    assert exc.value.code == "invalid_key"


def test_resolve_stays_inside_upload_dir(upload_dir):
    stored = storage.save_image(image_bytes(), category="editor")
    path = storage.resolve_key(stored.key)
    assert path.is_relative_to(upload_dir.resolve())


def test_exists_and_delete(upload_dir):
    stored = storage.save_image(image_bytes(), category="editor")
    assert storage.exists(stored.key)
    storage.delete(stored.key)
    assert not storage.exists(stored.key)
    storage.delete(stored.key)  # 없는 파일 삭제는 조용히 넘어간다
    assert storage.exists("../x") is False


def test_public_url_root_relative_by_default():
    stored = storage.save_image(image_bytes(), category="editor")
    assert storage.public_url(stored.key) == f"/uploads/{stored.key}"


def test_public_url_with_base(monkeypatch):
    monkeypatch.setenv("PUBLIC_FILES_BASE_URL", "http://localhost:8000/")
    get_settings.cache_clear()
    stored = storage.save_image(image_bytes(), category="editor")
    assert storage.public_url(stored.key) == f"http://localhost:8000/uploads/{stored.key}"


def test_public_url_refuses_private_key():
    stored = storage.save_attachment(b"x", "a.pdf")
    with pytest.raises(ValueError):
        storage.public_url(stored.key)
