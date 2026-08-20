"""도메인 예외 (architecture.md §8).

서비스 계층은 실패를 ServiceError 로 던지고, 라우터에서 HTTP 로 변환한다.
"""


class ServiceError(Exception):
    def __init__(self, code: str, message: str = "") -> None:
        super().__init__(message or code)
        self.code = code
        self.message = message or code
