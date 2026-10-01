"""공개 이미지 업로드 서비스 — 에디터 본문 이미지·배너 이미지 (ARCHITECTURE.md §8).

검증·재인코딩·축소는 core/storage 가 하고, 여기서는 응답 형태(key·url·크기)를 만든다.
"""

from app.core import storage
from app.schemas.common import UploadedImage


def save_image(data: bytes, *, category: str) -> UploadedImage:
    stored = storage.save_image(data, category=category)
    return UploadedImage(key=stored.key, url=storage.public_url(stored.key), width=stored.width, height=stored.height)
