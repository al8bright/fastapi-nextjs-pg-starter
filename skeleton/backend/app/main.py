"""FastAPI 진입점 (ARCHITECTURE.md §4).

- /api/v1 버전 prefix
- CORS 미들웨어 (메서드/헤더 명시 허용)
- 보안 응답 헤더 미들웨어 (§9)
- 업로드 공개 파일 정적 서빙: UPLOAD_DIR/public → /uploads/public (private 은 절대 정적 서빙하지 않는다)
- DB 스키마는 Alembic 으로만 관리한다 (§11). 여기서 create_all 을 호출하지 않는다.
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import OperationalError, ProgrammingError

import app.models  # noqa: F401  모델 메타데이터 등록
from app.api.errors import register_error_handlers
from app.api.v1.router import api_router
from app.config import DEFAULT_SECRET_KEY, get_settings
from app.core import storage

logger = logging.getLogger(__name__)

# CORS 허용 목록 — API 가 쓰는 메서드 + preflight(OPTIONS), 프론트엔드가 보내는 요청 헤더.
CORS_ALLOW_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
CORS_ALLOW_HEADERS = ["Authorization", "Content-Type"]

# Cache-Control: no-store 를 강제할 인증 경로 (api_router prefix + auth 라우터 prefix).
AUTH_PATH_PREFIX = "/api/v1/auth"

# 공개 업로드 파일의 URL 경로. 파일 이름이 무작위(uuid)이고 내용이 바뀌지 않으므로 길게 캐시한다.
PUBLIC_UPLOADS_PATH = "/uploads/public"
PUBLIC_UPLOADS_CACHE_CONTROL = "public, max-age=31536000, immutable"


class PublicUploadFiles(StaticFiles):
    """UPLOAD_DIR/public 을 서빙하는 StaticFiles.

    디렉터리를 import 시점이 아니라 요청 시점의 get_settings() 에서 읽는다 — 설정(UPLOAD_DIR)을 바꿔도
    앱을 다시 만들 필요가 없다(§5 get_settings 원칙, 테스트의 임시 디렉터리 포함).
    마운트 루트가 public/ 이므로 private/ 첨부는 어떤 경로(../ 포함)로도 닿지 않는다 — StaticFiles 가
    루트 밖으로 해석되는 경로를 거부한다. 디렉터리 목록(html 모드)은 켜지 않는다.
    """

    def __init__(self) -> None:
        super().__init__(directory=None, check_dir=False)

    @property
    def all_directories(self) -> list:
        return [storage.public_root()]

    @all_directories.setter
    def all_directories(self, _value: list) -> None:
        # StaticFiles.__init__ 이 대입하는 값은 쓰지 않는다(위 property 가 매 요청 설정에서 읽는다).
        pass


@asynccontextmanager
async def lifespan(_: FastAPI):
    # 시작 훅: 기본 관리자 시드(SEED_DEFAULT_ADMIN 으로 제어). DB 스키마 생성은 Alembic(upgrade head)으로 수행한다.
    from app.db.session import SessionLocal
    from app.services import user_service

    # §5 ⛔ 모듈 전역 settings 싱글톤 금지 — 기동 시점에 get_settings() 로 읽는다.
    settings = get_settings()

    _is_production = settings.app_env == "production"

    # 업로드 디렉터리(public/·private/)가 없으면 만든다.
    storage.ensure_dirs()

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

    # refresh 쿠키가 Secure 없이 나가면 HTTP 구간에서 평문으로 노출된다 — 운영에서는 기동을 막는다.
    if _is_production and settings.refresh_token_transport == "cookie" and not settings.cookie_secure:
        raise RuntimeError(
            "APP_ENV=production 인데 REFRESH_TOKEN_TRANSPORT=cookie 이고 COOKIE_SECURE=false 입니다. "
            "HTTPS 로 서비스하고 .env 에 COOKIE_SECURE=true 를 설정하세요."
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
# allow_credentials=True 는 필수다 — cookie 모드에서 SPA(예: localhost:5173)가 교차 출처로
# /auth/refresh 를 호출할 때 refresh 쿠키를 싣고(withCredentials) 응답 쿠키를 받으려면 필요하다.
# 이 경우 allow_origins 에 "*" 를 쓸 수 없다(CORS_ORIGINS 에 출처를 명시).
# 메서드·헤더는 "*" 대신 명시 목록이다 — 프론트엔드가 실제로 보내는 것(Bearer 토큰, JSON 본문)만 연다.
# 새 커스텀 요청 헤더가 필요하면 여기에 추가한다. Retry-After 는 CORS 기본 노출 헤더가 아니므로
# 교차 출처 SPA 가 429 의 대기 시간을 읽을 수 있게 expose 한다.
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origin_list,
    allow_credentials=True,
    allow_methods=CORS_ALLOW_METHODS,
    allow_headers=CORS_ALLOW_HEADERS,
    expose_headers=["Retry-After"],
)


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    """모든 응답에 기본 보안 헤더를 붙인다 (ARCHITECTURE.md §9).

    CORS 보다 나중에 등록해 바깥에서 감싸므로 preflight·예외 응답(401/422/429)에도 적용된다.
    CSP 는 붙이지 않는다 — /docs·/redoc 이 CDN 스크립트와 인라인 스크립트를 쓰므로 엄격한 CSP 는
    Swagger UI 를 깨뜨린다. 이 API 는 HTML 을 내지 않으므로 CSP 는 프론트엔드(정적 호스팅/BFF) 몫이다.
    """
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    settings = get_settings()
    # HSTS 는 HTTPS 배포에서만 — COOKIE_SECURE=true(HTTPS 선언) 이거나 APP_ENV=production 이면 켠다.
    # body 모드(BFF) 운영은 COOKIE_SECURE 를 켜지 않을 수 있어 production 도 조건에 넣는다.
    # 브라우저는 평문 HTTP 로 받은 HSTS 를 무시하므로(RFC 6797 §8.1) TLS 종단이 앞단 프록시여도 무해하다.
    # 개발(http://localhost)에는 내보내지 않는다 — localhost 가 HTTPS 로 고정되는 사고를 막는다.
    if settings.cookie_secure or settings.app_env == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000"
    path = request.url.path
    if path == AUTH_PATH_PREFIX or path.startswith(AUTH_PATH_PREFIX + "/"):
        # 토큰이 오가는 응답은 어떤 캐시에도 남기지 않는다 (오류·쿠키 삭제 응답 포함).
        response.headers["Cache-Control"] = "no-store"
    elif path.startswith(PUBLIC_UPLOADS_PATH + "/") and response.status_code == 200:
        response.headers["Cache-Control"] = PUBLIC_UPLOADS_CACHE_CONTROL
    return response


register_error_handlers(app)
app.include_router(api_router, prefix="/api/v1")
app.mount(PUBLIC_UPLOADS_PATH, PublicUploadFiles(), name="public-uploads")
