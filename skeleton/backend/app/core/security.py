"""보안 및 시각(now) 유틸 (architecture.md §9, §10).

날짜·시간 규칙(§10):
- 업무 시각은 KST 기준이며, UTC<->KST 변환 레이어를 두지 않는다.
- 애플리케이션에서는 naive datetime.now() 만 사용한다.
- 실행 환경에 TZ=Asia/Seoul 을 설정한다.
"""
import hashlib
import secrets
import time
from datetime import datetime

import bcrypt
import jwt


def now() -> datetime:
    """KST 기준 naive 현재 시각."""
    return datetime.now()


# bcrypt 는 72 bytes 초과분을 예외 없이 조용히 절단한다(UTF-8 한글은 글자당 3 bytes → 24자 초과 시 절단).
# 상한은 "비밀번호를 저장하는 규칙" 이므로 해시 생성 지점에서 강제한다 — HTTP 입력 경로에만 걸면
# 쓰기(시드)는 통과하고 읽기(로그인)만 거부되어 계정이 영구 잠긴다.
BCRYPT_MAX_PASSWORD_BYTES = 72

# 새로 저장하는 비밀번호의 최소 길이(문자 수). 상한(72 bytes)과 달리 하한은 "새 비밀번호를 만드는
# 규칙" 이므로 로그인 검증에는 적용하지 않는다 — 기존 계정의 짧은 비밀번호로도 로그인은 돼야 한다.
PASSWORD_MIN_LENGTH = 8


def validate_new_password(plain: str) -> None:
    """새로 저장할 비밀번호의 통합 검증 (최소 길이 + bcrypt 상한). 위반 시 ValueError.

    생성 경로(create_user/ensure_admin)가 모두 이 함수를 거치게 해 정책의 SSOT 를 한 곳에 둔다.
    """
    if len(plain) < PASSWORD_MIN_LENGTH:
        raise ValueError(f"비밀번호는 최소 {PASSWORD_MIN_LENGTH}자 이상이어야 합니다.")
    if len(plain.encode("utf-8")) > BCRYPT_MAX_PASSWORD_BYTES:
        raise ValueError(f"비밀번호는 UTF-8 기준 {BCRYPT_MAX_PASSWORD_BYTES} bytes 이하여야 합니다.")


def hash_password(plain: str) -> str:
    """bcrypt 해시 생성 (자체 계정 비밀번호 저장용).

    72 bytes 초과 비밀번호는 절단 대신 ValueError 로 거부한다.
    """
    if len(plain.encode("utf-8")) > BCRYPT_MAX_PASSWORD_BYTES:
        raise ValueError(f"비밀번호는 UTF-8 기준 {BCRYPT_MAX_PASSWORD_BYTES} bytes 이하여야 합니다.")
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """평문과 bcrypt 해시 비교. 형식 오류 시 False."""
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def create_token(
    *,
    subject: str,
    session_id: int,
    secret: str,
    expires_minutes: int,
) -> str:
    """access JWT 발급. 클레임: sub(user id 문자열)·sid(세션 id)·iat·exp·typ.

    NOTE: 과거 예약해 둔 typ="refresh" 분기는 제거했다 — refresh 토큰은 JWT 가 아니라
    DB(auth_sessions)에 해시로 저장되는 불투명 토큰이다(new_refresh_token 참고).
    typ 클레임은 "access" 로 고정하되, decode_access_token 이 계속 검증한다
    (다른 typ 를 서명해 넣는 위조 경로 차단 — 방어는 발급이 아니라 검증 쪽 책임).
    sid 는 요청마다 세션 폐기 여부를 확인하는 열쇠다(dependencies.get_current_user)
    — 로그아웃·강제 폐기가 access 토큰 만료를 기다리지 않고 즉시 반영된다.
    """
    iat = int(time.time())
    payload = {
        "sub": subject,
        "sid": session_id,
        "iat": iat,
        "exp": iat + expires_minutes * 60,
        "typ": "access",
    }
    return jwt.encode(payload, secret, algorithm="HS256")


def decode_access_token(token: str, secret: str) -> dict | None:
    """JWT 디코드. 유효하지 않으면 None."""
    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    if payload.get("typ") != "access":
        return None
    return payload


# ---------------------------------------------------------------------------
# refresh 토큰 — JWT 가 아니라 불투명(opaque) 토큰이다.
# 형식: "<session_id>.<secrets.token_urlsafe(32)>". DB 에는 전체 토큰의 SHA-256 hex(64자)만
# 저장한다 — DB 가 유출돼도 평문 토큰을 복원할 수 없고, 검증은 해시 재계산 + 상수시간 비교
# (session_service, hmac.compare_digest)로 한다. session_id 를 앞에 붙이는 이유는 검증 시
# 해시 전체 테이블 스캔 없이 세션 행을 PK 로 바로 찾기 위해서다.
# ---------------------------------------------------------------------------
REFRESH_SECRET_BYTES = 32


def new_refresh_token(session_id: int) -> tuple[str, str]:
    """(평문 토큰, 저장용 SHA-256 hex) 쌍을 생성한다. 평문은 응답으로만 나가고 저장하지 않는다."""
    plain = f"{session_id}.{secrets.token_urlsafe(REFRESH_SECRET_BYTES)}"
    return plain, hash_refresh_token(plain)


def hash_refresh_token(token: str) -> str:
    """refresh 평문 토큰의 저장·비교용 SHA-256 hex."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def parse_session_id(token: str) -> int | None:
    """refresh 토큰 앞부분의 session_id 를 파싱한다. 형식 오류면 None (예외를 던지지 않는다)."""
    session_id_part, sep, secret_part = token.partition(".")
    if not sep or not secret_part or not session_id_part.isdigit():
        return None
    return int(session_id_part)
