"""사용자/인증 서비스 (architecture.md §8) — 비즈니스 로직.

라우터는 얇게 두고, 사용자 조회·인증·시드는 여기서 처리한다.
"""
import logging

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password
from app.models.user import User, UserRole
from app.services.exceptions import ServiceError

logger = logging.getLogger(__name__)

# 로그인 실패 메시지는 원인(자격증명 불일치/비활성 계정)과 무관하게 동일하게 유지한다
# — 응답으로 계정 존재·상태가 구분되지 않도록. 원인 구분은 서버 로그에만 남긴다.
INVALID_CREDENTIALS_MESSAGE = "아이디 또는 비밀번호가 올바르지 않습니다."

# 미존재 계정에서도 bcrypt 검증을 1회 수행해 응답 시간을 맞추기 위한 더미 해시.
# 실패 메시지를 통일해도 bcrypt 를 건너뛰면 타이밍(실측 186 ms vs 0.28 ms)으로 계정 존재
# 여부가 그대로 드러난다. cost 는 gensalt 기본값(12)과 같아야 하고, verify_password 가
# 형식 오류로 즉시 False 를 반환하지 않는 유효 형식이어야 한다(테스트로 고정).
DUMMY_PASSWORD_HASH = "$2b$12$" + "." * 53

# 기본 관리자 (처음 실행 시 자동 생성). 시드 여부·초기 비밀번호는 설정(SEED_DEFAULT_ADMIN,
# DEFAULT_ADMIN_PASSWORD)으로 제어하며, 운영에서는 즉시 비밀번호를 변경해야 한다.
DEFAULT_ADMIN_USERNAME = "admin"


def get_by_username(db: Session, username: str) -> User | None:
    return db.execute(select(User).where(User.username == username)).scalar_one_or_none()


def get_by_id(db: Session, user_id: int) -> User | None:
    return db.get(User, user_id)


def create_user(
    db: Session,
    *,
    username: str,
    password: str,
    role: UserRole = UserRole.USER,
) -> User:
    if get_by_username(db, username) is not None:
        raise ServiceError("user_exists", "이미 존재하는 사용자입니다.")
    user = User(
        username=username,
        hashed_password=hash_password(password),
        role=role.value,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError as e:
        # 사전 조회(check)와 INSERT 사이의 동시 요청 레이스 — unique 제약 위반을
        # unhandled 500 대신 기존 도메인 에러로 변환한다.
        db.rollback()
        raise ServiceError("user_exists", "이미 존재하는 사용자입니다.") from e
    db.refresh(user)
    return user


def authenticate(db: Session, username: str, password: str) -> User:
    """성공 시 User, 실패 시 ServiceError("invalid_credentials").

    실패 사유(자격증명 불일치/비활성 계정)는 응답 메시지로 구분하지 않고
    서버 로그로만 구분한다. 계정이 없어도 더미 해시로 항상 1회 검증해 응답 시간으로도
    존재 여부가 드러나지 않게 한다.
    """
    user = get_by_username(db, username)
    hashed = user.hashed_password if user is not None else DUMMY_PASSWORD_HASH
    password_ok = verify_password(password, hashed)
    if user is None or not password_ok:
        logger.info("로그인 실패(자격증명 불일치): username=%s", username)
        raise ServiceError("invalid_credentials", INVALID_CREDENTIALS_MESSAGE)
    if not user.is_active:
        logger.info("로그인 실패(비활성 계정): username=%s", username)
        raise ServiceError("invalid_credentials", INVALID_CREDENTIALS_MESSAGE)
    return user


def ensure_admin(db: Session, *, password: str) -> None:
    """관리자 계정이 하나도 없으면 기본 관리자(admin)를 생성한다 (idempotent)."""
    has_admin = db.execute(
        select(User.id).where(User.role == UserRole.ADMIN.value).limit(1)
    ).first()
    if has_admin is not None:
        return
    if get_by_username(db, DEFAULT_ADMIN_USERNAME) is not None:
        return
    create_user(
        db,
        username=DEFAULT_ADMIN_USERNAME,
        password=password,
        role=UserRole.ADMIN,
    )
