"""공지사항 공개 라우터 (ARCHITECTURE.md §4) — 얇은 HTTP 계층, 인증 불요.

게시된 공지만 보인다. 실패(ServiceError)는 app/api/errors.py 의 전역 핸들러가 HTTP 로 변환한다.
"""

from fastapi import APIRouter, Depends, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.files import attachment_response
from app.dependencies import get_db
from app.schemas.common import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, MAX_QUERY_LENGTH, Page
from app.schemas.notice import NoticeDetail, NoticeListItem
from app.services import notice_service

router = APIRouter(prefix="/notices", tags=["notices"])


@router.get("", response_model=Page[NoticeListItem])
def list_notices(
    page: int = Query(1, ge=1),
    size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    q: str | None = Query(None, max_length=MAX_QUERY_LENGTH),
    db: Session = Depends(get_db),
) -> Page[NoticeListItem]:
    return notice_service.list_published(db, page=page, size=size, q=q)


@router.get("/{notice_id}", response_model=NoticeDetail)
def get_notice(notice_id: int, db: Session = Depends(get_db)) -> NoticeDetail:
    return notice_service.view_published(db, notice_id)


@router.get("/{notice_id}/attachments/{attachment_id}", response_class=FileResponse)
def download_attachment(notice_id: int, attachment_id: int, db: Session = Depends(get_db)) -> FileResponse:
    att, path = notice_service.attachment_file(db, notice_id, attachment_id, published_only=True)
    return attachment_response(path, filename=att.original_name, content_type=att.content_type)
