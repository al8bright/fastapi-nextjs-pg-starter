"""파일 다운로드·업로드 공통 HTTP 처리 (첨부 다운로드 응답, 업로드 크기 제한 읽기)."""

import re
from pathlib import Path
from urllib.parse import quote

from fastapi import UploadFile
from fastapi.responses import FileResponse

from app.core import storage

MB = 1024 * 1024


def content_disposition(filename: str) -> str:
    """attachment + ASCII 대체 filename + RFC 5987 filename* (한글 등 비ASCII 파일명용)."""
    fallback = re.sub(r'[^\x20-\x7e]|["\\]', "_", filename).strip() or "download"
    return f"attachment; filename=\"{fallback}\"; filename*=UTF-8''{quote(filename, safe='')}"


def attachment_response(path: Path, *, filename: str, content_type: str | None) -> FileResponse:
    """항상 다운로드(attachment)로 내려 브라우저가 인라인 렌더링하지 않게 한다.

    nosniff 는 보안 헤더 미들웨어가 모든 응답에 붙인다.
    """
    return FileResponse(
        path,
        media_type=content_type or "application/octet-stream",
        headers={"Content-Disposition": content_disposition(filename), "Cache-Control": "private, no-store"},
    )


def read_upload(file: UploadFile, *, max_mb: int) -> bytes:
    """업로드 파일을 상한(MB)까지만 읽는다. 넘으면 StorageError("file_too_large") → 413."""
    return storage.read_limited(file.file, max_mb * MB)
