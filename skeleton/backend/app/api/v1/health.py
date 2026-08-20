"""헬스 체크 라우터 (architecture.md §4) — 얇은 HTTP 계층."""
import logging

from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.schemas.health import DbHealth
from app.services import health_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get(
    "/health/db",
    response_model=DbHealth,
    responses={503: {"description": "데이터베이스에 접근할 수 없습니다."}},
)
def health_db(db: Session = Depends(get_db)) -> DbHealth | JSONResponse:
    # DB 연결 불가/테이블 없음은 unhandled 500 이 아니라 구조화된 503 으로 응답한다.
    try:
        return DbHealth(**health_service.db_health(db))
    except SQLAlchemyError:
        logger.exception("DB 헬스 체크 실패")
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"db": "error", "detail": "데이터베이스에 접근할 수 없습니다."},
        )
