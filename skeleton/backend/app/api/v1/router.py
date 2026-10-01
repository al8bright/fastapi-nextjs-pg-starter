"""API v1 라우터 집계 (ARCHITECTURE.md §4)."""
from fastapi import APIRouter

from app.api.v1 import admin, auth, banners, health, notices

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(notices.router)
api_router.include_router(banners.router)
api_router.include_router(admin.router)
# 도메인 라우터를 여기에 추가한다. 예) api_router.include_router(orders.router)
