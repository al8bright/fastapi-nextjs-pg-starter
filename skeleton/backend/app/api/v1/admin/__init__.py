"""관리자 API 집계 (/api/v1/admin/*) — 모든 하위 라우트가 require_admin 을 거친다 (ARCHITECTURE.md §4, §9).

라우터 단위 dependencies 로 걸어 두므로 새 하위 라우트를 추가해도 관리자 검사가 빠지지 않는다.
"""

from fastapi import APIRouter, Depends

from app.api.v1.admin import banners, dashboard, editor, notices, users
from app.dependencies import require_admin

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])
router.include_router(dashboard.router)
router.include_router(users.router)
router.include_router(notices.router)
router.include_router(banners.router)
router.include_router(editor.router)
