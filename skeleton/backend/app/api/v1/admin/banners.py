"""관리자 — 배너 라우터 (얇은 HTTP 계층).

흐름: POST /banners/image(multipart) → {key,url,width,height} → POST·PUT /banners 에 image_key 로 참조.
"""

from fastapi import APIRouter, Depends, File, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.api.files import read_upload
from app.config import Settings, get_settings
from app.dependencies import get_db
from app.schemas.banner import BannerAdminRead, BannerOrder, BannerWrite
from app.schemas.common import UploadedImage
from app.services import banner_service, upload_service

router = APIRouter(prefix="/banners")


@router.get("", response_model=list[BannerAdminRead])
def list_banners(db: Session = Depends(get_db)) -> list[BannerAdminRead]:
    return banner_service.admin_list(db)


@router.post("", response_model=BannerAdminRead, status_code=status.HTTP_201_CREATED)
def create_banner(body: BannerWrite, db: Session = Depends(get_db)) -> BannerAdminRead:
    return banner_service.create(db, body)


@router.post("/image", response_model=UploadedImage, status_code=status.HTTP_201_CREATED)
def upload_banner_image(file: UploadFile = File(...), settings: Settings = Depends(get_settings)) -> UploadedImage:
    data = read_upload(file, max_mb=settings.max_image_upload_mb)
    return upload_service.save_image(data, category="banners")


@router.patch("/order", response_model=list[BannerAdminRead])
def reorder_banners(body: BannerOrder, db: Session = Depends(get_db)) -> list[BannerAdminRead]:
    return banner_service.reorder(db, body)


@router.get("/{banner_id}", response_model=BannerAdminRead)
def get_banner(banner_id: int, db: Session = Depends(get_db)) -> BannerAdminRead:
    return banner_service.admin_get(db, banner_id)


@router.put("/{banner_id}", response_model=BannerAdminRead)
def update_banner(banner_id: int, body: BannerWrite, db: Session = Depends(get_db)) -> BannerAdminRead:
    return banner_service.update_banner(db, banner_id, body)


@router.delete("/{banner_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_banner(banner_id: int, db: Session = Depends(get_db)) -> Response:
    banner_service.delete(db, banner_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
