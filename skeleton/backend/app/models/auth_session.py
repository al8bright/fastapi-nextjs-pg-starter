"""인증 세션·로그인 시도 제한 모델 (architecture.md §8, §9).

- AuthSession: refresh 토큰 1개 = 세션 행 1개. 토큰 평문은 저장하지 않고 SHA-256 hex 만 저장한다.
  access JWT 의 sid 클레임이 이 테이블의 id 를 가리키므로, 행을 폐기(revoked_at)하면
  해당 세션의 access 토큰도 만료를 기다리지 않고 즉시 무효가 된다.
- LoginThrottle: 계정별(username) 로그인 실패 카운터. 두 모델 모두 인증 보안 상태라는
  한 관심사이므로 한 파일에 둔다(user.py 가 User+UserRole 을 함께 두는 방식과 동일).
"""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.security import now
from app.db.base import Base


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    # SHA-256 hex 는 항상 64자. unique — 해시 충돌 시 다른 세션의 토큰이 통용되는 것을 DB 가 막는다.
    refresh_token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    # 직전 회전에서 교체된 이전 토큰의 해시 — 동시 refresh 경쟁 유예 판정용(session_service 참고).
    # 로그인 직후(회전 전)에는 이전 토큰이 없으므로 NULL 이다.
    prev_token_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # 유예 창이 열린 시각 = 마지막 "정상 회전"(current 해시 일치) 시각. 유예 경쟁 회전은 이 값을
    # 갱신하지 않는다 — last_used_at(모든 회전에서 갱신)과 역할이 달라 별도 컬럼이다.
    rotated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    # NULL 이 아니면 폐기된 세션 — 언제 폐기됐는지가 감사 추적에 필요해 bool 대신 시각으로 둔다.
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # server_default: ORM 외 경로(psql 수동 INSERT, ETL)의 NOT NULL 위반 방지 (users 와 동일 정책).
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now, server_default=func.now())
    last_used_at: Mapped[datetime] = mapped_column(DateTime, default=now, server_default=func.now())


class LoginThrottle(Base):
    __tablename__ = "login_throttles"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    # FK 가 아니라 입력된 username 문자열이다 — 미존재 계정의 실패도 기록해야
    # 잠금 응답(429) 유무로 계정 존재 여부가 드러나지 않는다(user_service 참고).
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    failed_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    # NULL 이 아니고 미래 시각이면 잠금 중.
    locked_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_failed_at: Mapped[datetime] = mapped_column(DateTime, default=now, server_default=func.now())
