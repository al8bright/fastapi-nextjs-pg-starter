"""도메인 예외 (ARCHITECTURE.md §8).

서비스 계층은 실패를 ServiceError 로 던지고, 라우터에서 HTTP 로 변환한다.
"""


class ServiceError(Exception):
    """retry_after: 다시 시도할 수 있을 때까지 남은 초(정수 ≥1). 라우터가 Retry-After 헤더로 옮긴다.

    HTTP 개념을 서비스에 끌어들이지 않도록 "남은 시간" 이라는 도메인 값만 싣는다 (현재는 로그인 잠금 429).
    """

    def __init__(self, code: str, message: str = "", *, retry_after: int | None = None) -> None:
        super().__init__(message or code)
        self.code = code
        self.message = message or code
        self.retry_after = retry_after
