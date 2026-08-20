# __PROJECT_NAME__ 개발 지침

> 이 파일은 `fastapi-nextjs-pg-starter`로 생성된 프로젝트의 저장소 로컬 지침이다.
> 전체 아키텍처 기준(SSOT)은 `docs/architecture.md`이며, 작업에 필요한 절만 읽는다.
> 실행 환경에 전역 지침이 있으면 함께 적용하되, 이 저장소의 규칙은 이 파일과 저장소 안의 문서만으로 이해하고 실행할 수 있어야 한다.

## 프로젝트 개요 (작성)

- **목적**: <한 줄 설명>
- **인증**: <자체 계정 — 브라우저↔Next httpOnly 쿠키, Next↔FastAPI Bearer JWT 기본 | 다른 인증 방식>
- **주요 도메인**: <예: 주문/계약, 이벤트/설문 등>

## 반드시 지킨다 (시작 전 확인 — 상세는 architecture.md ★MUST 요약)

- **스택 고정**: FastAPI + SQLAlchemy 2.0 + Alembic / Next.js App Router + React Server Components + TypeScript / **PostgreSQL**. 정확한 버전과 버전별 주의사항은 `scripts/versions.env`, `backend/requirements.txt`, `frontend/package.json`과 `stack-versions` 스킬을 확인한다.
- **DB는 항상 Alembic으로만 관리**: 런타임 `create_all`, 자동 DDL, 수동 `ALTER`는 금지한다. 테스트의 in-memory DB만 예외다.
- **환경 파일 분리**: 백엔드는 `backend/.env`, 프론트엔드는 `frontend/.env`를 사용한다. 각 `.env.example`을 복사하고 실제 `.env`는 커밋하지 않는다.
- **시각은 KST 단일 기준**: naive `datetime.now()`와 PostgreSQL `timezone=Asia/Seoul` 정책을 유지한다. Unix 계열은 `TZ=Asia/Seoul`과 `tzset()`을 적용한다. Windows는 IANA `TZ`로 프로세스 시각대가 바뀌지 않으므로 OS 시각대를 서울(UTC+9)로 설정해야 하며, 불일치하면 애플리케이션이 경고한다.
- **API는 `/api/v1`**: 설정은 `get_settings()`와 `@lru_cache`, 공통 의존성은 `app/dependencies.py`에 둔다.
- **계층 분리**: 라우터는 HTTP 처리만 담당하고, 도메인 로직은 `services/`, 검증은 `schemas/`에 둔다.
- **프론트엔드**: 서버 컴포넌트 fetch + Server Actions를 사용하고 패키지 매니저는 **pnpm**으로 통일한다.
- **인증**: 자체 계정 로그인이 기본이다. 브라우저↔Next는 httpOnly 쿠키, Next↔FastAPI는 Bearer JWT를 사용한다.
- **변경 흐름**: `main`에서 작업하고 바로 커밋·push 한다. 브랜치와 PR은 선택이다(되돌리기 어렵거나 광범위한 변경, 리뷰가 필요할 때). ⛔ **push 전 테스트·린트 통과가 유일한 게이트**다 — CI는 push 이후 도는 사후 안전망이다. 하나의 커밋에는 Structural 또는 Behavioral 한 유형만 담는다.

## 작업 방식

- 대화와 문서는 한국어를 기본으로 하고, 명령 예시는 현재 OS에 맞게 작성한다. 프론트엔드 명령에는 pnpm을 사용한다.
- 새 작업은 `plan.md`에 기록하고 실패하는 테스트 하나부터 시작한다(Red → Green → Refactor).
- 테스트가 통과하는 상태에서만 리팩터링한다.
- Structural 변경과 Behavioral 변경을 한 커밋이나 PR에 섞지 않는다.
- 커밋 제목은 `[Structural]` 또는 `[Behavioral]` 접두사를 붙이고 변경 의도를 간결하게 적는다.
- 전역 지침과 충돌하거나 프로젝트 고유 예외가 필요하면 임의로 우회하지 말고 사용자에게 확인한 뒤 아래 “프로젝트 고유 결정”에 근거와 함께 기록한다.

## 작업별 스킬 (필요할 때 로드)

- **add-backend-domain**: 백엔드 도메인 추가(모델 → 마이그레이션 → 스키마 → 서비스 → 라우터 → 테스트, §4·§8)
- **db-migration**: DB 스키마 변경 시 Alembic 워크플로와 금지사항(§11)
- **add-frontend-feature**: 프론트엔드 기능 추가(App Router + 서버 컴포넌트 fetch + Server Actions, §13·§14)
- **pr-workflow**: 커밋·브랜치·PR 흐름(`[Structural]`/`[Behavioral]`, §19·§20)
- **stack-versions**: 고정 버전, 버전별 주의사항과 업그레이드 검증 절차

각 절차의 근거와 상세 규칙은 `docs/architecture.md`의 해당 절을 확인한다. `.claude/skills/`는 저장소에 포함된 선택적 작업 가이드이며 개인 홈 디렉터리의 설정을 전제하지 않는다.

## 프로젝트 고유 결정

- <없으면 "없음". 기본 아키텍처에서 벗어난 결정은 사유와 함께 `docs/architecture.md`에도 기록한다.>
