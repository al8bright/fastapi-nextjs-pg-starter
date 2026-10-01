"""배너 공개 라우터 (ARCHITECTURE.md §4) — 얇은 HTTP 계층, 인증 불요."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.schemas.banner import BannerPublic
from app.services import banner_service

router = APIRouter(prefix="/banners", tags=["banners"])


@router.get("", response_model=list[BannerPublic])
def list_banners(db: Session = Depends(get_db)) -> list[BannerPublic]:
    """지금 노출 중인 배너(활성 + 노출 기간 안, KST) — sort_order, id 순."""
    return banner_service.list_live(db)
