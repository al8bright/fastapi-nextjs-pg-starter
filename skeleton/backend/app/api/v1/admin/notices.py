"""관리자 — 공지사항·첨부 라우터 (얇은 HTTP 계층).

본문 정화(sanitize_html)·빈 본문 거부·게시일 규칙은 notice_service 가 한다.
"""

from fastapi import APIRouter, Depends, File, Query, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.files import attachment_response, read_upload
from app.config import Settings, get_settings
from app.dependencies import get_db, require_admin
from app.models.user import User
from app.schemas.common import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, MAX_QUERY_LENGTH, Page
from app.schemas.notice import AdminNoticeDetail, AdminNoticeListItem, AttachmentRead, NoticeWrite
from app.services import notice_service

router = APIRouter(prefix="/notices")


@router.get("", response_model=Page[AdminNoticeListItem])
def list_notices(
    page: int = Query(1, ge=1),
    size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    q: str | None = Query(None, max_length=MAX_QUERY_LENGTH),
    db: Session = Depends(get_db),
) -> Page[AdminNoticeListItem]:
    return notice_service.admin_list(db, page=page, size=size, q=q)


@router.post("", response_model=AdminNoticeDetail, status_code=status.HTTP_201_CREATED)
def create_notice(
    body: NoticeWrite, admin: User = Depends(require_admin), db: Session = Depends(get_db)
) -> AdminNoticeDetail:
    return notice_service.create(db, author_id=admin.id, data=body)


@router.get("/{notice_id}", response_model=AdminNoticeDetail)
def get_notice(notice_id: int, db: Session = Depends(get_db)) -> AdminNoticeDetail:
    return notice_service.admin_get(db, notice_id)


@router.put("/{notice_id}", response_model=AdminNoticeDetail)
def update_notice(notice_id: int, body: NoticeWrite, db: Session = Depends(get_db)) -> AdminNoticeDetail:
    return notice_service.update_notice(db, notice_id, body)


@router.delete("/{notice_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_notice(notice_id: int, db: Session = Depends(get_db)) -> Response:
    notice_service.delete(db, notice_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{notice_id}/attachments", response_model=AttachmentRead, status_code=status.HTTP_201_CREATED)
def upload_attachment(
    notice_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> AttachmentRead:
    data = read_upload(file, max_mb=settings.max_attachment_upload_mb)
    return notice_service.add_attachment(db, notice_id, data=data, filename=file.filename or "")


@router.get("/{notice_id}/attachments/{attachment_id}", response_class=FileResponse)
def download_attachment(notice_id: int, attachment_id: int, db: Session = Depends(get_db)) -> FileResponse:
    """초안 공지의 첨부도 받을 수 있는 관리자용 다운로드(Bearer 필요 — 브라우저에서는 blob 으로 받는다)."""
    att, path = notice_service.attachment_file(db, notice_id, attachment_id, published_only=False)
    return attachment_response(path, filename=att.original_name, content_type=att.content_type)


@router.delete("/{notice_id}/attachments/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_attachment(notice_id: int, attachment_id: int, db: Session = Depends(get_db)) -> Response:
    notice_service.delete_attachment(db, notice_id, attachment_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
