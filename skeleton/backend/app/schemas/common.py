"""공통 스키마 — 페이지 응답·업로드 응답 (ARCHITECTURE.md §8)."""

from pydantic import BaseModel

# 목록 API 의 페이지 크기 기본값·상한 (라우터의 Query 검증에서 쓴다).
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100
# 검색어 상한 — LIKE 검색에 비정상적으로 긴 입력을 넣지 않게 한다.
MAX_QUERY_LENGTH = 100


class Page[T](BaseModel):
    """페이지 응답. page 는 1부터, total 은 필터 적용 후 전체 건수."""

    items: list[T]
    total: int
    page: int
    size: int


class UploadedImage(BaseModel):
    """이미지 업로드 응답 — key 는 이후 요청(배너 저장 등)에서 참조하고, url 은 바로 표시에 쓴다."""

    key: str
    url: str
    width: int
    height: int
