"""도메인 예외 → HTTP 응답 변환 (ARCHITECTURE.md §8 "실패는 도메인 예외로 던지고 라우터에서 HTTP 로 변환").

라우터마다 같은 try/except 를 반복하지 않도록 ServiceError·StorageError 를 앱 전역 핸들러로 변환한다.
코드별 상태는 아래 표 한 곳에서 정한다. 표에 없는 코드는 400 이다.
인증 라우터(auth.py)는 401/429 와 쿠키·헤더 처리가 얽혀 있어 지금처럼 직접 변환한다.
"""

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

from app.core.storage import StorageError
from app.services.exceptions import ServiceError

STATUS_BY_CODE: dict[str, int] = {
    "not_found": status.HTTP_404_NOT_FOUND,
    "self_modification": status.HTTP_409_CONFLICT,
    "last_admin": status.HTTP_409_CONFLICT,
    "too_many_attachments": status.HTTP_409_CONFLICT,
    "file_too_large": status.HTTP_413_CONTENT_TOO_LARGE,
    "empty_body": status.HTTP_422_UNPROCESSABLE_CONTENT,
    "invalid_image": status.HTTP_422_UNPROCESSABLE_CONTENT,
    "invalid_image_key": status.HTTP_422_UNPROCESSABLE_CONTENT,
    "unsupported_file_type": status.HTTP_422_UNPROCESSABLE_CONTENT,
    "invalid_filename": status.HTTP_422_UNPROCESSABLE_CONTENT,
    "invalid_reorder": status.HTTP_422_UNPROCESSABLE_CONTENT,
    "invalid_key": status.HTTP_422_UNPROCESSABLE_CONTENT,
}


def _response(code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=STATUS_BY_CODE.get(code, status.HTTP_400_BAD_REQUEST),
        content={"detail": message, "code": code},
    )


async def _service_error_handler(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, ServiceError | StorageError)
    return _response(exc.code, exc.message)


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(ServiceError, _service_error_handler)
    app.add_exception_handler(StorageError, _service_error_handler)
