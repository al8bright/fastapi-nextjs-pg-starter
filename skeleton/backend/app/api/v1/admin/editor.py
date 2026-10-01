"""관리자 — 리치 텍스트 에디터 이미지 업로드 라우터 (얇은 HTTP 계층).

multipart 필드 `file` → {"key","url","width","height"}. 서버가 재인코딩·EXIF 제거·긴 변 축소를 하고
public/editor 아래에 저장한다. 본문에는 응답 url 을 <img src> 로 넣는다(base64 금지).
"""

from fastapi import APIRouter, Depends, File, UploadFile, status

from app.api.files import read_upload
from app.config import Settings, get_settings
from app.schemas.common import UploadedImage
from app.services import upload_service

router = APIRouter(prefix="/editor")


@router.post("/images", response_model=UploadedImage, status_code=status.HTTP_201_CREATED)
def upload_editor_image(file: UploadFile = File(...), settings: Settings = Depends(get_settings)) -> UploadedImage:
    data = read_upload(file, max_mb=settings.max_image_upload_mb)
    return upload_service.save_image(data, category="editor")
