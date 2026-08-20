"""헬스 체크 서비스 (architecture.md §8).

DB 연결 및 테이블 접근이 정상인지 확인한다.
"""
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.app_meta import AppMeta


def db_health(db: Session) -> dict:
    """app_meta 테이블을 조회해 DB/테이블 접근을 검증한다."""
    count = db.scalar(select(func.count()).select_from(AppMeta))
    return {"db": "ok", "table": AppMeta.__tablename__, "rows": int(count or 0)}
