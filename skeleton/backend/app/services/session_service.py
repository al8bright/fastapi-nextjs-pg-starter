"""인증 세션(refresh 토큰) 서비스 (architecture.md §8, §9) — 비즈니스 로직.

refresh 토큰 1개 = auth_sessions 행 1개. 평문은 저장하지 않고 SHA-256 hex 만 저장하며,
비교는 hmac.compare_digest(상수시간)로 한다. 세션 행이 살아 있어야(sid) access 토큰도
유효하므로(dependencies.get_current_user), revoke 는 즉시 무효화 수단이다.
"""
import hmac
import logging
from datetime import timedelta

from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.security import hash_refresh_token, new_refresh_token, now, parse_session_id
from app.models.auth_session import AuthSession
from app.models.user import User
from app.services.exceptions import ServiceError

# 보안 이벤트(로그인/로그아웃/재사용 감지 등)는 일반 로그와 분리 수집할 수 있도록 전용 로거를 쓴다.
audit = logging.getLogger("app.audit")

# 실패 사유(형식 오류/미존재/만료/폐기/재사용)는 응답 메시지로 구분하지 않는다
# — 공격자가 토큰 상태를 탐침하지 못하게 하고, 원인 구분은 감사 로그로만 남긴다.
INVALID_REFRESH_MESSAGE = "유효하지 않은 토큰입니다."

# 정상 회전 직후 "이전 토큰"을 재사용할 수 있는 유예(초). access 만료 후 첫 페이지 열기에서
# 브라우저가 문서 요청 + prefetch 를 동시에 보내면 전부 같은 refresh 토큰으로 /auth/refresh 를
# 치는데, 유예가 없으면 경쟁에서 진 요청들이 "재사용 감지" 로 오판돼 정상 사용자가 세션째
# 로그아웃당한다. 60초는 동시 요청·재시도가 수습되기에 충분하면서 사람이 개입하는 공격
# 시나리오보다 짧은 값이다. 보안 트레이드오프: 유예 내 이전 토큰 재사용을 허용하지만, 그 토큰을
# 가진 공격자는 회전 전에도 같은 토큰을 쓸 수 있었으므로 실질적인 추가 노출은 없다.
ROTATION_GRACE_SECONDS = 60


def create_session(db: Session, *, user_id: int) -> tuple[AuthSession, str]:
    """로그인 시 세션 행을 만들고 (세션, refresh 평문)을 반환한다. 평문은 응답으로만 나간다."""
    settings = get_settings()
    session = AuthSession(
        user_id=user_id,
        # 토큰 형식이 "<session_id>.<secret>" 이라 id 가 나와야 진짜 해시를 계산할 수 있다.
        # NOT NULL 을 지키기 위해 임시 해시(버리는 무작위 값)로 INSERT(flush) 후
        # 실제 해시로 교체한다(동일 트랜잭션).
        refresh_token_hash=new_refresh_token(0)[1],
        expires_at=now() + timedelta(days=settings.refresh_token_expire_days),
    )
    db.add(session)
    db.flush()
    plain, hashed = new_refresh_token(session.id)
    session.refresh_token_hash = hashed
    db.commit()
    db.refresh(session)
    return session, plain


def _find_session(db: Session, refresh_token: str) -> AuthSession | None:
    """토큰의 sid 로 세션 행을 찾는다. 형식 오류/미존재면 None (해시 비교는 하지 않는다)."""
    session_id = parse_session_id(refresh_token)
    if session_id is None:
        return None
    return db.get(AuthSession, session_id)


def _hash_matches(stored_hash: str | None, refresh_token: str) -> bool:
    """저장 해시와 제출 토큰의 해시를 상수시간 비교한다. 저장 해시가 없으면(prev NULL) False."""
    if stored_hash is None:
        return False
    return hmac.compare_digest(stored_hash, hash_refresh_token(refresh_token))


def _within_rotation_grace(session: AuthSession) -> bool:
    """마지막 정상 회전 이후 유예(ROTATION_GRACE_SECONDS) 안인가."""
    if session.rotated_at is None:
        return False
    return (now() - session.rotated_at).total_seconds() <= ROTATION_GRACE_SECONDS


def is_expired(session: AuthSession) -> bool:
    return session.expires_at <= now()


def is_active_session(db: Session, session_id: int) -> bool:
    """sid 세션이 살아 있는가(존재·미폐기·미만료) — access 토큰의 요청별 즉시 무효화 검사."""
    session = db.get(AuthSession, session_id)
    return session is not None and session.revoked_at is None and not is_expired(session)


def rotate(db: Session, refresh_token: str) -> tuple[AuthSession, str]:
    """refresh 토큰을 검증하고 새 secret 으로 회전한다. 성공 시 (세션, 새 평문) 반환.

    - 형식 오류/미존재/폐기/만료 → ServiceError("invalid_refresh_token").
    - current 해시 일치 → 정상 회전: prev ← 기존 current, current ← 새 해시, 유예 창(rotated_at)
      이 여기서만 열린다.
    - prev 해시 일치 + 유예(ROTATION_GRACE_SECONDS) 안 → 동시 refresh 경쟁으로 판정하고
      current 만 새 secret 으로 교체해 새 쌍을 준다. prev·rotated_at 은 갱신하지 않는다
      — 유예 창이 슬라이딩하면 탈취된 이전 토큰이 60초마다 갱신을 반복하며 무한히 살아남는다.
    - prev 해시 일치 + 유예 초과 = 이미 회전된 이전 토큰의 재사용 → 탈취 신호로 보고 해당
      세션을 즉시 폐기한다(정당한 사용자·공격자 중 누가 이전 토큰을 냈든 세션을 끝내는 것이
      안전한 쪽). 응답은 다른 실패와 동일한 401 이다.
    - 둘 다 불일치 → sid 를 아는 공격자의 무작위 secret 시도로 보고 동일하게 폐기 + 401.
    - expires_at 은 연장하지 않는다 — 회전으로 세션이 무한히 살아남지 못하게 로그인 시점 기준
      절대 수명(REFRESH_TOKEN_EXPIRE_DAYS)을 유지한다.
    """
    session = _find_session(db, refresh_token)
    if session is None:
        raise ServiceError("invalid_refresh_token", INVALID_REFRESH_MESSAGE)
    if session.revoked_at is not None or is_expired(session):
        audit.info(
            "refresh 거부(폐기/만료): session_id=%s user_id=%s", session.id, session.user_id
        )
        raise ServiceError("invalid_refresh_token", INVALID_REFRESH_MESSAGE)
    current_ok = _hash_matches(session.refresh_token_hash, refresh_token)
    prev_ok = not current_ok and _hash_matches(session.prev_token_hash, refresh_token)
    grace_ok = prev_ok and _within_rotation_grace(session)
    if not current_ok and not grace_ok:
        session.revoked_at = now()
        db.commit()
        audit.warning(
            "refresh 재사용 감지(탈취 신호) — 세션 폐기: session_id=%s user_id=%s reason=%s",
            session.id,
            session.user_id,
            "유예 초과 이전 토큰" if prev_ok else "해시 불일치",
        )
        raise ServiceError("invalid_refresh_token", INVALID_REFRESH_MESSAGE)
    user = db.get(User, session.user_id)
    if user is None or not user.is_active:
        # 비활성화된 계정의 세션은 더 굴리지 않는다 — 같은 401 로 응답해 상태를 드러내지 않는다.
        session.revoked_at = now()
        db.commit()
        audit.info(
            "refresh 거부(비활성 계정) — 세션 폐기: session_id=%s user_id=%s",
            session.id,
            session.user_id,
        )
        raise ServiceError("invalid_refresh_token", INVALID_REFRESH_MESSAGE)
    plain, hashed = new_refresh_token(session.id)
    if current_ok:
        session.prev_token_hash = session.refresh_token_hash
        session.rotated_at = now()
    session.refresh_token_hash = hashed
    session.last_used_at = now()
    db.commit()
    db.refresh(session)
    if current_ok:
        audit.info("refresh 회전: session_id=%s user_id=%s", session.id, session.user_id)
    else:
        audit.info(
            "refresh 회전(동시 요청 유예): session_id=%s user_id=%s", session.id, session.user_id
        )
    return session, plain


def revoke(db: Session, refresh_token: str) -> None:
    """로그아웃 — 토큰이 유효하면 세션을 폐기한다. 어떤 입력에도 예외 없이 멱등이다.

    해시가 일치할 때만 폐기한다 — sid 는 토큰에 노출된 평문이므로, 해시 검증 없이 폐기하면
    sid 만 아는 제3자가 남의 세션을 끊을 수 있다(토큰 "소지" 가 폐기 권한이다).
    prev 해시 일치도 허용한다 — 동시 refresh 경쟁에서 진 탭이 낡은 토큰을 들고 로그아웃해도
    성공해야 하고, 폐기는 파괴적 회전과 달리 넓게 받아도 안전이 강해질 뿐이다(유예 무관).
    """
    session = _find_session(db, refresh_token)
    if session is None or session.revoked_at is not None:
        return
    if not _hash_matches(session.refresh_token_hash, refresh_token) and not _hash_matches(
        session.prev_token_hash, refresh_token
    ):
        return
    session.revoked_at = now()
    db.commit()
    audit.info("로그아웃(세션 폐기): session_id=%s user_id=%s", session.id, session.user_id)


def refresh_expires_in_seconds(session: AuthSession) -> int:
    """세션 refresh 토큰의 남은 유효 초 (응답의 refresh_expires_in). 만료됐으면 0."""
    return max(0, int((session.expires_at - now()).total_seconds()))
