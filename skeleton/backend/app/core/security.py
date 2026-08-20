"""보안 및 시각(now) 유틸 (architecture.md §9, §10).

날짜·시간 규칙(§10):
- 업무 시각은 KST 기준이며, UTC<->KST 변환 레이어를 두지 않는다.
- 애플리케이션에서는 naive datetime.now() 만 사용한다.
- 실행 환경에 TZ=Asia/Seoul 을 설정한다.
"""
import time
from datetime import datetime
from typing import Literal

import bcrypt
import jwt


def now() -> datetime:
    """KST 기준 naive 현재 시각."""
    return datetime.now()


# bcrypt 는 72 bytes 초과분을 예외 없이 조용히 절단한다(UTF-8 한글은 글자당 3 bytes → 24자 초과 시 절단).
# 상한은 "비밀번호를 저장하는 규칙" 이므로 해시 생성 지점에서 강제한다 — HTTP 입력 경로에만 걸면
# 쓰기(시드)는 통과하고 읽기(로그인)만 거부되어 계정이 영구 잠긴다.
BCRYPT_MAX_PASSWORD_BYTES = 72


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
    secret: str,
    expires_minutes: int,
    # NOTE: "refresh" 분기는 현재 발급 경로가 없는 데드 코드다(어떤 라우터도 refresh 토큰을
    # 발급하지 않고, decode_access_token 은 typ != "access" 를 거부한다).
    # 리프레시 토큰 도입 시 사용할 예약 분기로 남겨둔다.
    token_type: Literal["access", "refresh"] = "access",
) -> str:
    exp = int(time.time()) + expires_minutes * 60
    payload = {"sub": subject, "exp": exp, "typ": token_type}
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
