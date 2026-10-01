"""배너 서비스 (ARCHITECTURE.md §8) — 비즈니스 로직.

이미지는 먼저 업로드(upload_service.save_image, public/banners)하고, 생성·수정 요청은 그 key 를 참조한다.
key 는 public/banners/ 아래에 실제로 있는 파일이어야 하며, 폭·높이는 클라이언트 값이 아니라 파일에서 읽는다.
"""

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core import storage
from app.core.security import now
from app.models.banner import Banner
from app.schemas.banner import BannerAdminRead, BannerOrder, BannerPublic, BannerWrite
from app.services.exceptions import ServiceError

BANNER_IMAGE_PREFIX = "public/banners/"
NOT_FOUND_MESSAGE = "배너를 찾을 수 없습니다."


def live_condition():
    """지금(KST naive) 노출 중인 배너 조건 — 공개 목록과 대시보드 집계가 같은 기준을 쓴다."""
    current = now()
    return (
        Banner.is_active.is_(True)
        & or_(Banner.starts_at.is_(None), Banner.starts_at <= current)
        & or_(Banner.ends_at.is_(None), Banner.ends_at > current)
    )


def _ordered():
    return (Banner.sort_order.asc(), Banner.id.asc())


def list_live(db: Session) -> list[BannerPublic]:
    banners = db.execute(select(Banner).where(live_condition()).order_by(*_ordered())).scalars().all()
    return [
        BannerPublic(
            id=b.id,
            title=b.title,
            image_url=storage.public_url(b.image_key),
            width=b.image_width,
            height=b.image_height,
            link_url=b.link_url,
            alt_text=b.alt_text,
        )
        for b in banners
    ]


def _admin_read(b: Banner) -> BannerAdminRead:
    return BannerAdminRead(
        id=b.id,
        title=b.title,
        image_key=b.image_key,
        image_url=storage.public_url(b.image_key),
        image_width=b.image_width,
        image_height=b.image_height,
        link_url=b.link_url,
        alt_text=b.alt_text,
        starts_at=b.starts_at,
        ends_at=b.ends_at,
        sort_order=b.sort_order,
        is_active=b.is_active,
        created_at=b.created_at,
        updated_at=b.updated_at,
    )


def admin_list(db: Session) -> list[BannerAdminRead]:
    return [_admin_read(b) for b in db.execute(select(Banner).order_by(*_ordered())).scalars().all()]


def _get(db: Session, banner_id: int) -> Banner:
    banner = db.get(Banner, banner_id)
    if banner is None:
        raise ServiceError("not_found", NOT_FOUND_MESSAGE)
    return banner


def admin_get(db: Session, banner_id: int) -> BannerAdminRead:
    return _admin_read(_get(db, banner_id))


def _image_dimensions(image_key: str) -> tuple[int, int]:
    invalid = ServiceError("invalid_image_key", "배너 이미지를 먼저 업로드하세요(업로드 응답의 key).")
    if not image_key.startswith(BANNER_IMAGE_PREFIX):
        raise invalid
    try:
        return storage.image_size(image_key)
    except storage.StorageError as e:
        raise invalid from e


def _delete_image_if_unreferenced(db: Session, key: str) -> None:
    """다른 배너가 같은 key 를 참조하지 않을 때만 파일을 지운다(커밋 이후 호출)."""
    still_used = db.scalar(select(func.count()).select_from(Banner).where(Banner.image_key == key))
    if not still_used:
        storage.delete(key)


def _apply(banner: Banner, data: BannerWrite) -> None:
    if banner.image_key != data.image_key:
        banner.image_width, banner.image_height = _image_dimensions(data.image_key)
        banner.image_key = data.image_key
    banner.title = data.title
    banner.link_url = data.link_url
    banner.alt_text = data.alt_text
    banner.starts_at = data.starts_at
    banner.ends_at = data.ends_at
    banner.is_active = data.is_active
    if data.sort_order is not None:
        banner.sort_order = data.sort_order


def create(db: Session, data: BannerWrite) -> BannerAdminRead:
    banner = Banner(image_key="")
    _apply(banner, data)
    if data.sort_order is None:
        current_max = db.scalar(select(func.max(Banner.sort_order)))
        banner.sort_order = 0 if current_max is None else current_max + 1
    db.add(banner)
    db.commit()
    db.refresh(banner)
    return _admin_read(banner)


def update_banner(db: Session, banner_id: int, data: BannerWrite) -> BannerAdminRead:
    banner = _get(db, banner_id)
    old_key = banner.image_key
    _apply(banner, data)
    db.commit()
    db.refresh(banner)
    if old_key != banner.image_key:
        _delete_image_if_unreferenced(db, old_key)  # 교체된 이전 이미지
    return _admin_read(banner)


def delete(db: Session, banner_id: int) -> None:
    banner = _get(db, banner_id)
    key = banner.image_key
    db.delete(banner)
    db.commit()
    _delete_image_if_unreferenced(db, key)


def reorder(db: Session, data: BannerOrder) -> list[BannerAdminRead]:
    """나열한 id 를 0,1,2… 순으로 두고, 빠진 배너는 기존 순서를 유지한 채 뒤에 붙인다."""
    banners = db.execute(select(Banner).order_by(*_ordered())).scalars().all()
    by_id = {b.id: b for b in banners}
    unknown = [i for i in data.ids if i not in by_id]
    if unknown:
        raise ServiceError("invalid_reorder", f"존재하지 않는 배너 id 입니다: {unknown}")
    listed = set(data.ids)
    ordered = [by_id[i] for i in data.ids] + [b for b in banners if b.id not in listed]
    for index, banner in enumerate(ordered):
        banner.sort_order = index
    db.commit()
    return [_admin_read(b) for b in ordered]
