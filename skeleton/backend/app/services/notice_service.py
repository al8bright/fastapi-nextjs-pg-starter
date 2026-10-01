"""공지사항 서비스 (ARCHITECTURE.md §8) — 비즈니스 로직.

- 본문은 저장(생성·수정) 직전에 항상 sanitize_html 로 정화한다. 클라이언트가 보낸 HTML 은 믿지 않는다.
- 정화 후 글자·이미지·영상이 하나도 없으면 빈 본문으로 거부한다(ServiceError "empty_body").
- 공개 API 는 게시(is_published)된 공지만 다룬다. 초안은 존재 자체를 드러내지 않도록 404 와 같다.
"""

from pathlib import Path

from sqlalchemy import exists, func, select, update
from sqlalchemy.orm import Session, selectinload

from app.config import get_settings
from app.core import storage
from app.core.sanitize import is_html_empty, sanitize_html
from app.core.security import now
from app.models.notice import Notice, NoticeAttachment
from app.models.user import User
from app.schemas.common import Page
from app.schemas.notice import (
    AdminNoticeDetail,
    AdminNoticeListItem,
    AttachmentRead,
    NoticeDetail,
    NoticeListItem,
    NoticeWrite,
)
from app.services.exceptions import ServiceError

MAX_ATTACHMENTS_PER_NOTICE = 10

NOT_FOUND_MESSAGE = "공지사항을 찾을 수 없습니다."
ATTACHMENT_NOT_FOUND_MESSAGE = "첨부 파일을 찾을 수 없습니다."


def _not_found() -> ServiceError:
    return ServiceError("not_found", NOT_FOUND_MESSAGE)


def _escape_like(q: str) -> str:
    """LIKE 와일드카드(%, _)를 글자 그대로 검색하게 이스케이프한다."""
    return q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _title_matches(q: str | None):
    q = (q or "").strip()
    if not q:
        return None
    return Notice.title.ilike(f"%{_escape_like(q)}%", escape="\\")


def _has_attachments():
    return exists().where(NoticeAttachment.notice_id == Notice.id).correlate(Notice)


def download_url(notice_id: int, attachment_id: int) -> str:
    """첨부 다운로드 URL — 공개 파일과 같은 접두사(PUBLIC_FILES_BASE_URL)를 붙인다."""
    base = get_settings().public_files_base_url.rstrip("/")
    return f"{base}/api/v1/notices/{notice_id}/attachments/{attachment_id}"


def _attachment_read(att: NoticeAttachment) -> AttachmentRead:
    return AttachmentRead(
        id=att.id,
        original_name=att.original_name,
        size_bytes=att.size_bytes,
        content_type=att.content_type,
        download_url=download_url(att.notice_id, att.id),
    )


def _count(db: Session, *conditions) -> int:
    stmt = select(func.count()).select_from(Notice)
    for cond in conditions:
        stmt = stmt.where(cond)
    return int(db.scalar(stmt) or 0)


# ---------------------------------------------------------------------------
# 공개
# ---------------------------------------------------------------------------


def list_published(db: Session, *, page: int, size: int, q: str | None) -> Page[NoticeListItem]:
    """게시된 공지 — 고정 공지 먼저, 그다음 게시일 최신순."""
    conditions = [Notice.is_published.is_(True)]
    title_cond = _title_matches(q)
    if title_cond is not None:
        conditions.append(title_cond)
    stmt = (
        select(Notice, _has_attachments().label("has_attachments"))
        .where(*conditions)
        .order_by(Notice.is_pinned.desc(), Notice.published_at.desc(), Notice.id.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    items = [
        NoticeListItem(
            id=n.id,
            title=n.title,
            is_pinned=n.is_pinned,
            published_at=n.published_at,
            view_count=n.view_count,
            has_attachments=bool(has_att),
        )
        for n, has_att in db.execute(stmt).all()
    ]
    return Page(items=items, total=_count(db, *conditions), page=page, size=size)


def _get_published(db: Session, notice_id: int) -> Notice:
    notice = db.get(Notice, notice_id, options=[selectinload(Notice.attachments)])
    if notice is None or not notice.is_published:
        raise _not_found()
    return notice


def view_published(db: Session, notice_id: int) -> NoticeDetail:
    """게시된 공지 상세 — 조회수를 원자적으로 1 올린다(updated_at 은 바꾸지 않는다)."""
    notice = _get_published(db, notice_id)
    db.execute(
        update(Notice)
        .where(Notice.id == notice_id)
        .values(view_count=Notice.view_count + 1, updated_at=Notice.updated_at)
    )
    db.commit()
    db.refresh(notice)
    return NoticeDetail(
        id=notice.id,
        title=notice.title,
        body_html=notice.body_html,
        is_pinned=notice.is_pinned,
        published_at=notice.published_at,
        view_count=notice.view_count,
        created_at=notice.created_at,
        updated_at=notice.updated_at,
        attachments=[_attachment_read(a) for a in notice.attachments],
    )


def _find_attachment(db: Session, notice_id: int, attachment_id: int) -> NoticeAttachment:
    att = db.get(NoticeAttachment, attachment_id)
    if att is None or att.notice_id != notice_id:
        raise ServiceError("not_found", ATTACHMENT_NOT_FOUND_MESSAGE)
    return att


def attachment_file(
    db: Session, notice_id: int, attachment_id: int, *, published_only: bool
) -> tuple[NoticeAttachment, Path]:
    """다운로드할 첨부와 실제 경로. 공개 경로(published_only)는 게시된 공지의 첨부만 내준다."""
    notice = db.get(Notice, notice_id)
    if notice is None or (published_only and not notice.is_published):
        raise _not_found()
    att = _find_attachment(db, notice_id, attachment_id)
    try:
        path = storage.resolve_key(att.storage_key)
    except storage.StorageError as e:
        raise ServiceError("not_found", ATTACHMENT_NOT_FOUND_MESSAGE) from e
    if not path.is_file():
        raise ServiceError("not_found", ATTACHMENT_NOT_FOUND_MESSAGE)
    return att, path


# ---------------------------------------------------------------------------
# 관리자
# ---------------------------------------------------------------------------


def _admin_item(n: Notice, has_att: bool, username: str | None) -> AdminNoticeListItem:
    return AdminNoticeListItem(
        id=n.id,
        title=n.title,
        is_pinned=n.is_pinned,
        is_published=n.is_published,
        published_at=n.published_at,
        view_count=n.view_count,
        has_attachments=has_att,
        author_id=n.author_id,
        author_username=username,
        created_at=n.created_at,
        updated_at=n.updated_at,
    )


def admin_list(db: Session, *, page: int, size: int, q: str | None) -> Page[AdminNoticeListItem]:
    """초안 포함 전체 — 최근 작성 순."""
    conditions = []
    title_cond = _title_matches(q)
    if title_cond is not None:
        conditions.append(title_cond)
    stmt = (
        select(Notice, _has_attachments().label("has_attachments"), User.username)
        .outerjoin(User, User.id == Notice.author_id)
        .where(*conditions)
        .order_by(Notice.id.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    items = [_admin_item(n, bool(has_att), username) for n, has_att, username in db.execute(stmt).all()]
    return Page(items=items, total=_count(db, *conditions), page=page, size=size)


def _get(db: Session, notice_id: int) -> Notice:
    notice = db.get(Notice, notice_id, options=[selectinload(Notice.attachments)])
    if notice is None:
        raise _not_found()
    return notice


def admin_get(db: Session, notice_id: int) -> AdminNoticeDetail:
    notice = _get(db, notice_id)
    author = db.get(User, notice.author_id) if notice.author_id is not None else None
    item = _admin_item(notice, bool(notice.attachments), author.username if author else None)
    return AdminNoticeDetail(
        **item.model_dump(),
        body_html=notice.body_html,
        attachments=[_attachment_read(a) for a in notice.attachments],
    )


def _clean_body(body_html: str) -> str:
    cleaned = sanitize_html(body_html)
    if is_html_empty(cleaned):
        raise ServiceError("empty_body", "본문을 입력하세요.")
    return cleaned


def _apply(notice: Notice, data: NoticeWrite) -> None:
    notice.title = data.title
    notice.body_html = _clean_body(data.body_html)
    notice.is_pinned = data.is_pinned
    notice.is_published = data.is_published
    if data.is_published and notice.published_at is None:
        notice.published_at = now()


def create(db: Session, *, author_id: int, data: NoticeWrite) -> AdminNoticeDetail:
    notice = Notice(author_id=author_id, view_count=0)
    _apply(notice, data)
    db.add(notice)
    db.commit()
    return admin_get(db, notice.id)


def update_notice(db: Session, notice_id: int, data: NoticeWrite) -> AdminNoticeDetail:
    notice = _get(db, notice_id)
    _apply(notice, data)
    db.commit()
    return admin_get(db, notice.id)


def delete(db: Session, notice_id: int) -> None:
    """공지와 첨부 행을 지우고, 커밋이 끝난 뒤 첨부 파일을 지운다(DB 실패 시 파일이 먼저 사라지지 않게)."""
    notice = _get(db, notice_id)
    keys = [a.storage_key for a in notice.attachments]
    db.delete(notice)
    db.commit()
    for key in keys:
        storage.delete(key)


def add_attachment(db: Session, notice_id: int, *, data: bytes, filename: str) -> AttachmentRead:
    notice = _get(db, notice_id)
    if len(notice.attachments) >= MAX_ATTACHMENTS_PER_NOTICE:
        raise ServiceError(
            "too_many_attachments", f"첨부는 공지당 최대 {MAX_ATTACHMENTS_PER_NOTICE}개까지 올릴 수 있습니다."
        )
    original_name = storage.clean_original_name(filename)
    if not original_name:
        raise ServiceError("invalid_filename", "파일 이름이 올바르지 않습니다.")
    stored = storage.save_attachment(data, original_name)
    att = NoticeAttachment(
        notice_id=notice.id,
        storage_key=stored.key,
        original_name=original_name,
        content_type=stored.content_type,
        size_bytes=stored.size_bytes,
    )
    db.add(att)
    try:
        db.commit()
    except Exception:
        db.rollback()
        storage.delete(stored.key)  # 행이 없으면 고아 파일이 되므로 되돌린다
        raise
    db.refresh(att)
    return _attachment_read(att)


def delete_attachment(db: Session, notice_id: int, attachment_id: int) -> None:
    _get(db, notice_id)
    att = _find_attachment(db, notice_id, attachment_id)
    key = att.storage_key
    db.delete(att)
    db.commit()
    storage.delete(key)
