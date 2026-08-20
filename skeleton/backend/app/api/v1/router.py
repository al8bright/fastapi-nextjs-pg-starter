"""API v1 라우터 집계 (architecture.md §4)."""
from fastapi import APIRouter

from app.api.v1 import auth, health

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
# 도메인 라우터를 여기에 추가한다. 예) api_router.include_router(orders.router)
