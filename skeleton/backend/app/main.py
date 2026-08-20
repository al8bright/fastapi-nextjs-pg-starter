"""FastAPI 진입점 (architecture.md §4).

- /api/v1 버전 prefix
- CORS 미들웨어
- DB 스키마는 Alembic 으로만 관리한다 (§11). 여기서 create_all 을 호출하지 않는다.
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import OperationalError, ProgrammingError

import app.models  # noqa: F401  모델 메타데이터 등록
from app.api.v1.router import api_router
from app.config import DEFAULT_SECRET_KEY, get_settings

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    # 시작 훅: 기본 관리자 시드(SEED_DEFAULT_ADMIN 으로 제어). DB 스키마 생성은 Alembic(upgrade head)으로 수행한다.
    from app.db.session import SessionLocal
    from app.services import user_service

    # §5 ⛔ 모듈 전역 settings 싱글톤 금지 — 기동 시점에 get_settings() 로 읽는다.
    settings = get_settings()

    _is_production = settings.app_env == "production"

    # ⛔ 안전하지 않은 기본값은 프로덕션에서 경고로 넘기지 않는다 — 기동을 막는다.
    #    공개된 서명키는 누구나 admin 토큰을 위조할 수 있다는 뜻이다.
    if settings.secret_key == DEFAULT_SECRET_KEY:
        if _is_production:
            raise RuntimeError(
                "APP_ENV=production 인데 SECRET_KEY 가 공개된 기본값입니다. "
                ".env 에 무작위 키를 설정하세요 (예: openssl rand -hex 24)."
            )
        logger.warning(
            "SECRET_KEY 가 공개된 기본값입니다. "
            "토큰 위조가 가능하므로 .env 에 무작위 키를 설정하세요."
        )
    elif len(settings.secret_key.encode("utf-8")) < 32:
        logger.warning(
            "SECRET_KEY 가 32 bytes 미만입니다. PyJWT 권장 길이 이상인 무작위 키를 설정하세요."
        )

    if settings.seed_default_admin:
        if _is_production:
            raise RuntimeError(
                "APP_ENV=production 에서는 기본 관리자 시드를 켤 수 없습니다. "
                "SEED_DEFAULT_ADMIN=false 로 두고 관리자 계정을 직접 만드세요."
            )
        if not settings.default_admin_password:
            logger.error(
                "SEED_DEFAULT_ADMIN=true 인데 DEFAULT_ADMIN_PASSWORD 가 비어 있습니다 — "
                "기본 관리자 시드를 건너뜁니다. .env 에 초기 비밀번호를 설정하세요."
            )
        else:
            try:
                with SessionLocal() as db:
                    user_service.ensure_admin(db, password=settings.default_admin_password)
            except ValueError:
                logger.error(
                    "기본 관리자 시드에 실패했습니다. DEFAULT_ADMIN_PASSWORD 가 UTF-8 기준 "
                    "72 bytes 이하인지 확인하세요.",
                    exc_info=True,
                )
            except (OperationalError, ProgrammingError):
                logger.warning(
                    "기본 관리자 시드를 건너뜁니다 (테이블 없음/DB 미연결 — alembic upgrade head 필요).",
                    exc_info=True,
                )
            except Exception:  # noqa: BLE001  시드 실패가 서버 기동을 막지 않게 한다.
                logger.error("기본 관리자 시드 중 예상하지 못한 오류가 발생했습니다.", exc_info=True)
    yield


app = FastAPI(title="__PROJECT_NAME__ API", version="0.1.0", lifespan=lifespan)

# 미들웨어 등록은 구조상 import 시점 평가가 불가피하다. 다만 전역 이름을 만들지 않아
# lifespan·라우터가 stale 한 설정을 재사용하지는 않는다 (§5).
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")
