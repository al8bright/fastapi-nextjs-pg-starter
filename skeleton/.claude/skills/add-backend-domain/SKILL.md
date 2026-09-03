---
name: add-backend-domain
description: __PROJECT_NAME__ 백엔드에 새 도메인/리소스(예: orders, events)를 추가할 때 사용. 모델 → 마이그레이션 → 스키마 → 서비스 → 얇은 라우터 → 테스트 순서를 이 템플릿의 아키텍처(architecture.md §4·§8)에 맞춰 TDD로 안내한다.
---

# 백엔드 도메인 추가

새 도메인 `<domain>`(테이블은 `snake_case` **복수형**)을 추가할 때 아래 순서를 따른다.
상세 근거: `docs/architecture.md` §4(구조)·§8(모델/스키마/서비스). DB 변경은 [db-migration] 스킬 참조.

## TDD 우선
먼저 `plan.md`에 작업 순서를 적고, **실패하는 API 레벨 테스트 하나**부터 작성한다(Red → Green → Refactor).
구조 변경(파일 이동/생성)과 동작 변경(로직)을 한 커밋에 섞지 않는다.

## 순서 (계층 분리 MUST)

1. **모델** `backend/app/models/<domain>.py` — SQLAlchemy 2.0 `Mapped`/`mapped_column`
   ```python
   from datetime import datetime
   from sqlalchemy import DateTime, Integer, String
   from sqlalchemy.orm import Mapped, mapped_column
   from app.core.security import now      # KST naive
   from app.db.base import Base

   class Order(Base):
       __tablename__ = "orders"           # snake_case 복수형
       id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
       status: Mapped[str] = mapped_column(String(20), default="draft")
       created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
       updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)
   ```
   - `backend/app/models/__init__.py`에서 **반드시 re-export**(메타데이터/Alembic 등록).
   - 시각 컬럼은 `default=now`(KST naive). ⛔ `datetime.now(timezone.utc)`/`ZoneInfo` 금지(§10).

2. **마이그레이션** — 모델을 추가/변경했으면 Alembic으로만 반영. → [db-migration] 스킬.
   ⛔ 런타임 `create_all`·수동 `ALTER` 금지(§11).

3. **스키마** `backend/app/schemas/<domain>.py` — Pydantic 2.x
   - `XxxBase` → `XxxCreate` / `XxxUpdate` / `XxxRead` 상속 패턴.
   - 제약은 `Field(ge=, max_length=)`, 복합 규칙은 `@field_validator`. ORM 모델과 분리.
   - 새로 저장하는 비밀번호는 `core/security` 의 `validate_new_password()`(최소 `PASSWORD_MIN_LENGTH` 8자 + `len(password.encode("utf-8")) <= 72` bytes)로 검증한다. 한글은 UTF-8에서 글자당 3 bytes이므로 단순 72자 제한과 다르다. 위반은 스키마/서비스 경계에서 422 도메인 오류로 변환하며, `hash_password()`의 방어적 `ValueError`를 500으로 노출하지 않는다(§9).

4. **서비스** `backend/app/services/<domain>_service.py` — 함수형
   - `def create_order(db, user, data): ...` 형태. DB 트랜잭션·규칙 검증·외부 연동을 여기서.
   - 실패는 `ServiceError(...)`(domain 예외)로 던지고 라우터에서 HTTP로 변환.
   - 조회는 N+1 방지 위해 `selectinload` 등 명시적 로딩.

5. **라우터** `backend/app/api/v1/<domain>.py` — **얇게**
   - HTTP 입출력·인증(`Depends(get_current_user)`)·상태코드만. ⛔ 비즈니스 로직 금지.
   - DB 세션·현재 사용자는 항상 `Depends()`로 주입(`app/dependencies.py`).
   - `backend/app/api/v1/router.py`에 `api_router.include_router(<domain>.router)` 등록.
   - 경로는 `/api/v1/<resource>`(리소스 복수형). 버전 prefix는 `main.py`에서만.

6. **테스트** `backend/tests/test_<domain>.py` — pytest + SQLite in-memory
   - 기본 API는 `conftest.py`의 `client`와 `db_session`을 사용한다. 인증은 사용자를 생성해 로그인하거나 현재 사용자 의존성을 명시적으로 override한다. lifespan 검증은 `lifespan_client`를 사용한다.
   - 작성한 실패 테스트가 통과(Green)할 때까지 최소 구현.

## 마무리
- 모든 테스트 통과 + 린트 경고 0일 때만 커밋. 커밋/PR은 [pr-workflow] 스킬 참조.
