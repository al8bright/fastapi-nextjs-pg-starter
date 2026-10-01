# fastapi-nextjs-pg-starter 아키텍처 가이드

> 본 문서는 **fastapi-nextjs-pg-starter로 생성한 프로젝트**가 따르는 아키텍처 표준이다.
> 표준 스택은 **FastAPI(백엔드) + Next.js(프론트엔드) + PostgreSQL**이며,
> 인증은 **자체 계정 + Bearer JWT를 기본**으로 하고(OIDC SSO/ERP 등 외부 시스템 연동은 도입 시 확장 §9), 시각은 **KST 단일 기준**을 따른다.
> 프론트엔드는 순수 SPA가 아니라 **Next.js App Router + React Server Components** 기반이다.
> 브라우저는 FastAPI를 직접 호출하지 않는다 — **브라우저 ↔ Next(httpOnly 쿠키), Next ↔ FastAPI(Bearer JWT)** 의 2단 구조다(§13, §14).
> 이 템플릿을 사용하기로 했다면 아래 규칙을 프로젝트의 기본 계약으로 적용한다.

---

## ★ 핵심 MUST 요약 (반드시 고정)

> 아래 항목은 **프로젝트마다 바뀌지 않는 고정 규칙**이다. 어기려면 `ARCHITECTURE.md`에 사유를 남기되, ⛔ 표시 항목은 예외 없이 금지한다.
> 세부 내용은 각 섹션(§) 참조.

| # | 고정 규칙 (MUST) | § |
|---|------------------|---|
| 1 | **표준 스택 고정**: 백엔드 FastAPI 0.142 + SQLAlchemy 2.1 + Alembic, 프론트 **Next.js App Router + React Server Components + TS**, DB는 **PostgreSQL** | §2 |
| 2 | **DB는 항상 Alembic으로만 관리** — 모든 스키마 생성·변경은 마이그레이션. ⛔ dev/운영 런타임 `create_all`·자동 DDL·수동 `ALTER` 금지(테스트 in-memory만 예외) | §11 |
| 3 | **설정은 OS 무관한 서비스별 `.env`로 주입** — 백엔드는 `backend/.env`, 프론트는 `frontend/.env` 사용. ⛔ 개발 중 `$env:`/`export`/`set` 셸 환경변수 의존 금지. ⛔ 실제 `.env` 커밋 금지(각 `.env.example`만) | §5, §17 |
| 4 | **시각은 KST 단일 기준** — `now()`는 naive `datetime.now()`, PostgreSQL `connect_args`에 `timezone=Asia/Seoul`. Unix는 `TZ=Asia/Seoul`, Windows는 OS 시각대를 서울(UTC+9)로 설정. ⛔ UTC 변환/`ZoneInfo` 신규 도입 금지 | §10, §7 |
| 5 | **API 경로 `/api/v1` 고정** — 버전 prefix는 `main.py`에서, 라우터는 `api/v1/router.py`로 집계 | §4 |
| 6 | **설정 접근은 `get_settings()` + `@lru_cache`** — ⛔ 모듈 전역 `settings` 싱글톤 금지 | §5 |
| 7 | **공통 의존성은 `app/dependencies.py` 단일 파일** (`get_db`, `get_current_user` 등) | §6 |
| 8 | **계층 분리** — 라우터(`api/`)는 HTTP만 얇게, 도메인 로직은 `services/`, 검증/직렬화는 `schemas/` | §4, §8 |
| 9 | **프론트 표준 스택 고정**: **서버 컴포넌트 fetch + Server Actions**. ⛔ 브라우저에서 FastAPI 직접 호출 금지, ⛔ 토큰을 `localStorage`·클라이언트 상태에 두는 것 금지 | §2, §13 |
| 10 | **패키지 매니저는 pnpm** — ⛔ npm 사용 금지 | §2 |
| 11 | **인증은 2단 구조** — 브라우저↔Next는 **httpOnly 쿠키 2개**(access + refresh, production 은 `__Host-` 프리픽스), Next↔FastAPI는 **Bearer access JWT**(`Authorization: Bearer <token>`, 검증 실패 시 401). refresh 는 **DB 세션(auth_sessions) 기반 불투명 토큰**으로 회전(rotation)·재사용 감지·즉시 폐기를 지원한다 | §9, §14 |
| 12 | **테스트는 pytest + SQLite in-memory** — `get_settings.cache_clear()` autouse, `dependency_overrides`로 격리 | §12 |
| 13 | **TDD + Tidy First** — Red→Green→Refactor, 구조 변경과 동작 변경을 한 커밋에 섞지 않음 | §18 |
| 14 | **커밋 메시지**: `[Structural]`/`[Behavioral]` + conventional type, 테스트·린트 통과 시에만 | §19 |
| 15 | **push 전 로컬 테스트·린트 통과가 유일한 게이트** — `main` 직접 커밋이 기본(브랜치·PR은 선택), 1 커밋은 Structural·Behavioral 중 하나만 | §20 |

---

## 0. 적용 범위 & 우선순위

- **MUST**: 이 템플릿을 적용한 프로젝트는 반드시 따른다.
- **SHOULD**: 특별한 사유가 없으면 따른다. 벗어나면 `ARCHITECTURE.md`에 사유를 남긴다.
- **MAY**: 프로젝트 성격에 따라 선택한다.
- 본 가이드와 프로젝트의 추가 문서가 충돌하면 **본 가이드 우선**. 예외는 프로젝트 `ARCHITECTURE.md`에 사유와 함께 명시한다.

---

## 1. 프로젝트 명명 규칙

| 대상 | 규칙 | 예시 |
|------|------|------|
| **저장소/루트 폴더** | `PascalCase` 또는 `snake_case` 일관 유지(프로젝트 내 통일) | `MyProject`, `my_project` |
| **FastAPI app title** | `"<프로젝트> API"` | `FastAPI(title="my_project API", version="0.1.0")` |
| **PostgreSQL DB명** | `snake_case`, 프로젝트명 기반 | `my_project`, `shop` |
| **DB 테이블명** | `snake_case` **복수형**. 외부(ERP 등) 연동 테이블은 접미사로 출처 표기 | `admins`, `events`, `orders_erp` |
| **Python 모듈 파일** | `snake_case`, 모델은 **단수** | `order.py`, `auth_service.py` |
| **프론트 컴포넌트 파일** | `PascalCase.tsx`, 파일명 = 컴포넌트명 | `LoginForm.tsx`, `EventCalendar.tsx` |
| **App Router 라우트 파일** | 프레임워크 규약 파일명은 **소문자 고정**(임의 변경 불가) | `page.tsx`, `layout.tsx`, `route.ts`, `proxy.ts` |
| **라우트 디렉토리** | `kebab-case` (URL 경로가 그대로 된다) | `app/admin/login-throttles/`, `app/order-history/` |
| **환경변수 접두** | 백엔드는 `UPPER_SNAKE`. 프론트는 **서버 전용이 기본이라 접두 없음**, 클라이언트 노출이 꼭 필요할 때만 `NEXT_PUBLIC_` | `DATABASE_URL`, `FASTAPI_URL`, `NEXT_PUBLIC_SITE_NAME` |
| **세션 쿠키 이름** | access `<project>_session` + refresh `<project>_refresh` 로 충돌 방지 (httpOnly 쿠키 2개, production 은 `__Host-` 프리픽스 §14) | `my_project_session`, `my_project_refresh` |

> ⚠️ `NEXT_PUBLIC_` 을 붙이면 그 값은 **빌드 시 클라이언트 번들에 그대로 박힌다.** 비밀값(토큰·API 키·내부 호스트)에는 절대 붙이지 않는다.

---

## 2. 기술 스택 표준

### 백엔드
- **언어/런타임**: Python 3.13+ (`X | None` 문법, `Mapped[]` 타입 힌트 사용) — 하한은 `scripts/versions.env`(`MIN_PYTHON`), 정확 핀은 루트 `.python-version`(pyenv)
- **프레임워크**: FastAPI 0.142.x + Uvicorn(`[standard]`) — 정확 핀은 `backend/requirements.txt`(현재 0.142.2)
- **ORM/마이그레이션**: SQLAlchemy 2.1 (`Mapped`/`mapped_column`) + Alembic
- **DB 드라이버**: PostgreSQL + `psycopg2-binary`
- **설정**: `pydantic-settings` (BaseSettings)
- **검증/직렬화**: Pydantic 2.x
- **인증**: JWT. **자체 계정 → `PyJWT`**, **OIDC/SSO 연동 → `python-jose[cryptography]`**
- **테스트**: `pytest` + SQLite in-memory
- **HTTP 클라이언트(서버↔서버)**: `httpx2` (httpx 의 유지보수 후속, Starlette 1.x TestClient 호환)
- **버전 고정**: `requirements.txt`에 **`==` 정확한 버전 핀** (재현성 우선)

### 프론트엔드
- **프레임워크/런타임**: Next.js `16.3` (**App Router**) + React `19.3` + TypeScript `6.0`
- **라우팅**: App Router 파일 시스템 라우팅 (`app/**/page.tsx`, 공통 셸은 `app/layout.tsx`)
- **데이터 페칭**: **서버 컴포넌트에서 직접 `fetch`** — 서버 전용 래퍼 `lib/server/fastapi.ts` 를 통해 FastAPI 호출
- **변경(mutation)**: **Server Actions** (`'use server'`, `lib/actions/*.ts`)
- **인증 가드**: 루트 `proxy.ts` 에서 세션 쿠키 검사(access 없고 refresh 만 있으면 자동 갱신 §14) → `/login?next=<원래경로>` 리다이렉트
- **HTTP**: 표준 `fetch`. ⛔ `axios` 안 쓴다
- **서버 상태**: 서버 컴포넌트 렌더 + `revalidatePath`. ⛔ 쿼리 캐시 라이브러리(React Query 등) 안 쓴다
- **클라이언트 상태**: **전역 스토어 없음.** 세션의 유일한 출처는 httpOnly 쿠키, 나머지는 지역 `useState`. ⛔ Zustand 등 전역 스토어 안 쓴다
- **스타일**: Tailwind CSS `4.3` v4 (CSS-first `@theme`) — **`@tailwindcss/postcss`** 플러그인 + `postcss.config.mjs`. ⛔ `@tailwindcss/vite` 는 쓸 수 없다(Next는 Vite가 아니다)
- **패키지 매니저**: **pnpm** (npm 금지)
- **타입체크**: `tsc --noEmit` (`pnpm typecheck`)
- **린트**: ESLint flat config — `eslint-config-next`(core-web-vitals + typescript) + `@eslint/js` (`eslint.config.mjs`, `pnpm lint`)
- **테스트**: Vitest `5.0` + `@vitejs/plugin-react` + jsdom + Testing Library (`vitest.config.ts`, `pnpm test` / `pnpm test:watch`)
- **배포 런타임**: **Node 런타임**이 필요하다 — `next build` → `next start`. ⛔ 정적 호스팅(순수 파일 서빙)으로는 서버 컴포넌트·Server Action·`proxy.ts` 가 동작하지 않는다

> 프론트 표준은 **서버 컴포넌트 fetch + Server Actions** 로 통일한다.
> ⛔ **브라우저에서 FastAPI 를 직접 호출하지 않는다.** 브라우저는 Next 하고만 통신하고, FastAPI 호출은 전부 서버에서 일어난다.
> ⛔ **토큰을 `localStorage`·클라이언트 상태에 두지 않는다.** 세션은 httpOnly 쿠키뿐이다(§14).
> ⛔ Route Handler(`app/api/**/route.ts`)를 습관적으로 만들지 않는다 — 브라우저가 FastAPI 를 부르지 않으므로 BFF 엔드포인트가 필요 없다.
> 꼭 필요한 예외(웹훅 수신 등)는 그 사유를 `ARCHITECTURE.md`에 남긴다.

---

## 3. 저장소 구조(목표)

```
<ProjectName>/
├── backend/
│   ├── app/
│   ├── alembic/
│   ├── alembic.ini
│   ├── requirements.txt
│   ├── .env.example
│   ├── pytest.ini
│   ├── tests/
│   └── uploads/                 # UPLOAD_DIR 기본값 — 업로드 파일(public/·private/), .gitignore 대상
├── frontend/
│   ├── app/                     # App Router (page/layout/globals.css)
│   ├── components/              # 'use client' 컴포넌트
│   ├── lib/                     # server fetch 래퍼 · session · actions
│   ├── proxy.ts            # 쿠키 기반 인증 가드
│   ├── package.json
│   ├── .env.example
│   ├── next.config.ts
│   ├── postcss.config.mjs
│   └── tsconfig.json
├── docs/                        # 프로젝트 고유 문서 (PRD·유저 플로우·기획서·<연동>-가이드 등)
│   └── README.md
├── AGENTS.md                    # AI 에이전트 공통 지침 (CLAUDE.md 가 @import)
├── CLAUDE.md                    # Claude Code 진입점
├── ARCHITECTURE.md              # 본 가이드 — 벗어난 결정/사유도 여기 기록
├── DESIGN.md                    # 디자인 토큰(색상/타이포그래피) — 테마(@theme)의 원본
├── PLAN.md                      # TDD 작업 순서 (필수)
└── README.md
```

- 루트에 `PLAN.md`를 두고 **TDD 작업 순서**(실패 테스트 단위)를 관리한다.
- 환경값은 `backend/.env.example`과 `frontend/.env.example`로 키만 공유하고, 복사해 만든 실제 `.env`는 커밋하지 않는다.

---

## 4. 백엔드 구조(`backend/app/`)

```
backend/app/
├── __init__.py
├── main.py                 # FastAPI 진입점, lifespan, 미들웨어, 라우터 등록
├── config.py               # Settings(BaseSettings) + get_settings()
├── dependencies.py         # get_db, get_current_user 등 공통 의존성  ★단일 파일
├── api/
│   ├── v1/                 # ★ /api/v1 버전 디렉토리
│   │   ├── router.py       # 하위 라우터 집계
│   │   ├── auth.py         # 자체 계정 /auth/login·refresh·logout·me; SSO는 도입 시 확장
│   │   ├── health.py
│   │   ├── notices.py      # 공개 공지 목록·상세·첨부 다운로드
│   │   ├── banners.py      # 공개 배너(노출 기간 안의 활성 배너)
│   │   ├── admin/          # /admin/* — 라우터 단위 require_admin (dashboard·users·notices·banners·editor)
│   │   └── <domain>.py     # 도메인별 APIRouter (얇은 HTTP 계층)
│   ├── errors.py           # ServiceError·StorageError → HTTP 상태 변환표(전역 핸들러)
│   └── files.py            # 첨부 다운로드 응답(Content-Disposition), 업로드 크기 제한 읽기
├── core/
│   ├── security.py         # access JWT·refresh 불투명 토큰, 비밀번호 정책, now() (KST naive)
│   ├── storage.py          # UPLOAD_DIR 로컬 저장소 — 이미지 검증·재인코딩, 첨부 허용 목록, 키 해석 (§8)
│   └── sanitize.py         # 리치 텍스트 본문 HTML 정화(nh3 허용 목록) (§8)
├── db/
│   ├── base.py             # DeclarativeBase (Base)
│   ├── engine.py           # 엔진 팩토리 (SQLite/PG 분기, KST connect_args)
│   └── session.py          # get_db 세션 / SessionLocal
├── models/
│   ├── __init__.py         # 모든 모델 re-export (Alembic/메타데이터 등록용)
│   ├── auth_session.py     # AuthSession(refresh 세션) + LoginThrottle(로그인 시도 제한) (§9)
│   ├── notice.py           # Notice + NoticeAttachment
│   ├── banner.py           # Banner
│   └── <domain>.py
├── schemas/
│   └── <domain>.py         # Pydantic BaseModel (요청/응답)
└── services/
    ├── session_service.py  # refresh 세션 생성·회전·폐기 (§9)
    ├── notice_service.py   # 공지 — 저장 직전 sanitize_html, 게시일·조회수, 첨부
    ├── banner_service.py   # 배너 — 노출 기간 판정, 이미지 key 검증, 순서
    ├── admin_service.py    # 대시보드 집계, 사용자 권한·활성(자기 강등·마지막 관리자 보호), 세션·스로틀 관리
    ├── upload_service.py   # 공개 이미지 업로드(에디터·배너) 응답 조립
    ├── <domain>_service.py # 비즈니스 로직
    └── exceptions.py       # ServiceError 등 도메인 예외
```

### 계층 규칙 (MUST)
- **라우터(`api/`)는 얇게**: HTTP 입출력·인증·상태코드만. 비즈니스 로직 금지.
- **도메인 로직은 `services/`**: DB 트랜잭션, 규칙 검증, 외부 연동.
- **`schemas/`**: Pydantic 검증·직렬화 전용. ORM 모델과 분리.
- **의존성 주입**: DB 세션·현재 사용자는 항상 `Depends()`로 주입.

### `main.py` 표준 형태
```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.config import get_settings

@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    import app.models  # 모델 메타데이터 등록
    # 엔진/세션 팩토리 초기화는 app.state 또는 db 모듈에서
    yield

app = FastAPI(title="<Project> API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")   # ★ 버전 prefix는 여기서

@app.get("/api/v1/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

### 라우터 집계 (`api/v1/router.py`)
```python
from fastapi import APIRouter
from app.api.v1 import auth, health, orders   # 도메인 모듈

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(health.router)
api_router.include_router(orders.router)
```

---

## 5. 설정 (`config.py`)  — `get_settings()` + `@lru_cache`

```python
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore",
    )

    # DB
    database_url: str | None = None

    # JWT / 세션 — access 는 짧게(탈취 창 축소), 갱신은 DB 세션 기반 refresh 토큰이 담당한다 (§9)
    secret_key: str = DEFAULT_SECRET_KEY  # "change-me-in-production-use-32-bytes"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 14

    # 로그인 시도 제한 — 계정별 연속 실패가 max 이상이면 lockout 분 동안 429 (§9)
    login_max_failures: int = 5
    login_lockout_minutes: int = 15

    # CORS
    cors_origins: str = "http://localhost:3000"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

@lru_cache
def get_settings() -> Settings:
    return Settings()
```

규칙:
- **접근은 항상 `get_settings()` 함수로** (모듈 전역 `settings` 싱글톤 금지).
  → 테스트에서 `get_settings.cache_clear()`로 환경을 재설정할 수 있어야 한다.
- 파생 값은 `@property`(예: `cors_origin_list`)로 노출한다.
- 환경변수명이 필드명과 다르면 `Field(validation_alias=...)`로 명시한다.

### 설정 주입은 항상 서비스별 `.env` — OS 독립 (MUST)

> **개발 환경 설정은 OS에 관계없이 서비스별 `.env` 파일로 주입한다.**
> 백엔드는 `backend/.env`, 프론트엔드는 `frontend/.env`를 사용하며 각각 같은 디렉터리의 `.env.example`을 복사한다.

- 백엔드: `backend/`에서 실행하며 `pydantic-settings`가 `backend/.env`를 로드한다(`env_file=".env"`). 코드에 설정값 하드코딩 금지.
- 프론트엔드: `frontend/`에서 실행하며 Next가 `frontend/.env`(로컬은 `.env.local`)를 로드한다(§17). 접두 없는 키(`FASTAPI_URL` 등)는 **서버에서만** `process.env` 로 읽고, 클라이언트 번들에 노출되는 것은 `NEXT_PUBLIC_` 키뿐이다.
- **금지(MUST NOT)**: 개발 중 OS별 셸 환경변수 설정에 의존하는 방식.
  - PowerShell `$env:VAR=...`, bash `export VAR=...`, `set VAR=...` 등으로 **셸에 값을 심어두고 실행하는 것** — OS·셸마다 달라 재현되지 않는다.
  - `launch.json`/IDE 설정·OS 사용자 환경변수에 비밀값을 박아두는 것.
- **예외**: 컨테이너/CI/배포 런타임에서 **오케스트레이터가 주입하는 실제 환경변수는 허용**(이때도 `pydantic-settings`가 `.env`와 동일 인터페이스로 읽으므로 코드 변경 불필요). 즉, **로컬 개발은 서비스별 `.env` 강제**, 운영은 동일 키를 환경변수로 주입.
- 실제 `.env`는 **커밋 금지(`.gitignore`)**, `backend/.env.example`과 `frontend/.env.example`에 **키만** 채워 커밋한다(§17).
- 줄바꿈/인코딩은 `UTF-8`로 통일하고, 서비스별 `.env`를 OS별 파일로 다시 나누지 않는다. 저장소에는 `.gitattributes`의 `* text=auto eol=lf`를 권장한다.

---

## 6. 의존성 주입 (`app/dependencies.py`)  ★단일 파일

```python
from collections.abc import Generator
from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.core.security import decode_access_token

def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_current_user(token: str = Depends(...), db: Session = Depends(get_db)):
    cred_error = HTTPException(status.HTTP_401_UNAUTHORIZED, "인증이 필요합니다.")
    payload = decode_access_token(token)
    if payload is None or "sub" not in payload or "sid" not in payload:
        raise cred_error
    # sid 세션이 폐기·만료면 access 토큰이 만료 전이어도 401 — 로그아웃의 즉시 무효화 (§9)
    if not session_service.is_active_session(db, payload["sid"]):
        raise cred_error
    user = ...  # services 통해 조회
    if user is None:
        raise cred_error
    return user
```

- 공통 의존성(`get_db`, `get_current_user`, 권한 체크 등)은 **`app/dependencies.py` 한 곳**에 모은다.

---

## 7. DB · 세션 · 엔진

`app/db/engine.py` (엔진 팩토리 — SQLite 테스트/PostgreSQL 운영 동시 지원):
```python
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.pool import StaticPool
from app.config import Settings

def postgres_connect_args() -> dict[str, str]:
    return {"options": "-c timezone=Asia/Seoul"}   # ★ KST 고정

def create_engine_from_settings(settings: Settings) -> Engine:
    url = settings.database_url
    if not url:
        raise RuntimeError("DATABASE_URL 이 설정되지 않았습니다 (.env 확인).")
    kwargs: dict = {}
    if url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
        if ":memory:" in url:
            kwargs["poolclass"] = StaticPool
    elif "postgresql" in url:
        kwargs["connect_args"] = postgres_connect_args()
    return create_engine(url, pool_pre_ping=True, **kwargs)
```

`app/db/base.py`:
```python
from sqlalchemy.orm import DeclarativeBase
class Base(DeclarativeBase):
    pass
```

`app/db/session.py`: 요청 단위 세션을 제공한다(`SessionLocal` 또는 `get_db`).
**PostgreSQL 연결에는 반드시 `timezone=Asia/Seoul` connect_args를 적용한다.**

---

## 8. 모델 · 스키마 · 서비스 규칙

### 모델 (`models/`) — SQLAlchemy 2.1 `Mapped`
```python
from datetime import datetime
from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from app.core.security import now
from app.db.base import Base

class Order(Base):
    __tablename__ = "orders"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)
```
- 모든 모델은 `models/__init__.py`에서 import(re-export)하여 메타데이터에 등록한다.
- 생성·수정 시각은 `default=now`(KST naive). 열거형은 `str, enum.Enum`을 상속.

### 스키마 (`schemas/`)
- `XxxBase` → `XxxCreate`/`XxxUpdate`/`XxxRead` 상속 패턴.
- 제약은 `Field(ge=, gt=, max_length=)`, 복합 규칙은 `@field_validator`.

### 서비스 (`services/`)
- 함수형 서비스(`def create_order(db, user, data)`)를 기본으로 한다.
- 실패는 `ServiceError(code=...)` 같은 **도메인 예외**로 던지고, 라우터에서 HTTP로 변환.
- N+1 방지: 조회 시 `selectinload` 등 명시적 로딩 옵션.
- `ServiceError(code)`(와 저장소의 `StorageError`)는 `app/api/errors.py` 의 전역 핸들러가 `STATUS_BY_CODE` 표로 HTTP 상태를 정한다(`not_found` 404, `self_modification`·`last_admin`·`too_many_attachments` 409, `file_too_large` 413, 검증류 422, 표에 없으면 400). 응답 본문은 `{"detail": <메시지>, "code": <코드>}`. 인증 라우터(`auth.py`)는 401/429 와 쿠키·헤더가 얽혀 있어 직접 변환한다.

### 기본 제공 테이블

| 테이블 | 리비전 | 용도 |
|--------|--------|------|
| `app_meta` | `0001_initial` | 연결 확인용 샘플(`/health/db`) |
| `users` | `0002_users` | 자체 계정 — `role`(`user`/`admin`), `is_active` |
| `auth_sessions`, `login_throttles` | `0003_auth_sessions` | refresh 세션(해시만 저장), 계정별 로그인 실패 카운터 (§9) |
| `notices` | `0004_notices_banners` | 공지 — `body_html`(저장 시 정화), `is_pinned`, `is_published`, `published_at`(처음 게시 때 1회), `view_count`, `author_id`(FK users, `SET NULL`) |
| `notice_attachments` | 〃 | 공지 첨부 — `notice_id`(FK, `CASCADE`), `storage_key`(private 키), `original_name`, `content_type`, `size_bytes`. 공지당 최대 10개 |
| `banners` | 〃 | 배너 — `image_key`(public/banners 키)·`image_width/height`(서버가 잰 값), `link_url`(http(s) 또는 `/` 내부 경로만), `alt_text`, `starts_at`/`ends_at`(노출 기간, NULL=무제한), `sort_order`, `is_active` |

### 파일 업로드 · 저장소 · 본문 HTML 정화

**저장소(`core/storage.py`)** — 업로드 파일은 `UPLOAD_DIR`(기본 `backend/uploads/`, 상대 경로는 backend 기준) 아래에 **서버가 만든 키**로만 저장한다. 사용자 파일명은 디스크 경로에 쓰지 않는다.

| 키 | 내용 | 노출 |
|----|------|------|
| `public/editor/YYYY/MM/DD/<uuid>.<ext>` | 에디터 본문 이미지 | `/uploads/public/...` 정적 서빙 (`Cache-Control: public, max-age=31536000, immutable`) |
| `public/banners/YYYY/MM/DD/<uuid>.<ext>` | 배너 이미지 | 〃 |
| `private/attachments/YYYY/MM/DD/<uuid>.<ext>` | 공지 첨부(원본 파일명은 DB) | ⛔ 정적 서빙 금지 — 다운로드 API 로만 |

- **이미지**: 매직 바이트 + Pillow 로 실제 이미지인지 확인(PNG·JPEG·WebP·GIF 만, SVG·BMP 등 거부, 4천만 픽셀 초과 거부) → EXIF 방향 반영 → 긴 변 `MAX_LONG_EDGE`(2000px) 초과 시 축소 → **메타데이터 없이 재인코딩**(EXIF·위치 정보 제거). **GIF 는 애니메이션 보존을 위해 재인코딩하지 않고 그대로** 저장한다(크기 상한은 업로드 용량 제한). 애니메이션 WebP 는 첫 프레임만 남는다. 상한 `MAX_IMAGE_UPLOAD_MB`(5).
- **첨부**: 확장자 허용 목록(`pdf hwp hwpx doc docx xls xlsx ppt pptx txt csv zip png jpg jpeg`), `Content-Type` 은 클라이언트 값이 아니라 확장자 표로 정한다. 상한 `MAX_ATTACHMENT_UPLOAD_MB`(20). 다운로드는 `Content-Disposition: attachment; filename="<ASCII 대체>"; filename*=UTF-8''<RFC 5987>` + `nosniff` + `Cache-Control: private, no-store`.
- **경로 탈출 방지**: 키는 정규식(`(public/(editor|banners)|private/attachments)/YYYY/MM/DD/<32hex>.<ext>`)에 맞아야 해석하고, 해석된 경로가 `UPLOAD_DIR` 안인지 다시 확인한다. 정적 마운트 루트가 `UPLOAD_DIR/public` 이라 `../` 로도 private 에 닿지 않는다.
- **URL**: 응답의 공개 파일 URL = `PUBLIC_FILES_BASE_URL` + `/uploads/` + key. 비우면 루트 상대(`/uploads/public/...`) — 프론트엔드가 같은 오리진이거나 `/uploads` 를 백엔드로 프록시할 때. 첨부 `download_url` 도 같은 접두사를 쓴다. **이 템플릿(Next.js BFF)은 비워 둔다** — `frontend/next.config.ts` 의 rewrite 가 `/uploads/*` 와 공개 첨부 다운로드 경로를 같은 오리진에서 백엔드로 넘긴다(§13 "업로드 파일 · rewrite"). CDN 등 다른 오리진에서 공개 파일을 내보낼 때만 그 주소를 넣고 프론트 CSP `img-src` 도 연다.
- **삭제**: 공지·첨부·배너 행을 지우면 커밋 후 파일도 지운다(배너 이미지는 다른 배너가 같은 키를 참조하지 않을 때만). 에디터 본문 이미지는 본문 HTML 이 참조하므로 자동으로 지우지 않는다 — 고아 파일 정리는 별도 배치 몫.
- 업로드 크기는 핸들러가 상한+1 바이트까지만 읽어 판정한다. multipart 본문 자체는 그 전에 임시 파일로 받아지므로, 운영에서는 앞단 프록시(nginx `client_max_body_size` 등)에도 상한을 둔다.

**본문 HTML 정화(`core/sanitize.py`, nh3)** — 리치 텍스트 본문은 **서비스 계층이 저장 직전에** `sanitize_html` 을 거친다(클라이언트를 믿지 않는다). 보기 화면에는 서버가 정화해 돌려준 HTML 만 넣는다.

- 허용 태그: `p div br hr span h1–h6 strong b em i u s strike sub sup mark small ul ol li blockquote pre code a img table thead tbody tfoot tr th td caption colgroup col iframe`
- 허용 속성: 모든 태그 `class`(값은 `align-left align-center align-right video` 만, 남는 값이 없으면 속성 제거) · `a`: `href target title` · `img`: `src alt width height title` · `iframe`: `src width height title allowfullscreen` · `div`: `data-youtube-video` · `td/th`: `colspan rowspan scope` · `ol`: `start` · `col`: `span`. `width/height` 는 1~4자리 정수만.
- `iframe[src]` 는 `^https://www\.youtube(?:-nocookie)?\.com/embed/[A-Za-z0-9_-]{11}$` 만 — 그 외(다른 호스트, 쿼리 문자열)는 iframe 을 **내용째** 지운다. 남는 iframe 에는 `sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"`·`loading="lazy"`·`referrerpolicy="strict-origin-when-cross-origin"` 를 강제한다.
- URL 스킴 `http https mailto tel`(+상대 경로)만 — `javascript:`·`data:` 는 제거. `a` 에는 `rel="noopener noreferrer"` 강제.
- `style`·`id`·`on*`·`srcdoc`·편집 전용 속성(`contenteditable`, `data-selected` 등)은 제거, `script`·`style` 은 내용째 제거.
- 정화 후 글자·`src` 있는 `img`·`iframe` 이 하나도 없으면 빈 본문으로 422.
- ⚠️ **에디터와 정화 허용 목록은 한 쌍이다.** 에디터에 서식·미디어를 추가하면 허용 목록과 `tests/test_sanitize.py` 를 같은 변경에서 고친다(허용 목록을 넓힐 땐 테스트를 먼저).

### 공지·배너·관리자 API 요약

| 경로 (`/api/v1` 기준) | 인증 | 설명 |
|------|------|------|
| `GET /notices?page&size&q` · `GET /notices/{id}` · `GET /notices/{id}/attachments/{aid}` | 없음 | 게시된 공지만(초안은 404). 고정 먼저 → 게시일 최신순. 상세 조회 시 `view_count` +1 |
| `GET /banners` | 없음 | `is_active` + 노출 기간 안(KST 현재) — `sort_order`, `id` 순 |
| `/admin/*` | `require_admin` | 라우터 단위 의존성 — 비로그인 401, 일반 사용자 403. 역할은 요청마다 DB 에서 읽어 강등 즉시 403 |
| `GET /admin/dashboard` | 〃 | 사용자·세션·잠금·공지·배너 집계 + DB 상태 + Alembic 리비전 |
| `GET /admin/users` · `PATCH /admin/users/{id}` · `DELETE /admin/users/{id}/sessions` | 〃 | 자기 강등·비활성화 금지, 마지막 활성 관리자 보호(409). 비활성화 시 세션 전부 폐기 |
| `GET /admin/sessions` · `DELETE /admin/sessions/{id}` | 〃 | 살아 있는 세션 목록·강제 폐기 |
| `GET /admin/login-throttles` · `DELETE /admin/login-throttles/{username}` | 〃 | 잠금·최근 24시간 실패 목록, 잠금 해제 |
| `/admin/notices`(CRUD) · `/admin/notices/{id}/attachments` | 〃 | 저장 시 본문 정화, 첨부 업로드(multipart `file`)·다운로드·삭제 |
| `/admin/banners`(CRUD) · `POST /admin/banners/image` · `PATCH /admin/banners/order` | 〃 | 이미지 먼저 업로드 → `image_key` 로 참조 |
| `POST /admin/editor/images` | 〃 | multipart `file` → `{key, url, width, height}` |

---

## 9. 인증 (JWT · 세션 · SSO)

- `core/security.py`에 토큰 생성/검증과 비밀번호 정책, `now()`를 둔다. 세션(refresh) 도메인 로직은 `services/session_service.py`, 로그인·스로틀은 `services/user_service.py`, HTTP 변환은 `api/v1/auth.py`가 담당한다(§4 계층 분리 그대로).

### 토큰 모델 (자체 계정 — skeleton 구현)

- **access 토큰**: `PyJWT` HS256 JWT. 클레임은 `sub`(user id 문자열)·`sid`(세션 id)·`iat`·`exp`·`typ:"access"`. 만료 `ACCESS_TOKEN_EXPIRE_MINUTES` **기본 15분** — 짧게 잡아 탈취 창을 줄이고, 갱신은 refresh 토큰이 담당한다.
- **refresh 토큰**: JWT 가 **아니라** 불투명(opaque) 토큰 `"<session_id>.<urlsafe 무작위>"` 다. DB(`auth_sessions`)에는 **SHA-256 해시만** 저장한다 — DB 가 유출돼도 평문 토큰을 복원할 수 없고, 검증은 해시 재계산 + 상수시간 비교(`hmac.compare_digest`)다. refresh 토큰 1개 = `auth_sessions` 행 1개.
- **즉시 무효화**: `get_current_user` 가 요청마다 `sid` 세션의 유효성(존재·미폐기·미만료)을 검사한다 — 로그아웃·강제 폐기가 access 토큰 만료를 기다리지 않고 **즉시 401** 로 반영된다.
- 토큰은 `Authorization: Bearer <token>` 헤더. 검증 실패는 401 + `WWW-Authenticate: Bearer`.

### 엔드포인트 계약

| 엔드포인트 | 요청 | 응답 |
|------|------|------|
| `POST /auth/login` | `{username, password}` | `TokenResponse` (성공 200 / 자격증명 오류 401 / 잠금 429) |
| `POST /auth/refresh` | body 모드 `{refresh_token}` / cookie 모드 본문 없음(쿠키) | `TokenResponse` — **회전된 새 쌍** (실패는 원인 무관 401) |
| `POST /auth/logout` | body 모드 `{refresh_token}` / cookie 모드 본문 없음(쿠키) | **204 멱등·인증 불요** — 토큰 "소지"가 폐기 권한이다(해시 검증 후 폐기) |
| `GET /auth/me` | Bearer access | `UserRead` |

- `TokenResponse` 는 로그인·리프레시가 **동일 형태**다: `{access_token, refresh_token, token_type, expires_in, refresh_expires_in}`. `expires_in`/`refresh_expires_in` 은 절대 시각이 아니라 **"지금부터 남은 초"** 다 — 클라이언트가 서버와 시계를 맞출 필요 없이 갱신 시점을 계산한다.

### refresh 토큰 전달 방식 (`REFRESH_TOKEN_TRANSPORT`)

같은 백엔드 코드가 BFF 와 브라우저 SPA 를 모두 섬기도록 refresh 토큰의 운반 경로만 설정으로 바꾼다. 세션·회전·재사용 감지 로직은 동일하다.

| 모드 | 대상 | 동작 |
|------|------|------|
| `cookie` (**코드 기본값**) | 브라우저 SPA (React·Nuxt·SvelteKit) | login/refresh 가 refresh 토큰을 **httpOnly 쿠키**로 심고 본문의 `refresh_token` 은 `null` 이다 — JS 가 refresh 토큰을 읽을 수 없다. refresh/logout 은 쿠키에서 읽고 본문은 보지 않는다. refresh 실패는 401 **+ 쿠키 삭제**, logout 은 항상 204 + 쿠키 삭제 |
| `body` (**이 템플릿**) | BFF (Next.js 서버) | 요청·응답 JSON 본문으로 주고받고 쿠키를 쓰지 않는다. refresh/logout 본문은 필수(없으면 422). 받은 토큰은 Next 서버가 자기 httpOnly 쿠키에 보관한다(§14) |

- 쿠키 속성(cookie 모드): 이름 `refresh_token`, `Path=/api/v1/auth`(refresh/logout 에만 전송), `HttpOnly`, `SameSite=Lax`, `Secure=COOKIE_SECURE`, `Max-Age` = 세션의 남은 절대 수명(`refresh_expires_in` 과 같은 값).
- ⛔ `APP_ENV=production` + `cookie` 모드에서 `COOKIE_SECURE=false` 면 **기동을 거부**한다. 교차 출처 SPA 의 쿠키 갱신을 위해 CORS 는 `allow_credentials=True` 이며, 따라서 `CORS_ORIGINS` 에 출처를 명시한다(`*` 불가).
- **회전(rotation)**: `/auth/refresh` 는 성공할 때마다 새 secret 으로 교체하고, 직전 해시를 `prev_token_hash` 에 보관한다. **재사용 감지** — 현재 해시도 직전 해시도 아니거나, 직전 해시이지만 회전(`rotated_at`) 후 `ROTATION_GRACE_SECONDS`(60초)가 지났으면 탈취 신호로 보고 **세션을 즉시 폐기**한다. 응답은 다른 실패와 동일한 401 이다 — 실패 사유(형식 오류/미존재/만료/폐기/재사용)를 응답으로 구분하지 않아 공격자가 토큰 상태를 탐침하지 못한다.
- **동시 요청 유예(60초)**: access 쿠키가 만료된 채 멀티 탭·링크 prefetch 가 **같은 refresh 토큰으로 동시에** 갱신을 치는 것은 정상 상황이다 — 유예 없이 전부 재사용으로 판정하면 첫 요청만 이기고 나머지가 세션을 폐기해 사용자가 주기적으로 강제 로그아웃당한다. 그래서 직전 토큰은 회전 후 60초 동안만 정상 회전으로 받아 준다(이때 `prev_token_hash`·`rotated_at` 은 갱신하지 않는다 — 창이 슬라이딩하면 탈취된 이전 토큰이 무한히 살아남는다). 유예 내 이전 토큰 허용의 추가 노출은 실질 0 이다 — 그 토큰을 가진 공격자는 회전 전에도 같은 토큰을 쓸 수 있었다.
- ⚠️ **회전해도 절대 수명은 연장되지 않는다** — `expires_at` 은 로그인 시점 + `REFRESH_TOKEN_EXPIRE_DAYS`(기본 14일)로 고정이다. 회전으로 세션이 무한히 살아남지 못한다.

### 로그인 보호 (계정 존재 비노출 · 시도 제한)

- **실패 메시지 통일**: 로그인 실패는 원인(자격증명 불일치/비활성 계정)과 무관하게 같은 문구·같은 401 이다. 미존재 계정에도 **더미 bcrypt 해시로 1회 검증**해 응답 시간(타이밍)으로도 존재 여부가 드러나지 않게 한다.
- **로그인 스로틀**: 계정(username)별 DB 카운터(`login_throttles`). 연속 실패가 `LOGIN_MAX_FAILURES`(기본 5) 이상이면 `LOGIN_LOCKOUT_MINUTES`(기본 15분) 동안 **429** 로 거부한다. **미존재 계정도 행을 만들어 같은 429 를 받는다** — 잠금 응답 유무로도 계정 존재가 구분되지 않는다. 성공 시 스로틀 행은 삭제된다.
- **감사 로그**: 보안 이벤트(로그인 성공/실패/잠금, refresh 회전/거부/재사용 감지, 로그아웃)는 전용 로거 **`app.audit`** 로 남긴다 — 일반 로그와 분리 수집할 수 있다. 원인 구분은 응답이 아니라 이 로그로만 한다.

### 비밀번호 정책

- **새로 저장하는 비밀번호**는 `validate_new_password()` 한 곳에서 통합 검증한다 — 최소 `PASSWORD_MIN_LENGTH`(8자) + `len(password.encode("utf-8")) <= 72` bytes(bcrypt 상한). 위반은 422 도메인 오류로 변환한다. 한글은 UTF-8에서 글자당 3 bytes이므로 문자 수 제한과 같지 않다.
- 하한(8자)은 "새 비밀번호를 만드는 규칙"이라 **로그인 검증에는 적용하지 않는다** — 기존 계정의 짧은 비밀번호로도 로그인은 된다. 상한(72 bytes)은 HTTP 입력(스키마)에서도 미리 걸러 절단 착시를 막고, `hash_password()`도 방어적으로 초과 시 `ValueError`를 발생시킨다.

### SSO (도입 시 선택적 확장)

- **OIDC SSO**: 백엔드가 authorize→callback→userinfo 처리 후 앱 세션 JWT 발급, `python-jose`. 최초 로그인 시 `provision_from_userinfo()`로 사용자 upsert(없으면 생성, 식별정보 갱신). ERP 등 외부 시스템 연동도 프로젝트 요구에 따라 별도 확장한다.

### 응답 보안 헤더 · 캐시 금지 · CORS

백엔드는 모든 응답에 `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Cross-Origin-Opener-Policy: same-origin` 을 붙인다(`app/main.py` 보안 헤더 미들웨어 — CORS 바깥에서 감싸 preflight·오류 응답에도 적용).
HSTS(`max-age=31536000`)는 `COOKIE_SECURE=true` 이거나 `APP_ENV=production` 일 때만 보낸다 — body 모드(BFF) 운영은 `COOKIE_SECURE` 를 켜지 않을 수 있어 production 도 조건에 넣었고, 브라우저는 평문 HTTP 로 받은 HSTS 를 무시하므로 TLS 종단이 앞단 프록시여도 무해하다.
CSP 는 `/docs`·`/redoc` 의 CDN·인라인 스크립트를 막으므로 백엔드에서 붙이지 않고 프론트엔드(정적 호스팅/BFF) 쪽 책임으로 둔다.

- `/api/v1/auth/*` 응답은 성공·오류(401/422/429)·쿠키 삭제 응답을 가리지 않고 `Cache-Control: no-store` 다.
- 로그인 잠금 429 는 `Retry-After`(남은 잠금 초, 올림·최소 1)를 싣는다. 미존재 계정도 같은 스로틀 행을 거쳐 같은 헤더를 받으므로 계정 존재가 드러나지 않는다.
- CORS 는 `CORS_ORIGINS` 의 출처만 허용하고 `allow_credentials=True`(cookie 모드 refresh 쿠키 전송)를 유지하되, 메서드는 `GET·POST·PUT·PATCH·DELETE·OPTIONS`, 요청 헤더는 `Authorization·Content-Type` 만 명시 허용하며 `Retry-After` 를 expose 한다. 새 커스텀 요청 헤더가 필요하면 `app/main.py` 의 `CORS_ALLOW_HEADERS` 에 추가한다.

---

## 10. 날짜·시간 (KST)  — MUST

- **기준**: 저장·표시되는 업무 일자는 **KST**로 통일. 애플리케이션에 UTC↔KST 변환 레이어를 두지 않는다.
- **PostgreSQL**: 엔진 `connect_args`에 `options="-c timezone=Asia/Seoul"`.
- **FastAPI**: `app.core.security.now()`는 **naive `datetime.now()`만** 사용.
- **Unix 실행 환경**: API 프로세스에 **`TZ=Asia/Seoul`**을 설정하고 애플리케이션이 `tzset()`으로 적용한다.
- **Windows 실행 환경**: Windows CRT는 IANA `TZ=Asia/Seoul`을 프로세스 시각대에 적용하지 못하므로 **OS 시각대를 `서울`(UTC+9)로 설정**해야 한다. OS 오프셋이 KST와 다르면 애플리케이션이 경고한다.
- **금지(신규 코드)**: `datetime.now(timezone.utc)`, `ZoneInfo` 기반 변환 추가.

---

## 11. 마이그레이션 (Alembic)  — MUST: DB는 항상 Alembic으로 관리

> **모든 DB 스키마는 예외 없이 Alembic 마이그레이션으로만 생성·변경한다.**
> 개발·스테이징·운영 어느 환경에서도 동일하다. 스키마의 단일 진실 공급원(SSOT)은 마이그레이션 히스토리다.

- `alembic/env.py`에서 `app.config.get_settings()`의 DB URL과 `Base.metadata`를 사용한다.
- `import app.models`로 모든 모델을 로드한 뒤 `target_metadata = Base.metadata`.
- `compare_type=True`, PostgreSQL은 `NullPool` 권장. offline/online 모두 지원.
- 모델 변경 시 워크플로:
  ```powershell
  alembic revision --autogenerate -m "<변경 요약>"   # 초안 생성
  # 생성된 versions/*.py 를 반드시 검토·수정 (autogenerate는 초안일 뿐)
  alembic upgrade head                               # 적용
  ```
- 모든 마이그레이션은 **`downgrade()`를 작성**하고, 가능하면 되돌릴 수 있게 한다.
- 마이그레이션 파일은 **반드시 커밋**한다. 머지 시 head가 갈라지면 `alembic merge`로 정리.

### 금지 (MUST NOT)
- **런타임 `Base.metadata.create_all()`로 운영/개발 스키마를 만드는 행위** — 단, **테스트(SQLite in-memory)에서만 예외 허용**(§12).
- `DATABASE_AUTO_DDL` 같은 **자동 DDL 플래그를 dev/prod에서 켜는 것**.
- DB 콘솔에서 직접 `ALTER TABLE` 등 **마이그레이션을 거치지 않은 수동 스키마 변경**.

---

## 12. 백엔드 테스트 (pytest)

- `pytest.ini`: `pythonpath = .`, `testpaths = tests`.
- DB는 **SQLite in-memory**, 테스트마다 `Base.metadata.create_all/drop_all`.
- `conftest.py`에 공통 픽스처:
  - `_clear_settings_cache` (autouse): `get_settings.cache_clear()`.
  - `db_session_factory`: 테스트 엔진에 바인딩된 세션 팩토리.
  - `db_session`: 테스트별 DB 세션.
  - `client`: `app.dependency_overrides[get_db]`를 적용한 기본 API 클라이언트.
  - `lifespan_client`: 기동·종료 훅과 기본 관리자 시드·경고를 검증하는 클라이언트.
- skeleton 의 인증 회귀는 `tests/test_auth.py`(로그인·`/auth/me`)와 **`tests/test_auth_sessions.py`**(refresh 회전·재사용 감지 시 세션 폐기·동시 갱신 60초 유예·절대 수명 비연장·로그아웃 멱등·즉시 무효화·로그인 스로틀·비밀번호 정책)가 고정한다(§9).
- 업로드·정화·공지·배너·관리자 회귀는 `tests/test_sanitize.py`(정화 허용 목록 표, §8)·`test_storage.py`(재인코딩·축소·EXIF 제거·GIF 원본 유지·허용 목록·경로 탈출)·`test_uploads_serving.py`(public 정적 서빙, private 미노출)·`test_notices.py`·`test_banners.py`·`test_admin.py` 가 고정한다. autouse 픽스처 `upload_dir` 이 `UPLOAD_DIR` 을 테스트별 `tmp_path` 로 돌려 저장소에 파일을 남기지 않고, `admin_headers`·`user_headers` 픽스처가 실제 로그인으로 Bearer 헤더를 만든다.

```python
@pytest.fixture(autouse=True)
def _clear_settings_cache():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
```

---

## 13. 프론트엔드 구조 (`frontend/`)

표준 스택: **서버 컴포넌트 fetch + Server Actions**. 쿼리 캐시 라이브러리도, 전역 클라이언트 스토어도 두지 않는다.

```
frontend/
├── .env.example                 # FASTAPI_URL (서버 전용 키, ⛔ NEXT_PUBLIC_ 금지)
├── .gitignore                   # .next/·next-env.d.ts·.env 등
├── eslint.config.mjs
├── next.config.ts
├── package.json
├── pnpm-workspace.yaml          # pnpm 11 allowBuilds (빌드 스크립트 허용 목록)
├── postcss.config.mjs           # @tailwindcss/postcss  (⛔ @tailwindcss/vite 아님)
├── tsconfig.json                # 경로 별칭 @/* → 프로젝트 루트
├── vitest.config.ts             # jsdom + @vitejs/plugin-react + @/* alias 재선언
├── vitest.setup.ts              # @testing-library/jest-dom 매처 등록
├── proxy.ts                     # ★ 인증 가드 + refresh 자동 갱신 + 공개 경로 통과 (§14)
├── public/
├── app/                         # App Router — 이 디렉토리 구조가 곧 URL
│   ├── layout.tsx               # 루트 레이아웃: html/body, globals.css import (Provider 없음)
│   ├── globals.css              # @import "tailwindcss"; + @theme 토큰(+확장 토큰 기본값) + .rich-text/.editor (§15)
│   ├── error.tsx · not-found.tsx # 렌더 오류 경계(클라) · 루트 404
│   ├── login/page.tsx           # /login   서버 컴포넌트 + LoginForm(클라)
│   ├── (site)/                  # ★ 사용자 화면 — 라우트 그룹(URL 에 안 나온다), 상단 내비 레이아웃
│   │   ├── layout.tsx           # 헤더(MainNav·AccountMenu — 사용자는 서버가 /auth/me 로)·푸터
│   │   ├── page.tsx             # /             홈 — 배너 캐러셀(없으면 히어로)·서비스·최신 공지·내 계정 (공개)
│   │   ├── notices/page.tsx     # /notices      목록(검색·페이지 = URL) (공개)
│   │   ├── notices/[id]/page.tsx # /notices/<id> 상세 — RichContent·첨부 다운로드 (공개)
│   │   ├── me/page.tsx          # /me           내 정보 + LogoutButton (로그인)
│   │   ├── my/page.tsx          # /my → /me 영구 리다이렉트(이전 경로 호환)
│   │   └── [...missing]/page.tsx · not-found.tsx  # 사용자 레이아웃 안의 404
│   └── admin/                   # ★ 관리자 콘솔 — layout.tsx 가 관리자 가드(403) + 그룹 사이드바
│       ├── page.tsx             # /admin        대시보드
│       ├── notices/…            # 목록 · new · [id]/edit · [id]/attachments/[attachmentId]/route.ts(관리자 다운로드)
│       ├── banners/…            # 목록 · new · [id]/edit
│       ├── users · sessions · login-throttles · system
│       └── [...rest]/page.tsx   # 없는 관리자 주소 → /admin
├── components/
│   ├── LoginForm.tsx · LogoutButton.tsx   # 인증 폼·버튼(클라)
│   ├── layout/                  # MainNav·AccountMenu(클라) · AdminShell(서랍)·AdminSidebar(클라) · adminNav.ts(메뉴 정의) · PageHeader · SkipLink
│   ├── admin/                   # 관리자 화면의 클라이언트 조각 — NoticeForm·AttachmentsPanel·BannerForm·BannerList·UsersTable·SessionsTable·ThrottlesTable·RefreshButton·useLeaveGuard
│   ├── ui/                      # 공용 UI — styles·Icon·Chip·QueryState·Pagination(링크)·SearchForm(GET 폼)·AutoSubmitSelect·ConfirmDialog(클라)
│   ├── editor/                  # 자체 리치 텍스트 에디터(클라) — RichTextEditor·Toolbar·MediaOverlay·ImageCropDialog·editorDom·imageCanvas
│   ├── RichContent.tsx          # 서버가 정화한 본문 HTML 보기
│   ├── BannerCarousel.tsx       # 홈 배너 캐러셀(클라, APG carousel) · HomeHero.tsx — 배너가 없을 때
│   └── NoticeListReturn.tsx     # 상세 "목록으로" 가 보던 목록(검색·페이지)으로 돌아가게(sessionStorage)
└── lib/
    ├── actions/                 # 'use server' — auth · notices · banners · admin · editor (+ result.ts: 결과 타입·id 검증, 액션 파일 아님)
    ├── server/                  # ★ server-only — fastapi.ts(fetch 래퍼) · notices·banners·admin(도메인 조회·변경) · load.ts(조회 도우미·관리자 가드)
    ├── session.ts               # 두 세션 쿠키 read/set/clear + getSessionUser·getOptionalUser (server-only)
    ├── session-cookie.ts        # 쿠키 이름·속성·maxAge 헬퍼 — ⛔ 의존성 0 (proxy·Vitest 공용, §14)
    ├── public-paths.ts          # isPublicPath — 로그인 없이 볼 수 있는 화면 허용 목록 (proxy 공용, 의존성 0)
    ├── fastapi-error.ts         # FastapiError(kind·status·detail·code·validation)·사용자 문구 — 순수 모듈
    ├── api-error.ts             # 관리자 작업 오류 → 한국어(도메인 code·413·422 배열) — 순수, 액션이 쓴다
    ├── safe-redirect.ts         # next 파라미터 검증 (오픈 리다이렉트 방지, §14)
    ├── listParams.ts            # 목록 URL 파라미터(page·q·id) 해석·링크 생성
    ├── bannerForm.ts · linkUrl.ts · uploadRules.ts · format.ts · site.ts   # 폼 검증·규칙(백엔드와 같은 값)·KST 문자열 표시
    ├── editor/                  # 에디터 순수 로직(richText·imageTransform·mediaHtml) + upload.ts(업로드 계약 타입)
    ├── types.ts                 # 백엔드 스키마와 동기화되는 타입(User·Page·Notice*·Banner*·Dashboard·AdminUser…)
    └── *.test.ts                # 순수 모듈 테스트는 대상 옆에
```

- **`app/` 은 서버 컴포넌트가 기본**이다. `'use client'` 는 이벤트 핸들러·폼 상태가 필요한 말단 컴포넌트에만 붙인다.
- `'use client'` 컴포넌트에는 **토큰·세션 원본을 props 로 내려보내지 않는다.** 필요한 최소 표시값(사용자명 등)만 넘긴다.
- 테스트는 대상 파일 옆에 `*.test.ts(x)` 로 둔다(예: `lib/safe-redirect.test.ts`). 아래 **프론트엔드 테스트** 항목 참조.

백엔드 스키마와 동기화되는 타입은 **`lib/types.ts` 한 곳**에 모은다(`User`·`TokenResponse`·`Page<T>`·`Notice*`·`Banner*`·`Dashboard`·`AdminUser` 등 — 서버·클라이언트 양쪽이 import 하므로 server-only 가 아니다). 유니온은 리터럴(`'active' | 'closed'`).

`lib/server/fastapi.ts` (★ FastAPI 로 나가는 **유일한** 출구 — 서버 전용):
```ts
import "server-only"        // ⛔ 지우지 마라 — 클라 번들로 새면 빌드가 깨져 사고를 CI 에서 잡는다

const API_PREFIX = "/api/v1"

function baseUrl(): string {
  return (process.env.FASTAPI_URL ?? "http://localhost:8000").replace(/\/+$/, "")
}

// 실패 분류(FastapiError·kindFor·fastapiErrorMessage)는 순수 로직이라 lib/fastapi-error.ts 에 있고
// 이 모듈이 re-export 한다 — server-only 모듈은 vitest 가 로드조차 못 하므로 테스트 가능한 쪽에 둔다.
/** 실패 원인 분류 — 화면이 "인증 실패"와 "백엔드 미기동"을 구분할 수 있어야 한다. */
export type FastapiFailureKind =
  | "network"        // 백엔드에 닿지 못함 (미기동·DNS·타임아웃)
  | "unauthorized"   // 401
  | "validation"     // 422
  | "throttled"      // 429 — 로그인 시도 제한 (§9)
  | "server"         // 5xx
  | "http"           // 그 밖의 4xx

export class FastapiError extends Error {
  readonly kind: FastapiFailureKind
  readonly status: number          // 네트워크 실패면 0
  readonly detail: string | null   // 서버 detail 이 **문자열일 때만** (FastAPI 422 는 객체 배열이다)
  // ...
}

interface FastapiRequest {
  path: string                     // `/auth/me` 처럼 /api/v1 이후 경로만
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"
  body?: unknown                   // JSON 직렬화할 본문
  token?: string | null            // ★ Bearer 로 주입할 JWT — 호출부가 넘긴다
}

export async function fastapiFetch<T>({ path, method = "GET", body, token }: FastapiRequest): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" }
  if (body !== undefined) headers["Content-Type"] = "application/json"
  if (token) headers.Authorization = `Bearer ${token}`

  let response: Response
  try {
    response = await fetch(`${baseUrl()}${API_PREFIX}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",   // ★ 고정 — 사용자별 응답을 Next Data Cache 에 넣으면 남의 응답이 나간다
    })
  } catch {
    throw new FastapiError("network", 0, null)   // 미기동·DNS·타임아웃
  }

  if (!response.ok) {
    throw new FastapiError(kindFor(response.status), response.status, await readDetail(response))
  }
  return (await response.json()) as T
}

/** 원인별 사용자 문구(network/unauthorized/validation/server/기타). 401 문구는 고정한다(§9). */
export function fastapiErrorMessage(error: unknown): string
```

- 위는 요약이다. 실제 래퍼는 `query`(빈 값 제외 쿼리)·`timeoutMs`(업로드처럼 긴 호출)·**`FormData` 본문(multipart — Content-Type 을 지정하지 않는다)** 을 받고, 오류 응답의 `{"detail","code"}` 를 `FastapiError.code` 로, 422 배열 detail 의 첫 메시지를 `.validation` 으로 분해한다(`parseErrorBody`). 파일을 중계할 때는 응답을 해석하지 않는 `fastapiStream()` 을 쓴다(관리자 첨부 다운로드 Route Handler).
- **토큰은 래퍼가 쿠키에서 읽지 않고 호출부가 `token` 으로 넘긴다.** `lib/session.ts` 가 이 모듈을 import 하므로 반대 방향 의존은 순환이 된다. 보호 API 호출은 `getSessionToken()` 결과를 그대로 넘긴다.
- 호출부는 `error.kind` 로 분기한다(⛔ 상태코드 하드코딩·문구 하드코딩 금지).

`lib/session-cookie.ts` (쿠키 이름·속성 — **의존성 0 인 순수 모듈**, proxy·Vitest 와 공유):

```ts
// ⛔ 이 파일에는 어떤 import 도 추가하지 마라 — proxy.ts 와 Vitest 도 이 파일을 쓴다.
//    lib/session.ts(server-only·next/headers)를 끌어오면 proxy 는 렌더 전용 API 에 묶이고
//    Vitest 에서는 로드조차 되지 않는다.

/** production 은 `__Host-` 프리픽스 — 브라우저가 secure+path=/+Domain 미지정을 강제해
 *  서브도메인의 쿠키 주입(세션 고정)을 차단한다. dev(localhost, http)는 프리픽스 없음. */
export const SESSION_COOKIE = withHostPrefix("__PROJECT_SNAKE___session", IS_PRODUCTION)  // access
export const REFRESH_COOKIE = withHostPrefix("__PROJECT_SNAKE___refresh", IS_PRODUCTION)  // refresh

/** access 쿠키 maxAge = expires_in − 60초(하한 60초) — 쿠키가 토큰보다 먼저 죽어야
 *  proxy 가 만료를 "쿠키 없음 → refresh" 로 선제 감지한다. */
export function accessCookieMaxAge(expiresInSeconds: number): number

/** 두 쿠키의 공통 속성 — httpOnly·sameSite:"lax"·path:"/"·production 만 secure.
 *  삭제도 delete() 가 아니라 이 속성으로 maxAge 0 을 덮어써야 `__Host-` 조건을 채운다. */
export function sessionCookieOptions(maxAgeSeconds: number)
```

`lib/session.ts` (두 httpOnly 쿠키 read/set/clear + 현재 사용자 — 세션의 단일 출처):

```ts
import "server-only"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { FastapiError, fastapiFetch } from "@/lib/server/fastapi"
import { REFRESH_COOKIE, SESSION_COOKIE, accessCookieMaxAge, sessionCookieOptions } from "@/lib/session-cookie"
import type { TokenResponse, User } from "@/lib/types"

// ⚠️ cookies() 는 async 다 — 반드시 await 한 store 에서 읽고 쓴다.
export async function getSessionToken(): Promise<string | null> {
  const store = await cookies()
  return store.get(SESSION_COOKIE)?.value ?? null
}

/** refresh 토큰은 불투명 문자열 — 해석하지 않고 /auth/refresh·/auth/logout 으로 전달만 한다. */
export async function getRefreshToken(): Promise<string | null> {
  const store = await cookies()
  return store.get(REFRESH_COOKIE)?.value ?? null
}

/** ⚠️ set/clear 는 Server Action·Route Handler 전용 — 서버 컴포넌트 렌더 중에는 예외가 난다.
 *  로그인·refresh 응답(TokenResponse)이 같은 형태라 두 쿠키를 항상 함께 굽는다. */
export async function setSessionTokens(tokens: TokenResponse): Promise<void> {
  const store = await cookies()
  store.set(SESSION_COOKIE, tokens.access_token, sessionCookieOptions(accessCookieMaxAge(tokens.expires_in)))
  store.set(REFRESH_COOKIE, tokens.refresh_token, sessionCookieOptions(tokens.refresh_expires_in))
}

/** 두 쿠키 모두 삭제 — delete() 가 아니라 같은 속성으로 maxAge 0 을 덮어쓴다(`__Host-` 조건). */
export async function clearSessionTokens(): Promise<void> {
  const store = await cookies()
  store.set(SESSION_COOKIE, "", sessionCookieOptions(0))
  store.set(REFRESH_COOKIE, "", sessionCookieOptions(0))
}

/**
 * 현재 세션 사용자(`GET /api/v1/auth/me`). 서버 컴포넌트는 자기 URL 을 모르므로
 * 복귀 경로를 인자로 받는다. 401 → /login?next=<현재경로>, 백엔드 장애(5xx·미기동) → null.
 */
export async function getSessionUser(currentPath: string): Promise<User | null> {
  const token = await getSessionToken()
  if (!token) redirect(`/login?next=${encodeURIComponent(currentPath)}`)

  try {
    return await fastapiFetch<User>({ path: "/auth/me", token })
  } catch (error) {
    if (error instanceof FastapiError && error.kind === "unauthorized") {
      redirect(`/login?next=${encodeURIComponent(currentPath)}`)
    }
    return null
  }
}
```

`lib/actions/auth.ts` (로그인/로그아웃 Server Action):

```ts
"use server"

import { redirect } from "next/navigation"
import { safeRedirect } from "@/lib/safe-redirect"
import { fastapiErrorMessage, fastapiFetch } from "@/lib/server/fastapi"
import { clearSessionTokens, getRefreshToken, setSessionTokens } from "@/lib/session"
import type { TokenResponse } from "@/lib/types"

// ⛔ "use server" 파일은 **async 함수만** export 할 수 있다. 폼 초기 상태 같은 상수를 여기서
//    export 하면 빌드가 깨진다 → components/LoginForm.tsx 에 둔다. (타입 export 는 허용된다.)

/** useActionState 가 주고받는 폼 상태. 성공하면 redirect 하므로 error 만 있으면 된다. */
export interface LoginState {
  error: string | null
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "")
  const password = String(formData.get("password") ?? "")
  const next = safeRedirect(formData.get("next"))   // ★ 사용자가 조작할 수 있는 값이다 (§14)

  try {
    const tokens = await fastapiFetch<TokenResponse>({
      path: "/auth/login",
      method: "POST",
      body: { username, password },
    })
    await setSessionTokens(tokens)                 // access·refresh 두 쿠키를 함께 굽는다
  } catch (error) {
    // 원인별 문구는 래퍼가 만든다(401 은 고정 문구). 429(시도 제한)도 여기로 온다 —
    // fastapiErrorMessage 가 자격증명 오류와 구분해 안내한다(§9 스로틀).
    return { error: fastapiErrorMessage(error) }
  }

  // ⚠️ redirect() 는 NEXT_REDIRECT 예외를 던져 동작한다 — try 안에서 부르면 catch 가 삼켜
  //    "로그인은 됐는데 화면이 안 넘어가는" 버그가 된다. 반드시 try/catch **밖에서** 호출한다.
  redirect(next)
}

/** 백엔드의 refresh 토큰을 폐기(revoke)한 뒤 두 쿠키를 지운다. 백엔드 호출은 **best-effort** —
 *  로그아웃의 본체는 쿠키 삭제이고, 폐기에 실패한 refresh 토큰은 만료(기본 14일)로 소멸한다. */
export async function logoutAction(): Promise<void> {
  const refreshToken = await getRefreshToken()
  if (refreshToken) {
    try {
      await fastapiFetch<void>({ path: "/auth/logout", method: "POST", body: { refresh_token: refreshToken } })
    } catch {
      // best-effort — /auth/logout 은 멱등(204·인증 불요)이라 실패해도 쿠키 삭제는 진행한다.
    }
  }
  await clearSessionTokens()
  redirect("/")   // 첫 화면은 공개다 — 로그아웃 뒤에도 홈을 그대로 볼 수 있다
}
```

`app/admin/system/page.tsx` (서버 컴포넌트에서 직접 fetch — 훅도 로딩 상태도 필요 없다):
```tsx
import { Suspense } from "react"
import { getHealth } from "@/lib/server/admin"   // server-only 도메인 모듈 → fastapiFetch

// StatusRow 는 같은 파일의 표시용 컴포넌트다(클라이언트 컴포넌트가 아니다).
// 아래 함수는 서버에서 실행된다 — 브라우저는 이 요청을 보지 못하고, 토큰도 넘어가지 않는다.
async function ApiRow() {
  let ok = false
  try {
    ok = (await getHealth()).status === "ok"   // 공개 API 라 token 없음
  } catch {
    // 백엔드 미기동·5xx 는 화면에서 "연결 안 됨" 으로만 알린다.
  }
  return <StatusRow label="백엔드 API" detail="GET /api/v1/health" state={ok ? "ok" : "error"} />
}

export default function SystemPage() {
  // 로딩 표시는 <Suspense> 로 만든다 — 껍데기부터 스트리밍되고 응답이 오면 행만 교체된다.
  return (
    <Suspense fallback={<StatusRow label="백엔드 API" detail="GET /api/v1/health" state="loading" />}>
      <ApiRow />
    </Suspense>
  )
}
```

규칙:
- **데이터 조회는 서버 컴포넌트에서** `fastapiFetch()` 로 한다. ⛔ 클라이언트 컴포넌트에서 `useEffect` + `fetch` 로 API를 부르지 않는다.
- **변경(mutation)은 Server Action 으로** 한다(`lib/actions/*.ts`). 목록 갱신이 필요하면 `revalidatePath()` 를 호출한다.
- ⛔ **브라우저에서 FastAPI 를 직접 호출하지 않고, 토큰을 클라이언트에 노출하지 않는다.** FastAPI 로 나가는 요청은 전부 `lib/server/fastapi.ts` 를 지나며 Bearer 는 그 안에서만 붙는다.
- **오류 표시는 `FastapiError.kind` 로 구분한다**(`network`/`unauthorized`/`validation`/`throttled`/`server`/`http`). ⛔ 모든 실패를 자격증명 오류 문구로 하드코딩하면 422·429·네트워크 오류·500 을 오진한다. 단 **401 문구는 고정**해 계정 존재 여부를 노출하지 않는다(백엔드도 메시지를 통일한다, §9). 429(`throttled`)는 자격증명 오류와 **구분해** 보여준다 — "비밀번호가 틀렸다"로 오진하면 사용자가 재시도를 반복해 제한이 더 길어진다. FastAPI 422 의 `detail` 은 객체 배열이므로 문자열일 때만 그대로 노출한다.
- **클래스명은 전체를 그대로 쓴다.** `` `bg-${tone}-container` `` 처럼 조립하면 Tailwind v4 소스 탐지가 못 찾아 CSS 가 생성되지 않는다(§15).

### 보안 응답 헤더 (`next.config.ts`)

전 경로 공통 보안 헤더를 `next.config.ts` 의 `headers()` 에서 내보낸다. CSP 는 Next 런타임 요구를 감안한 **현실적 기본값**이다 — Next 가 하이드레이션 데이터를 인라인 `<script>` 로 심으므로 `script-src 'unsafe-inline'` 을 허용하고(nonce 로 조이려면 요청별 proxy CSP 생성으로 전환해야 한다), `'unsafe-eval'` 은 **dev 전용**(HMR)이다. 브라우저는 FastAPI 를 직접 부르지 않는 구조라 `connect-src 'self'` 로 충분하다.

| 헤더 | 값 | 이유 |
|------|-----|------|
| `Content-Security-Policy` | `default-src 'self'; img-src 'self' data: blob: https://img.youtube.com; connect-src 'self'; frame-src https://www.youtube-nocookie.com https://www.youtube.com; …; object-src 'none'; frame-ancestors 'none'` 등 | XSS·클릭재킹의 기본 방어선. 본문 유튜브 임베드는 **정확한 두 호스트만** 연다(와일드카드 금지 — 백엔드 정화기도 같은 두 호스트의 `/embed/<id>` 만 남긴다). 에디터의 업로드 전 미리보기는 `blob:`, 자르기·변환은 canvas(CSP 대상 아님), "다시 자르기" 의 이미지 fetch 는 같은 오리진 `/uploads` 라 `connect-src 'self'` 로 충분하다 |
| `X-Frame-Options` | `DENY` | `frame-ancestors` 를 모르는 구형 브라우저 백업 |
| `X-Content-Type-Options` | `nosniff` | 업로드 파일이 HTML 로 스니핑되어 실행되는 XSS 차단 |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | `/login?next=…` 같은 내부 경로·쿼리가 Referer 로 새는 것 방지 |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | XSS 가 성공해도 고권한 브라우저 API 접근 차단 |
| `Strict-Transport-Security` | production 만 `max-age=31536000; includeSubDomains` | ⚠️ localhost 에 붙으면 브라우저가 도메인 단위로 기억해 http 개발 환경이 잠긴다 — dev 에서는 내보내지 않는다 |

### 업로드 파일 · rewrite · Server Action 본문 상한 (`next.config.ts`)

백엔드는 공개 파일을 `/uploads/public/...` 로, 게시된 공지의 첨부를 `/api/v1/notices/<id>/attachments/<aid>` 로 내보내고, API 응답의 URL 은 **루트 상대**다(`PUBLIC_FILES_BASE_URL` 비움, §8). Next 는 이 두 갈래만 **같은 오리진에서 백엔드로 rewrite** 한다 — 브라우저는 여전히 백엔드 주소를 모른다.

```ts
async rewrites() {
  return {
    beforeFiles: [   // ★ beforeFiles — 사용자 화면의 404 catch-all((site)/[...missing])보다 먼저 적용돼야 한다
      { source: "/uploads/:path*", destination: `${fastapiUrl}/uploads/:path*` },
      { source: "/api/v1/notices/:id(\\d+)/attachments/:aid(\\d+)", destination: `${fastapiUrl}/api/v1/notices/:id/attachments/:aid` },
    ],
    afterFiles: [],
    fallback: [],
  }
}
```

- ⚠️ `rewrites()`·`headers()` 는 **빌드 시점**에 평가되어 `.next/routes-manifest.json` 에 박힌다. `frontend/.env` 는 `next build` 때도 읽히므로 보통은 문제없지만, 한 번 빌드한 산출물을 여러 환경에 배포한다면 `FASTAPI_URL` 을 빌드 환경에도 넣고, 바꾸면 다시 빌드한다.
- `proxy.ts` matcher 는 `uploads/`·`api/v1/notices/` 를 제외한다(세션과 무관한 파일이라 refresh 왕복을 태우지 않는다). 임시저장 공지의 첨부·`private/` 파일은 백엔드가 404 로 막는다.
- **관리자 첨부 다운로드**(임시저장 포함)는 Bearer 가 필요해 rewrite 로 넘길 수 없다 → Route Handler `app/admin/notices/[id]/attachments/[attachmentId]/route.ts` 가 세션 쿠키의 access 토큰으로 `GET /admin/notices/{id}/attachments/{aid}` 를 부르고 본문을 **스트리밍**으로 넘긴다(`Content-Type`·`Content-Disposition` 그대로, `no-store`·`nosniff`). 이 템플릿의 유일한 Route Handler 다(스킬의 "`app/api/**` 남발 금지" 원칙의 근거 있는 예외 — 쿠키 세션을 Bearer 로 바꿔 파일을 중계하는 일은 Server Action 이 못 한다).
- **업로드는 전부 Server Action** 이다 — 에디터 이미지(`uploadEditorImageAction` → `POST /admin/editor/images`, 에디터의 `uploadImage` prop), 배너 이미지(`uploadBannerImageAction`), 공지 첨부(`uploadAttachmentAction`, 파일마다 순서대로). 클라이언트가 `FormData{file}` 로 액션을 부르면 액션이 같은 형태의 multipart 로 백엔드에 보낸다. 본문 상한은 `experimental.serverActions.bodySizeLimit = "25mb"`(첨부 20MB + 여유)이고, proxy 의 본문 복제 상한 `experimental.proxyClientMaxBodySize`(기본 10MB)도 같은 값이다 — 작으면 `/admin/**` 에서 올린 큰 파일이 proxy 단계에서 잘린다. 백엔드 `MAX_ATTACHMENT_UPLOAD_MB` 를 올리면 함께 올린다. ⚠️ Server Action 은 업로드 진행률을 주지 않는다(파일별 "올리는 중" 상태만).

### 프론트엔드 테스트 (vitest)

러너는 **Vitest `5.0`**, 실행은 `pnpm test`(watch 는 `pnpm test:watch`). 설정은 `vitest.config.ts` 에 둔다 — `@vitejs/plugin-react` + `environment: "jsdom"` + `setupFiles: "./vitest.setup.ts"`(jest-dom 매처), 대상은 `{app,components,lib}/**/*.test.{ts,tsx}`. **경로 별칭 `@/*` 는 Vitest 가 tsconfig 에서 읽어오지 않으므로 `resolve.alias` 에 다시 적는다.**

`tsc --noEmit` 과 `eslint` 는 **런타임 동작을 잡지 못한다.** 인증의 핵심 회귀는 아래 1~4번이고, 사용자 화면·관리자 콘솔·에디터의 회귀가 5~7번이다:

1. **`lib/safe-redirect.test.ts`** — `https://evil.example`·`//evil.example`·`/\evil`·`javascript:`·백슬래시·공백/제어문자·상대경로·비문자열은 모두 `/` 로 떨어지고, `/my?tab=profile&sort=desc` 같은 내부 경로는 **query·hash 까지 보존**된다. `/login` 자신으로는 되돌리지 않는다(로그인 루프 방지). (§14 오픈 리다이렉트)
2. **`components/LoginForm.test.tsx`** — 폼이 `username`·`password`·`next` 를 **FormData 로 Server Action 에 넘기고**, Action 이 돌려준 오류 문구를 `role="alert"` 로 보여주며, 제출 중에는 버튼이 잠긴다. Server Action 자체는 `vi.mock` 으로 대체한다 — `lib/actions/auth` 는 `server-only` 를 끌고 와 러너에서 **로드조차 되지 않는다**.
3. **`lib/session-cookie.test.ts`** — `__Host-` 프리픽스 적용 조건과 access 쿠키 maxAge 계산(`expires_in − 60초`, 하한 60초), 두 쿠키 공통 속성. (§14 세션 쿠키 속성)
4. **`lib/fastapi-error.test.ts`** — 상태코드→`kind` 분류(429 는 `throttled`)와 원인별 사용자 문구. `lib/server/fastapi.ts` 는 `server-only` 라 러너가 로드하지 못하므로 순수 로직을 `lib/fastapi-error.ts` 로 분리해 고정한다.

5. **에디터** — 순수 로직 `lib/editor/{richText,imageTransform,mediaHtml}.test.ts`(붙여넣기 정리·빈 본문 판정·크기 계산·자르기 영역·유튜브 ID·직렬화)와 컴포넌트 `components/editor/RichTextEditor.test.tsx`(jsdom 에 없는 `execCommand`·canvas 는 테스트 안에서 흉내 낸다), `components/RichContent.test.tsx`.
6. **클라이언트 조각** — `components/admin/NoticeForm.test.tsx`(화면 검증 → 액션 미호출, FormData(`body_html`·체크박스 `on`), 저장 결과·변경 표시, 이탈 확인 다이얼로그, `leavingHref`), `AttachmentsPanel.test.tsx`(사전 검사·순차 업로드·관리자 다운로드 링크·삭제 확인), `BannerForm.test.tsx`, `UsersTable.test.tsx`(확인 후 액션 인자·거부 문구, 잠금 해제), `components/layout/AdminSidebar.test.tsx`(현재 메뉴 `aria-current`·잠김 배지·활성 경로 판정), `components/BannerCarousel.test.tsx`. Server Action 모듈은 `vi.mock` 으로 끊고 `next/navigation` 은 필요한 훅만 mock 한다.
7. **순수 규칙** — `lib/api-error.test.ts`(도메인 code·413·422 배열·네트워크), `lib/listParams.test.ts`, `lib/public-paths.test.ts`(공개 경로 허용 목록이 넓어지지 않게), `lib/bannerForm.test.ts`.

> **1·2번은 짝이다.** proxy 가 `next` 에 담는 값은 pathname+search 이고, 폼은 그 값을 hidden 필드로 실어 보내며, `safeRedirect()` 가 그것을 그대로 되살린다. 한쪽만 검증하면 **복귀할 때 query 를 버리는데도 테스트는 통과한다.**

⛔ **서버 컴포넌트·Server Action·`proxy.ts` 는 여기서 테스트하지 않는다.** jsdom 에는 RSC 런타임도 요청 컨텍스트(`cookies()`/`redirect()`)도 없다. 흉내 낸 목으로 통과시키면 "테스트는 초록인데 실제로는 깨지는" 가짜 안전망이 된다 — 검증 로직은 `lib/` 의 순수 함수로 뽑아 그것을 테스트하고, 통합 확인은 `pnpm build` + 수동 동작 확인으로 대신한다.

---

## 14. 프론트엔드 인증 흐름

전체 흐름 — **브라우저는 쿠키만 들고 다니고, 토큰은 서버 밖으로 나가지 않는다.**

```
브라우저 ──(httpOnly 쿠키 2개: access + refresh)──▶ Next(proxy / 서버 컴포넌트 / Server Action) ──(Bearer access JWT)──▶ FastAPI
```

- **인증 가드는 `proxy.ts`**(Next 16 에서 `middleware` 파일 규약이 `proxy` 로 이름이 바뀌었다 — export 함수도 `proxy`, **Node.js 런타임** 고정이며 `runtime` 설정은 허용되지 않는다): matcher 가 제외하지 않은 모든 요청에서,
  0. **공개 화면**(`lib/public-paths.ts` 의 `isPublicPath` — `/`·`/notices`·`/notices/<id>`)은 **로그인 없이 통과**한다. 그래도 matcher 에서 빼지 않는다 — access 쿠키가 만료되고 refresh 쿠키만 남은 사용자가 공개 화면에 오면 아래 2번처럼 세션을 이어 줘야 헤더가 "로그인" 으로 잘못 보이지 않는다. 공개 화면에서는 갱신에 실패해도 리다이렉트하지 않는다(401 이면 쿠키만 파기). 공개 목록은 **허용 목록**이라 새 화면은 기본이 보호다.
  1. **access 쿠키가 있으면 존재만 보고 통과한다** — 서명 검증도, 만료 확인도 하지 않는다(요청마다 도는 코드이고, `SECRET_KEY` 는 백엔드 것이다).
  2. **access 쿠키가 없고 refresh 쿠키만 있으면** 백엔드 `POST /api/v1/auth/refresh` 를 직접 호출한다(**자동 세션 갱신**, 타임아웃 5초). 성공하면 회전된 새 쌍으로 두 쿠키를 갈아끼우고 원래 요청을 그대로 통과시킨다 — 사용자는 재로그인 없이 세션이 이어진다. **401 이면** 회복 불가능한 refresh 이므로 두 쿠키를 파기하고 `/login?next=` 로 보낸다. **네트워크 오류·5xx 는** 토큰 판정이 아니라 백엔드 문제다 — 쿠키는 보존하고 리다이렉트만 한다(복구 후 다시 오면 여기서 갱신된다).
  3. 둘 다 없으면 `/login?next=<원래경로>` 로 리다이렉트한다. `next` 에는 **pathname + search** 를 담는다(복귀 시 query 를 잃지 않게 §13 테스트).
- **access 쿠키 maxAge 는 `expires_in − 60초`** (`accessCookieMaxAge`) — 쿠키가 토큰보다 먼저 죽어야 proxy 가 만료를 "쿠키 없음 → refresh" 로 **선제** 감지한다. refresh 는 access 만료 주기(기본 15분)에 한 번꼴이라 "요청마다 백엔드에 묻는" 비용 문제가 없다.
- **로그인은 Server Action**: 폼 제출 → `POST /api/v1/auth/login`(JSON `{username, password}`) → 응답의 access·refresh 를 **httpOnly 쿠키 2개로 설정**(`setSessionTokens`) → `redirect(safeRedirect(next))` 로 원래 위치(없으면 `/`) 복귀. 429(시도 제한)는 자격증명 오류와 구분된 문구로 보여준다.
- **사용자 정보는 이동한 화면의 서버 컴포넌트가 `getSessionUser("<현재경로>")`(→ `GET /api/v1/auth/me`)로 직접 읽는다.** 서버 컴포넌트는 자기 URL 을 모르므로 복귀 경로를 인자로 넘긴다. 로그인 액션에서 미리 불러 클라이언트로 넘기지 않는다 — 중복 요청이 되고, 실패 시 리다이렉트까지 건너뛰어진다.
- **로그아웃도 Server Action**: 백엔드 `POST /auth/logout` 으로 refresh 토큰을 **폐기(revoke)** 한 뒤 두 쿠키를 지우고 홈(`/`, 공개)으로 리다이렉트한다. 백엔드 호출은 **best-effort** 다 — 로그아웃의 본체는 쿠키 삭제이고, `/auth/logout` 은 멱등(204·인증 불요)이라 실패·재시도 모두 안전하다. 폐기된 세션의 access 토큰은 sid 검사로 **즉시 401** 이 된다(§9).
- **401 처리**: proxy 는 만료를 모르므로 **통과했는데 FastAPI 가 401 을 주는 구간이 반드시 생긴다**(자동 refresh 가 대부분 걸러 주지만 `SECRET_KEY` 교체·계정 비활성화·세션 폐기는 남는다). 그때 `getSessionUser()` 가 `FastapiError.kind === "unauthorized"` 를 보고 `/login?next=<현재경로>` 로 보낸다 — 만료 세션 처리는 이 함수 한 곳이 담당한다. 그 밖의 실패(백엔드 미기동·5xx)는 세션 문제가 아니므로 리다이렉트하지 않고 `null` 을 돌려준다 — 화면이 "로그인 만료"와 "백엔드 다운"을 구분해 보여줄 수 있어야 한다.
- **SSO 도입 시 확장**: 로그인 페이지에서 백엔드 authorize URL 로 보내고, 콜백을 받을 라우트(`app/auth/callback/`)에서 토큰을 **쿠키로 옮긴 뒤** 리다이렉트한다. 토큰을 클라이언트 코드가 만지지 않는 원칙은 그대로다(§9).

### 세션 쿠키 속성 (MUST)

쿠키는 **두 개**이고, 이름·속성은 `lib/session-cookie.ts` **한 곳**에서만 만든다 — `lib/session.ts`(Server Action)와 `proxy.ts`(요청 단계)가 다른 속성으로 구우면 같은 이름·다른 속성의 쿠키가 공존해 "로그아웃했는데 세션이 남는" 상태가 된다.

| 속성 | 값 | 이유 |
|------|-----|------|
| 이름 | access `<project>_session` + refresh `<project>_refresh`. **production 은 `__Host-` 프리픽스** | 다른 앱과 충돌 방지. `__Host-` 는 브라우저가 secure+`path=/`+Domain 미지정을 강제해 서브도메인의 쿠키 주입(세션 고정)을 **브라우저 단에서** 차단한다. dev(localhost, http)는 secure 쿠키가 저장되지 않아 프리픽스를 뗀다 |
| `httpOnly` | `true` | **JS 로 읽을 수 없다** — XSS 1건으로 토큰이 유출되는 `localStorage` 방식의 약점을 제거 |
| `sameSite` | `lax` | 외부 링크 진입은 허용하면서 크로스사이트 POST 를 막아 CSRF 완화 |
| `secure` | 운영 `true` (`NODE_ENV === "production"`) | 평문 HTTP 전송 차단 + `__Host-` 프리픽스의 강제 조건. ⚠️ localhost(http)에서 켜면 **쿠키가 저장되지 않아 로그인이 무한 루프**가 된다 — dev 에서는 반드시 `false` |
| `path` | `/` | 모든 경로에서 세션 인식 (`__Host-` 강제 조건이기도 하다) |
| 만료 | access: `maxAge` = `expires_in − 60초`(하한 60초), refresh: `maxAge` = `refresh_expires_in` | 백엔드 `TokenResponse` 의 값으로 **자동 동기화**된다 — `ACCESS_TOKEN_EXPIRE_MINUTES` 를 바꿔도 프론트 수정이 필요 없다. access 쿠키가 토큰보다 60초 먼저 죽어야 proxy 가 만료를 선제 감지한다(위 참조) |
| 삭제 | `delete()` 가 아니라 **같은 속성으로 `maxAge: 0` 덮어쓰기** | production 의 `__Host-` 쿠키는 삭제용 Set-Cookie 도 프리픽스 조건(secure·`path=/`)을 채워야 브라우저가 받아들인다 — 속성이 다르면 삭제가 조용히 무시된다 |

### ⚠️ 오픈 리다이렉트 방지 (MUST)

`next` 파라미터는 **공격자가 URL 로 넣을 수 있는 값**이다. 검증 없이 `redirect(next)` 하면 우리 도메인의 정상 로그인 페이지가 외부 피싱 사이트로 튕겨 주는 발판이 된다 — 사용자는 신뢰하는 도메인에서 로그인을 마쳤으므로 이동한 곳도 신뢰한다. **반드시 내부 경로만 허용한다.**

- `/` **하나로 시작**해야 한다 — 이 조건 하나로 `https://evil.example`·`javascript:alert(1)` 같은 스킴 포함 값이 전부 걸러진다.
- `//host` (프로토콜 상대 URL)와 `/\host` 는 **거부**한다 — 브라우저는 이를 외부 절대 URL 로 해석한다.
- 백슬래시·공백·제어문자가 섞인 값은 **거부**한다 — `\` 를 `/` 로 정규화하는 브라우저가 있고, 개행은 Location 헤더 주입이 된다.
- `/login` 자신으로는 되돌리지 않는다 — 로그인 성공 후 다시 로그인 화면으로 가는 루프를 막는다.
- 검증에 실패하면 조용히 `/`(`DEFAULT_REDIRECT`)로 되돌린다.
- 이 규칙은 **문서가 아니라 `lib/safe-redirect.test.ts` 로 고정**한다(§13 테스트 1번).

```ts
// lib/safe-redirect.ts
export const DEFAULT_REDIRECT = "/"

// hasControlChar(): 제어문자(개행·탭 포함) 검사 — 정규식에 제어문자를 직접 쓰지 않고
// charCodeAt 로 `< 0x20 || === 0x7f` 를 본다(소스에 보이지 않는 바이트를 남기지 않기 위해).

export function safeRedirect(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_REDIRECT     // searchParams 는 배열, FormData 는 File 도 준다
  const path = value.trim()

  if (path === "" || path[0] !== "/") return DEFAULT_REDIRECT
  if (path[1] === "/" || path[1] === "\\") return DEFAULT_REDIRECT   // //evil · /\evil
  if (path.includes("\\") || /\s/.test(path) || hasControlChar(path)) return DEFAULT_REDIRECT
  if (path === "/login" || path.startsWith("/login?") || path.startsWith("/login#")) {
    return DEFAULT_REDIRECT
  }
  return path                                                 // query·hash 는 그대로 보존한다
}
```

```ts
// proxy.ts — 인증 가드 + 자동 세션 갱신 (요약. 전체는 frontend/proxy.ts)
import { NextResponse, type NextRequest } from "next/server"
// ⛔ lib/session 이 아니다 — 그쪽은 렌더·Server Action 용 API(cookies()·redirect())다. proxy 는 NextRequest/NextResponse 로 다룬다.
import { REFRESH_COOKIE, SESSION_COOKIE, accessCookieMaxAge, sessionCookieOptions } from "@/lib/session-cookie"

export async function proxy(request: NextRequest) {
  // access 쿠키가 있으면 존재만 보고 통과 — 서명·만료 검증은 FastAPI 몫이다.
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next()

  const isPublic = isPublicPath(request.nextUrl.pathname)   // / · /notices · /notices/<id> — lib/public-paths.ts
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value
  if (!refreshToken) return isPublic ? NextResponse.next() : redirectToLogin(request)   // /login?next=<pathname+search>

  // access 는 죽고 refresh 만 남은 상태 — 백엔드에 회전(rotation)을 요청해 세션을 잇는다.
  // fetch(`${FASTAPI_URL}/api/v1/auth/refresh`, { …, signal: AbortSignal.timeout(5_000) })
  //   - 네트워크 오류·타임아웃·5xx → 백엔드 문제. 쿠키는 보존하고 (보호 화면만) 로그인 화면으로 보낸다.
  //   - 401 → 회복 불가(만료·폐기·재사용 감지). 두 쿠키를 maxAge 0 으로 파기하고 (보호 화면만) 리다이렉트.
  //   - 성공 → 회전된 새 쌍으로 두 쿠키 교체 후 NextResponse.next() 로 원래 요청 통과.
  //     (next() 의 응답 쿠키는 같은 요청의 cookies() 에도 반영되어(13.0.1+)
  //      이어지는 서버 컴포넌트가 새 access 토큰을 바로 읽는다)
}

export const config = {
  // ⚠️ /login·정적 자산을 빼지 않으면 무한 리다이렉트다(/login 요청 → 쿠키 없음 → /login → …).
  //    login = 로그인 화면 자신, _next/static|image = 빌드 산출물·이미지 최적화,
  //    uploads/·api/v1/notices/ = 백엔드로 rewrite 되는 공개 파일·첨부(§13),
  //    `.*\.` = favicon.ico 처럼 확장자가 있는 public 정적 파일.
  //    공개 **화면**은 빼지 않는다 — 위 isPublicPath 가 통과시키면서 만료 세션을 이어 준다.
  matcher: ["/((?!login(?:/|$)|_next/|uploads/|api/v1/notices/|.*\\.(?:ico|png|jpg|jpeg|gif|svg|webp|avif|css|js|map|txt|xml|json|webmanifest|woff2?)$).*)"],
}
```

```tsx
// app/login/page.tsx — 서버 컴포넌트 껍데기 (폼만 클라이언트다)
import { redirect } from "next/navigation"
import LoginForm from "@/components/LoginForm"
import { safeRedirect } from "@/lib/safe-redirect"
import { hasValidSession } from "@/lib/session"

// ⚠️ searchParams 는 Promise 다. await 없이 프로퍼티를 읽으면 **조용히 undefined** 가 되어
//    복귀 경로가 늘 "/" 로 떨어진다(에러도 나지 않는다).
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const raw = params.next
  const next = safeRedirect(Array.isArray(raw) ? raw[0] : raw)   // ?next=/a&next=/b 는 배열로 온다
  // ⛔ 쿠키 존재가 아니라 **유효성**(hasValidSession → /auth/me)으로 판단한다 — 쿠키만 살아 있고
  //    토큰이 무효인 구간에서 존재만 보면 /login ↔ 보호경로 무한 리다이렉트로 사이트 전체가 잠긴다.
  if (await hasValidSession()) redirect(next)                    // 이미 로그인했으면 목적지로
  return <LoginForm next={next} />
}
```

```tsx
// components/LoginForm.tsx — 'use client' 는 폼 상태 때문에만 필요하다
"use client"

import { useActionState } from "react"
import { loginAction, type LoginState } from "@/lib/actions/auth"

// ⛔ 이 상수를 lib/actions/auth.ts 에 두지 마라 — "use server" 파일은 async 함수만 export 할 수 있다.
const INITIAL_STATE: LoginState = { error: null }

export default function LoginForm({ next }: { next: string }) {
  // useActionState 는 [상태, action, 대기중] **3튜플**이다.
  const [state, formAction, isPending] = useActionState(loginAction, INITIAL_STATE)

  return (
    <form action={formAction}>
      {/* hidden 필드는 브라우저에서 바꿀 수 있다 — Action 쪽에서 safeRedirect 로 한 번 더 검증한다. */}
      <input type="hidden" name="next" value={next} />
      <input id="username" name="username" autoComplete="username" autoFocus />
      <input id="password" name="password" type="password" autoComplete="current-password" />
      {state.error && <p role="alert" className="text-on-error-container">{state.error}</p>}
      <button type="submit" disabled={isPending}>{isPending ? "로그인 중…" : "로그인"}</button>
    </form>
  )
}
```

입력값을 `useState` 로 붙들지 않는다(비제어 입력 + `name`). 브라우저가 `FormData` 를 그대로 Server Action 에 보내므로 JS 가 아직 로드되지 않아도 폼이 제출된다. 로그아웃은 폼이 없으므로 `LogoutButton` 이 `useTransition()` 으로 `startTransition(logoutAction)` 을 부른다.

### 화면 구성 · 레이아웃 · 관리자 가드

라우트는 `app/` 디렉터리가 곧 URL 이다. 사용자 화면은 라우트 그룹 `app/(site)/`(상단 내비 레이아웃), 관리자 콘솔은 `app/admin/`(그룹 사이드바 레이아웃)이고, 로그인은 둘 다의 바깥(`app/login/`)이다.

| 경로 | 화면 | 접근 |
|------|------|------|
| `/` | 홈 — 배너 캐러셀(`GET /banners`, 없으면 기본 히어로) · 주요 서비스(자리표시) · 최신 공지 5건 · 내 계정 | 공개 |
| `/notices` · `/notices/<id>` | 공지 목록(고정 우선·제목 검색·페이지, `page`·`q` 는 URL) · 상세(본문 `RichContent`, 첨부 `download_url`) | 공개 |
| `/login` | 로그인 — 성공 시 `?next=` 로 복귀 | 공개 |
| `/me` (`/my` → 영구 리다이렉트) | 내 정보 · 로그아웃 | 로그인 |
| `/admin` | 대시보드 — KPI(사용자·세션·잠금·공지·배너·DB/Alembic) · 최근 활성 세션 5건(강제 종료) · 잠긴 계정(잠금 해제) | admin |
| `/admin/notices` · `/new` · `/<id>/edit` | 공지 목록(임시저장 포함) · 작성/수정(`RichTextEditor` + 첨부 패널 — 첫 저장 뒤 수정 화면으로 이동) | admin |
| `/admin/banners` · `/new` · `/<id>/edit` | 배너 목록(활성 토글 = PUT 전체 본문, 위/아래 이동 = `PATCH /order`) · 작성/수정(이미지 업로드·미리보기, 대체 텍스트 필수) | admin |
| `/admin/users` · `/admin/sessions` · `/admin/login-throttles` | 사용자(검색·역할 필터·권한/활성 변경·세션 모두 종료) · 세션(`?user_id=` 필터·강제 종료) · 로그인 잠금(해제) | admin |
| `/admin/system` | 헬스 체크(`/health`, `/health/db`) + DB 상태·Alembic 리비전 (이전 템플릿의 `/landing` 을 옮겼다) | admin |

- **사용자 레이아웃** `app/(site)/layout.tsx`(디자인 A — 상단 내비 포털): 로고·홈·공지사항·자리표시 메뉴(`MainNav` — 현재 메뉴 판정만 클라이언트 `usePathname`), 오른쪽은 비로그인 "로그인" / 로그인 계정 메뉴(`AccountMenu` — 내 정보·로그아웃) + **role=admin 에게만** "관리자 콘솔". 사용자는 레이아웃(서버)이 `getOptionalUser()`(→ `/auth/me`, React `cache()` 로 요청당 한 번, 리다이렉트하지 않음)로 읽어 **표시값만** props 로 내려준다.
- **관리자 레이아웃** `app/admin/layout.tsx`(디자인 A — 그룹형 사이드바): 메뉴 정의는 `components/layout/adminNav.ts`(개요·콘텐츠·회원·보안·시스템). 현재 메뉴는 `aria-current="page"` + 강조, "로그인 잠금" 에 잠긴 계정 수 배지(레이아웃이 대시보드 집계로 읽는다), 하단 "사용자 화면으로"·현재 사용자. 1024px 미만은 상단 "메뉴" 버튼이 서랍으로 연다(`AdminShell` — 클라이언트인 이유는 서랍 상태뿐이고 본문은 서버 컴포넌트 그대로다).
- **관리자 가드**는 세 겹이다. ① `proxy.ts` — 비로그인은 요청 단계에서 `/login?next=<원래 경로>`. ② `app/admin/layout.tsx` 의 `checkAdmin()`(`lib/server/load.ts`) — 무효 토큰은 `/login?next=/admin`, **role≠admin 이면 403 화면**(콘솔 틀을 그리지 않는다), 백엔드 장애는 오류 화면. ③ **권한 경계는 백엔드** `require_admin`(비로그인 401, 일반 사용자 403) — 레이아웃은 클라이언트 이동 때 다시 렌더되지 않을 수 있으므로, 각 화면의 조회는 `loadForPage()` 로 401 → 로그인, 그 밖의 실패(403 포함) → 문구로 처리한다.
- **서버 상태 규칙**: 조회는 서버 컴포넌트(`lib/server/<domain>.ts`, 목록 상태는 URL `searchParams`), 변경은 Server Action(`lib/actions/<domain>.ts`) 후 `revalidatePath`(공지·배너는 공개 화면·대시보드와 엮여 `"/"` 레이아웃 전체, 사용자·세션·잠금은 `"/admin"` 레이아웃) — 액션 응답에 현재 화면의 새 데이터가 실려 와 목록이 갱신된다. 클라이언트 쿼리 캐시는 없다. 배너 활성 토글·순서만 `useOptimistic` 으로 먼저 반영한다. 파괴적 작업(삭제·강제 종료·비활성화·권한 변경)은 `ConfirmDialog` 로 확인한다. "새로고침" 은 `router.refresh()`.
- **폼**: 공지·배너 저장은 `<form action={formAction}>` + `useActionState`. 화면 검증은 `onSubmit` 에서 하고 실패하면 `preventDefault` 로 액션을 부르지 않는다(액션도 같은 규칙으로 다시 검증 — `lib/bannerForm.ts` 공용). 처음 저장한 공지는 액션이 `redirect("/admin/notices/<id>/edit?created=1")` 해 첨부 패널을 연다. 에디터 본문은 hidden `body_html` 로 함께 간다.
- **에디터**는 브라우저 전용이다(`contentEditable`·Selection·`<template>` 파싱) — `NoticeForm` 이 `next/dynamic(..., { ssr: false })` 로 불러 서버 렌더에서 제외하고, 에디터 코드는 별도 청크가 된다. 이미지 업로드는 `uploadImage` prop 으로 받은 함수만 부르며, 그 실체는 Server Action `uploadEditorImageAction`(→ `POST /admin/editor/images`)이다. 에디터 계약대로 reject 하지 않고 실패는 `{ error }` 문구다.
- **저장하지 않은 변경 이탈 확인**: App Router 에는 `useBlocker` 같은 내비게이션 차단 API 가 없다. `components/admin/useLeaveGuard.ts` 가 변경이 있을 때만 ① `beforeunload`(새로고침·닫기·외부 이동) ② 화면 안 **링크 클릭**을 `window` 캡처 단계에서 가로채 확인 다이얼로그를 띄우고 "나가기" 면 `router.push` 로 이어 간다(새 탭·`download`·외부·같은 화면 해시는 통과). ⚠️ 브라우저 뒤로/앞으로(popstate)와 코드의 `router.push` 는 막지 못한다 — 저장 버튼 옆의 "저장하지 않은 변경 사항이 있습니다" 표시가 보완한다.
- **조회수**: 공지 상세는 서버가 조회할 때마다 `view_count` 를 올린다 — 목록·홈의 상세 링크는 `prefetch={false}` 로 미리 가져오기를 끈다.
- **오류 문구**: Server Action 은 실패를 던지지 않고 `lib/api-error.ts` 의 `apiErrorMessage()`(도메인 `code` — `self_modification`·`last_admin`·`too_many_attachments`·`unsupported_file_type`… · 413 · 422 배열 · 401/403/404/5xx · 네트워크)로 만든 문구를 상태로 돌려준다. 업로드 전 사전 검사(`lib/uploadRules.ts`·`editorImageProblem`·`lib/linkUrl.ts`)는 백엔드 허용 목록·규칙과 같은 값이다 — 백엔드 설정을 바꾸면 함께 고친다.
- **시각**: 서버 값은 KST naive 문자열이다. `lib/format.ts` 는 `Date` 로 재해석하지 않고 문자열로 자른다. 배너 기간 입력은 `datetime-local` → `YYYY-MM-DDTHH:mm:00`.

---

## 15. 스타일 — Tailwind CSS v4

- **CSS-first**(`@import "tailwindcss"`) + `@theme`로 색상/폰트 토큰 정의. 별도 `tailwind.config.js` 지양.
- **연결 방식은 PostCSS 플러그인 `@tailwindcss/postcss`** — `frontend/postcss.config.mjs` 에 선언한다.
  ⛔ `@tailwindcss/vite` 는 쓸 수 없다. Next 는 Vite 가 아니라 자체 번들러(Turbopack/webpack)를 쓴다.
- **진입 CSS 는 `app/globals.css`** 하나뿐이고, **`app/layout.tsx` 에서 import** 한다. 페이지별로 전역 CSS 를 추가로 import 하지 않는다.
- 공통 컴포넌트 클래스는 `@layer components`. 리치 텍스트 본문(`.rich-text` — 보기·편집 공용)과 편집 영역(`.editor`) 스타일이 여기 있다 — Tailwind preflight 가 지운 목록 점·제목 크기를 되살리고, 서식은 태그·정렬 class 로만 다룬다(`style` 속성 금지 — 백엔드 정화기가 지운다).
- 사용자 화면·관리자 콘솔이 쓰는 **확장 토큰**(`primary-fixed`·`on-primary-fixed`·`primary-container`·`inverse-primary`·`outline`·`surface-container-low/high/highest`·`tertiary`·`error`)은 `globals.css` 의 첫 `@theme` 에 DESIGN.md 값으로 기본값을 둔다 — 기본 테마(`-NoDesign`)는 12개만 주입하므로 여기서 채우고, DESIGN.md 테마가 같은 이름을 주입하면 뒤에 오는 그 값이 이긴다.
- 한글 UI 기본 폰트는 **Pretendard**(+ `Noto Sans KR` 폴백) 권장.

```js
// postcss.config.mjs
export default { plugins: { "@tailwindcss/postcss": {} } }
```

```css
/* app/globals.css */
@import "tailwindcss";
@theme {
  --font-sans: Pretendard, "Noto Sans KR", system-ui, sans-serif;
  --color-primary: #002045;
}
```

```tsx
// app/layout.tsx
import "./globals.css"
```

---

## 16. 네이밍 컨벤션 (요약)

| 대상 | 규칙 |
|------|------|
| Python 파일/함수/변수 | `snake_case` |
| Python 클래스 / Enum | `PascalCase` (Enum 멤버는 `UPPER_CASE`) |
| DB 테이블 | `snake_case` 복수형 |
| 서비스 파일 | `<domain>_service.py` |
| React 컴포넌트 파일/이름 | `PascalCase`, default export (`components/LoginForm.tsx`) |
| App Router 라우트 파일 | 프레임워크 규약 **소문자 고정**: `page.tsx`, `layout.tsx`, `route.ts`, `proxy.ts` |
| 라우트 디렉토리 | `kebab-case` — URL 경로가 된다 (`app/order-history/page.tsx`) |
| Server Action 파일 | `lib/actions/<domain>.ts` (`'use server'` 최상단), 함수는 `xxxAction` |
| 서버 전용 모듈 | `lib/server/<name>.ts` — `import "server-only"` 로 클라이언트 반입 차단 |
| TS 타입/인터페이스 | `PascalCase`, 유니온은 리터럴(`'active' | 'closed'`) |
| 경로 별칭 | `@/*` → 프로젝트 루트 (tsconfig + `vitest.config.ts` 동기화) |
| API 경로 | `/api/v1/<resource>` (리소스 복수형) |

---

## 17. 환경변수 표준

> 모든 설정은 **서비스별 `.env` 파일로 OS 독립적으로 주입**한다(강제 규칙은 §5 참조). 셸 환경변수에 의존하지 않는다.

### 백엔드 (`backend/.env`)
| 키 | 용도 |
|----|------|
| `DATABASE_URL` | PostgreSQL 연결 — 단일 지원(개별 `DB_*` 키 미지원), 미설정 시 기동에서 fail-fast |
| `SECRET_KEY`, `ACCESS_TOKEN_EXPIRE_MINUTES` | 토큰 서명키, access 토큰 만료(분, 기본 15) |
| `REFRESH_TOKEN_EXPIRE_DAYS` | refresh 세션 절대 수명(일, 기본 14) — 회전해도 연장되지 않는다(§9) |
| `LOGIN_MAX_FAILURES`, `LOGIN_LOCKOUT_MINUTES` | 로그인 시도 제한 — 계정별 연속 실패 임계치(기본 5)와 잠금 시간(분, 기본 15) (§9) |
| `REFRESH_TOKEN_TRANSPORT` | refresh 토큰 전달 방식 — `cookie`(브라우저 SPA: 백엔드가 httpOnly 쿠키 설정, 코드 기본값) / `body`(BFF: JSON 본문). 이 템플릿은 `body` (§9) |
| `COOKIE_SECURE` | refresh 쿠키의 `Secure` 속성. cookie 방식 + `APP_ENV=production` 이면 `true` 필수(아니면 기동 거부) |
| `CORS_ORIGINS` | 콤마 구분 허용 출처 |
| `FRONTEND_URL`, `BACKEND_PUBLIC_URL` | 리다이렉트/콜백 |
| `UPLOAD_DIR` | 업로드 저장 위치(기본 `uploads` → `backend/uploads/`, 상대 경로는 backend 기준). `public/` 만 `/uploads/public` 으로 정적 서빙 (§8) |
| `PUBLIC_FILES_BASE_URL` | 공개 파일·첨부 다운로드 URL 접두사. 비우면 루트 상대 경로(같은 오리진 또는 `/uploads` 프록시), 이 템플릿은 비워 두고 Next 가 rewrite 로 같은 오리진에서 내보낸다 (§8·§13) |
| `MAX_IMAGE_UPLOAD_MB`, `MAX_ATTACHMENT_UPLOAD_MB` | 업로드 크기 상한(MB, 기본 5 / 20) — 초과 시 413 |
| `APP_ENV` | `production` 이면 안전하지 않은 기본값(기본 `SECRET_KEY`, 관리자 시드)으로 기동을 거부한다 |
| `SEED_DEFAULT_ADMIN`, `DEFAULT_ADMIN_PASSWORD` | 기동 시 기본 관리자(admin) 시드 여부·초기 비밀번호. **코드 기본값은 꺼짐** — `.env` 에서만 켠다(§21) |
| `OAUTH_*` | SSO 도입 시(authorize/token/userinfo URL, client id/secret, redirect uri) |
| `TZ` | Unix 실행 환경 `Asia/Seoul`; Windows에서는 OS 시각대를 서울(UTC+9)로 설정 |

### 프론트엔드 (`frontend/.env`) — **서버 전용이 기본, 접두 없음**
| 키 | 용도 |
|----|------|
| `FASTAPI_URL` | Next 서버가 호출할 FastAPI 호스트 (예: `http://127.0.0.1:8000`). **서버에서만 읽는다**. `next.config.ts` 의 `/uploads`·공개 첨부 rewrite 대상이기도 해서 **빌드 시점 값이 박힌다**(§13 — 바꾸면 다시 빌드) |
| `NEXT_PUBLIC_*` | 클라이언트 번들에 노출해도 되는 값만 — 현재 skeleton 은 사용하지 않는다 |

- 프론트 환경변수는 **접두 없이 서버 전용으로 두는 것이 기본**이다. Next 서버 코드(`proxy.ts`, 서버 컴포넌트, Server Action, `lib/server/*`)에서 `process.env` 로 읽는다.
- ⚠️ **`NEXT_PUBLIC_` 을 붙인 값은 빌드 시 클라이언트 번들에 그대로 박혀 누구나 볼 수 있다.** `FASTAPI_URL` 처럼 내부 호스트를 가리키는 값이나 비밀값에는 절대 붙이지 않는다. 붙이는 순간 되돌리려면 재빌드·값 교체가 필요하다.
- 실제 `backend/.env`와 `frontend/.env`는 커밋 금지. 각 디렉터리의 `.env.example`에 **키만** 공유.

---

## 18. 개발 원칙 (TDD · Tidy First)

- **TDD 사이클**: Red → Green → Refactor. `PLAN.md` 순서대로 **한 번에 실패하는 테스트 하나**.
  결함도 API 레벨 실패 테스트부터 작성한다.
- **최소 구현**으로 Green을 만들고, **Refactor는 Green 상태에서만**.
- **Tidy First**: **구조 변경(Structural)과 동작 변경(Behavioral)을 분리**한다. 한 커밋에 섞지 않는다.
- **중복 제거**를 철저히, 메서드는 작게.
- **서비스 레이어**: 라우터는 얇게, 도메인 로직은 `services/`.
- **의존성 주입**: DB 세션·현재 주체는 `Depends()`로 주입.

---

## 19. 커밋 규칙

- **형식**: `[Category] <type>: <요약(한글, 50자 이내, 현재형)>`
- **Category**: `[Structural]`(구조 변경, 로직 불변) / `[Behavioral]`(기능·버그·로직 변경)
- **type**: `feat`, `fix`, `refactor`, `docs`, `style`, `test`, `chore`
- 모든 테스트 통과 + 린트 경고 0일 때만 커밋한다.

예) `[Behavioral] feat: 주문 생성 API 추가`, `[Structural] refactor: 의존성 dependencies.py로 이동`

---

## 20. 변경 반영 규칙 (GitHub)

> 기본 흐름은 **`main`에서 작업 → 로컬 검증 → 커밋 → push** 다. 브랜치와 PR은 **선택**이다.
> 커밋의 Structural/Behavioral 분리 원칙(§18, §19)은 그대로 지킨다.

### ⛔ push 전 로컬 검증이 유일한 게이트다

PR 리뷰 단계가 없으므로 **커밋·push 전 검증을 건너뛰면 깨진 코드가 곧바로 `main`에 남는다.** CI는 push 이후에 도는 **사후 안전망**이지 사전 게이트가 아니다.

push 전에 반드시 통과시킨다:

```powershell
cd backend;  .\.venv\Scripts\python -m pytest -q;  .\.venv\Scripts\python -m ruff check .
cd ..\frontend;  pnpm test;  pnpm lint;  pnpm build
```

- 실패했거나 확인하지 않았으면 push 하지 않는다.
- push 후 CI가 실패하면 **되돌리거나 즉시 고치는 커밋을 올린다.** 실패 상태를 방치하지 않는다.

### 커밋 단위
- **하나의 커밋은 Structural·Behavioral 중 하나만** 담는다(§18 Tidy First). 브랜치가 없어도 이 분리는 유지한다.
- **작게 유지**: 한 커밋은 한 가지 목적. 나중에 되돌릴 수 있는 크기로.
- 형식은 §19를 따른다.

### 브랜치·PR을 쓰는 경우 (선택)
다음이면 브랜치를 따고 PR을 만든다. 그 외에는 `main` 직접 커밋으로 충분하다.
- 되돌리기 어렵거나 광범위한 변경 — 마이그레이션이 얽힌 리팩터링, 의존성 대량 상향
- 여러 커밋에 걸쳐 진행 중이라 중간 상태를 `main`에 두고 싶지 않을 때
- 리뷰를 받고 싶을 때(협업자가 있거나 스스로 diff를 정리해 보고 싶을 때)

브랜치 명명은 `feat/<요약>`, `fix/<요약>`, `refactor/<요약>`, `docs/<요약>` (kebab-case).
PR 제목은 커밋과 동일 형식이고, **하나의 PR도 Structural·Behavioral 중 하나만** 담는다.
본문 템플릿은 `.github/pull_request_template.md`에 둔다:

```markdown
## 요약
<무엇을 왜 바꿨는지 1~3줄>

## 변경 유형
- [ ] Structural (구조 변경, 동작 불변)
- [ ] Behavioral (기능·버그·로직 변경)

## 테스트
- 추가/수정한 테스트와 결과 (pytest, 프론트 등)

## 체크리스트
- [ ] 모든 테스트 통과 + 린트 경고 0
- [ ] Structural/Behavioral 를 섞지 않음
- [ ] DB 변경 시 Alembic 마이그레이션 포함 (§11)
- [ ] 설정 변경 시 해당 서비스의 `.env.example` 갱신 (§5, §17)
```

### 예시 (PowerShell)
```powershell
# 기본 — main 직접 커밋
git pull --ff-only
# ... 작업 + 로컬 검증 ...
git add <파일>
git commit -m "[Behavioral] feat: 주문 생성 API 추가"
git push

# 선택 — 브랜치·PR (위 조건에 해당할 때만)
git switch -c feat/order-create
git push -u origin feat/order-create
gh pr create --fill --base main
gh pr merge --squash --delete-branch
```

> **협업자가 생기면** `main` 브랜치 보호와 필수 CI 검사를 켜고 PR 흐름을 기본으로 되돌리는 것을 권장한다. 위 규칙은 단독 개발을 전제로 한다.

---

## 21. 신규 프로젝트 부트스트랩 체크리스트

- [ ] 저장소 구조(§3) 생성, `PLAN.md` / `backend/.env.example` / `frontend/.env.example` / `ARCHITECTURE.md` / `.gitignore`(실제 `.env` 제외) 작성
- [ ] 백엔드 `app/` 골격(§4): `main.py`, `config.py`, `dependencies.py`, `db/`, `core/security.py`
- [ ] `Settings` + `get_settings()` (§5) — **설정은 서비스별 `.env`로 주입, OS 독립 (MUST §5)**, CORS, Unix `TZ=Asia/Seoul`+`tzset()` / Windows OS 시각대 `서울`(UTC+9) 및 불일치 경고 확인
- [ ] PostgreSQL `connect_args` KST 고정 (§7, §10)
- [ ] Alembic 초기화 + 초기 마이그레이션 (§11) — **DB는 항상 Alembic으로만 관리, `create_all`은 테스트 전용 (MUST §11)**
- [ ] `pytest` + SQLite in-memory + `conftest.py` 픽스처 (§12)
- [ ] 프론트 골격(§13): `app/layout.tsx`·`app/page.tsx`, 서버 fetch 래퍼 `lib/server/fastapi.ts`, `lib/session.ts`, `lib/types.ts`
- [ ] `proxy.ts` 인증 가드 + 로그인/로그아웃 Server Action(`lib/actions/auth.ts`) (§14) — 자체 계정 기본, SSO는 도입 시 콜백 라우트 추가
- [ ] `lib/safe-redirect.ts` + **오픈 리다이렉트 거부 테스트**(외부 URL·`//`·스킴) (§14, §13)
- [ ] 세션 쿠키(access+refresh) 속성 확인 — `httpOnly`/`sameSite=lax`/운영 `secure`+`__Host-` 프리픽스/`path=/`, maxAge 는 `TokenResponse` 의 `expires_in`·`refresh_expires_in` 으로 자동 동기화 (§14)
- [ ] Tailwind v4 `@theme` — **`@tailwindcss/postcss` + `postcss.config.mjs`**, 진입은 `app/globals.css`, pnpm, ESLint (§15, §2)
- [ ] `pnpm lint` → `pnpm typecheck`(`tsc --noEmit`) → `pnpm test`(Vitest) → `pnpm build` 통과 확인 (§2, §20)
- [ ] 배포 대상이 **Node 런타임**인지 확인 — `next build` → `next start`. 정적 호스팅은 불가 (§2)
- [ ] `.github/workflows/ci.yml` 동작 확인 — push 이후 도는 **사후 안전망**이다. push 전 로컬 검증이 유일한 게이트 (§20)
- [ ] (협업자가 생기면) `.github/pull_request_template.md` 활용, `main` 보호 + CI 필수 검사 설정 (§20)
- [ ] 첫 실패 테스트 작성(TDD Red) → 구현(Green) (§18)

### 배포 전 체크리스트 (스타터 기본값 제거 — MUST)

skeleton 은 개발 편의를 위해 기본 관리자 계정을 자동 시드하고 로그인 화면에 안내한다. **운영 배포 전 반드시 제거·변경한다.**

- [ ] `SECRET_KEY` 를 무작위 값으로 교체 — 기본값(`change-me-in-production-use-32-bytes`)이면 개발에서는 경고, `APP_ENV=production` 에서는 **기동 실패**다 (공개된 키라 토큰 위조가 가능하다)
- [ ] 배포 대상의 KST 설정 확인 — Unix는 `backend/.env` 또는 런타임 환경변수의 `TZ=Asia/Seoul`과 `tzset()` 적용, Windows는 OS 시각대 `서울`(UTC+9) 설정 및 애플리케이션 경고 부재 확인 (§10, §17)
- [ ] `APP_ENV=production` 설정 — 기본 `SECRET_KEY` 나 관리자 시드가 켜져 있으면 기동이 실패한다 (§17)
- [ ] 기본 관리자 시드 정리 — 운영 `backend/.env`에서 `SEED_DEFAULT_ADMIN=false` (§17)
- [ ] 로그인 화면의 개발용 안내 문구 확인 — `frontend/components/LoginForm.tsx` 의 안내는 `NODE_ENV !== "production"` 에서만 렌더되므로 프로덕션 빌드에서는 자동으로 빠진다
- [ ] 세션 쿠키가 운영에서 `secure: true` 로 나가는지 확인 — HTTPS 종단 뒤에 배치하고 `NODE_ENV=production` 으로 기동 (§14)
