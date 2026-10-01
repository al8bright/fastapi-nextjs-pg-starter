"""관리자 대시보드 라우터 — 얇은 HTTP 계층."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.schemas.admin import DashboardRead
from app.services import admin_service

router = APIRouter()


@router.get("/dashboard", response_model=DashboardRead)
def dashboard(db: Session = Depends(get_db)) -> DashboardRead:
    return admin_service.dashboard(db)
