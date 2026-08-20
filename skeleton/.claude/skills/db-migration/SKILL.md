---
name: db-migration
description: __PROJECT_NAME__ 의 DB 스키마를 바꿀 때(SQLAlchemy 모델 생성/변경, 테이블 추가/수정) 사용. Alembic revision/upgrade 워크플로와 금지사항(런타임 create_all·수동 ALTER 금지)을 architecture.md §11 기준으로 안내한다.
---

# DB 마이그레이션 (Alembic)

> **모든 DB 스키마는 예외 없이 Alembic 마이그레이션으로만 생성·변경한다.** (architecture.md §11)
> 스키마의 단일 진실 공급원(SSOT)은 마이그레이션 히스토리다. dev/스테이징/운영 동일.

## 워크플로 (PowerShell, backend 디렉토리에서)

```powershell
cd backend
.\.venv\Scripts\python -m alembic revision --autogenerate -m "<변경 요약>"   # 초안 생성
# → versions/*.py 를 반드시 검토·수정 (autogenerate는 초안일 뿐!)
.\.venv\Scripts\python -m alembic upgrade head                               # 적용
```

## 체크리스트
- 모델을 추가했으면 `app/models/__init__.py`에서 **re-export 됐는지 먼저 확인**(안 그러면 autogenerate가 못 잡음).
- 생성된 `versions/*.py`의 `upgrade()`/`downgrade()`를 **직접 읽고 검토**한다. 타입 변경·인덱스·기본값 누락 확인.
- 모든 마이그레이션은 **`downgrade()`를 작성**하고 가능하면 되돌릴 수 있게 한다.
- 마이그레이션 파일은 **반드시 커밋**한다.
- 머지 시 head가 갈라지면 `alembic merge`로 정리.
- `alembic/env.py`는 `get_settings()`의 DB URL + `Base.metadata`(`import app.models` 후) 사용. `compare_type=True`.

## ⛔ 금지 (MUST NOT)
- 런타임 `Base.metadata.create_all()`로 dev/운영 스키마 생성 — **테스트(SQLite in-memory)에서만 예외**(§12).
- `DATABASE_AUTO_DDL` 같은 자동 DDL 플래그를 dev/prod에서 켜기.
- DB 콘솔에서 마이그레이션을 거치지 않은 수동 `ALTER TABLE`.

## 시각(KST) 주의
- PostgreSQL 연결은 `connect_args`에 `options="-c timezone=Asia/Seoul"` (엔진 팩토리에 이미 적용, §7·§10).
- 시각 컬럼 기본값은 `default=now`(naive KST). ⛔ UTC/`ZoneInfo` 신규 도입 금지.

## 커밋
- DB 변경이 포함된 PR은 마이그레이션 파일을 함께 담는다(§20 체크리스트). 커밋/PR은 [pr-workflow] 스킬 참조.
