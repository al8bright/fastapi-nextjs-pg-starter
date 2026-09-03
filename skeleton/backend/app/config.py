"""애플리케이션 설정 (architecture.md §5).

설정은 OS 무관하게 .env 로 주입한다. 접근은 항상 get_settings() 로 한다.
"""
import logging
import os
import time
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

# 공개된 기본 서명키 — 이 값이 그대로 쓰이면 main.py 가 기동 경고를 남긴다.
BACKEND_ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = BACKEND_ROOT / ".env"

DEFAULT_SECRET_KEY = "change-me-in-production-use-32-bytes"

# §10 KST 단일 기준 — 런타임이 이 오프셋이 아니면 created_at·업무 일자가 비-KST 로 저장된다.
KST_UTC_OFFSET_HOURS = 9


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # 실행 환경 — "production" 이면 안전하지 않은 기본값으로 기동하지 않는다 (main.py 의 fail-fast).
    app_env: str = "development"

    # DB
    database_url: str | None = None

    # JWT / 세션 — access 는 짧게(탈취 창 축소), 갱신은 DB 세션 기반 refresh 토큰이 담당한다.
    secret_key: str = DEFAULT_SECRET_KEY
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 14

    # 로그인 시도 제한 — 계정별 연속 실패가 max 이상이면 lockout 분 동안 429 로 거부한다.
    login_max_failures: int = 5
    login_lockout_minutes: int = 15

    # 시각대 (architecture.md §10 KST 단일 기준)
    tz: str = "Asia/Seoul"

    # 초기 시드 — 기본은 꺼져 있다. 개발 환경에서만 .env 로 켠다(스캐폴드가 무작위 비밀번호와 함께 켜준다).
    # ⛔ 비밀번호에 기본값을 두지 않는다. 두면 설정을 빠뜨린 모든 배포가 같은 자격증명을 갖게 된다.
    seed_default_admin: bool = False
    default_admin_password: str | None = None

    # CORS
    cors_origins: str = "http://localhost:3000"

    # URL
    frontend_url: str = "http://localhost:3000"
    backend_public_url: str = "http://localhost:8000"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


def local_utc_offset_hours() -> int:
    """OS 로컬 시각대의 UTC 오프셋(시간 단위). DST 를 쓰는 시각대면 altzone 을 본다."""
    offset_seconds = -time.altzone if time.daylight else -time.timezone
    return offset_seconds // 3600


def _apply_timezone(tz: str) -> None:
    """프로세스 시각대를 실제로 반영한다 (§10 런타임 TZ=Asia/Seoul).

    .env 의 TZ 가 셸 환경변수보다 우선한다(§5 셸 환경변수 의존 금지) — setdefault 가 아니라 대입이다.
    time.tzset() 은 Unix 전용이고, Windows 는 TZ 환경변수로 프로세스 시각대를 바꿀 수 없다
    (MSVC CRT 는 IANA 이름을 해석하지 못한다). 강제할 수 없으므로 조용히 넘어가는 대신
    실제 OS 오프셋이 KST 인지 검증해 경고를 남긴다.
    """
    os.environ["TZ"] = tz
    if hasattr(time, "tzset"):
        time.tzset()
        return
    offset = local_utc_offset_hours()
    if offset != KST_UTC_OFFSET_HOURS:
        logger.warning(
            "OS 시각대 오프셋이 UTC%+d 입니다 (KST=UTC+%d). architecture.md §10 위반 — "
            "Windows 는 TZ 환경변수로 변경되지 않으므로 OS 시각대를 '서울'로 설정하세요.",
            offset,
            KST_UTC_OFFSET_HOURS,
        )


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    _apply_timezone(settings.tz)
    return settings
