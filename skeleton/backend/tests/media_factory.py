"""테스트용 이미지 바이트 생성기 (Pillow)."""

import io

from PIL import Image

# EXIF Orientation 태그 번호와 "90도 회전 필요" 값.
EXIF_ORIENTATION_TAG = 0x0112
EXIF_ROTATE_90 = 6


def image_bytes(fmt: str = "PNG", size: tuple[int, int] = (64, 32), *, orientation: int | None = None) -> bytes:
    """단색 이미지 바이트. orientation 을 주면 EXIF(Orientation + 제조사 태그)를 심는다."""
    mode = "RGBA" if fmt in ("PNG", "WEBP") else ("P" if fmt == "GIF" else "RGB")
    img = Image.new(mode if mode != "P" else "RGB", size, (200, 30, 30))
    if mode == "P":
        img = img.convert("P")
    buf = io.BytesIO()
    kwargs: dict = {}
    if orientation is not None:
        exif = Image.Exif()
        exif[EXIF_ORIENTATION_TAG] = orientation
        exif[0x010F] = "TestCamera"  # Make — 제거됐는지 확인용
        kwargs["exif"] = exif.tobytes()
    img.save(buf, format=fmt, **kwargs)
    return buf.getvalue()


def open_image(data: bytes) -> Image.Image:
    img = Image.open(io.BytesIO(data))
    img.load()
    return img
