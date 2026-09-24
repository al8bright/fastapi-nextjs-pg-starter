# __PROJECT_NAME__ 작업 계획 (PLAN.md)

> TDD 순서대로 진행한다. **한 번에 실패하는 테스트 하나**(Red) → 최소 구현(Green) → 정리(Refactor).
> 구조 변경(Structural)과 동작 변경(Behavioral)을 분리한다.

## 0. 부트스트랩 (architecture.md §21 체크리스트)

- [ ] 저장소 구조 생성 (`backend/`, `frontend/`, `docs/`, 각 하위 `.env.example`, `.gitignore`)
- [ ] 백엔드 `app/` 골격: `main.py`, `config.py`, `dependencies.py`, `db/`, `core/security.py`
- [ ] `Settings` + `get_settings()`, CORS, KST 설정(Unix `TZ=Asia/Seoul`, Windows OS 서울 시각대)
- [ ] PostgreSQL `connect_args` KST 고정
- [ ] Alembic 초기화 + 초기 마이그레이션
- [ ] `pytest` + SQLite in-memory + `conftest.py` 픽스처
- [ ] 프론트 골격: `app/` App Router, `lib/server/fastapi.ts` 서버 fetch 래퍼, `lib/session.ts` 쿠키
- [ ] `middleware.ts` 쿠키 기반 인증 가드 + 오픈 리다이렉트 방지
- [ ] Tailwind v4 `@theme`, `@tailwindcss/postcss` + `app/globals.css`, pnpm, ESLint
- [ ] TypeScript 타입 검사 (`tsc --noEmit`)
- [ ] `.github/workflows/ci.yml` 동작 확인 (push 이후 사후 안전망 — 게이트는 push 전 로컬 검증)

## 1. <첫 기능>

- [ ] (Red) 실패 테스트: <테스트명>
- [ ] (Green) 최소 구현
- [ ] (Refactor) 정리

## 2. <다음 기능>

- [ ] ...

## 운영 준비 TODO (스캐폴드 시점 알려진 항목 — 착수 시 위 기능 섹션처럼 TDD 로 진행)

### 인증·계정 운영 (골격에 없는 기능 — 서비스 특성에 맞춰 추가)

- [ ] **비밀번호 변경·초기화 API**: 현재 비밀번호를 바꿀 엔드포인트가 없다(시드된 admin 포함 —
      지금은 DB 직접 수정뿐). `validate_new_password` 재사용, 변경 성공 시 본인 현재 세션 외
      `auth_sessions` 전체 폐기까지 한 단위다.
- [ ] **사용자 관리 API(관리자)**: 서비스 계층(`create_user`)만 있고 라우터가 없다 — 생성·
      비활성화·역할 변경을 `require_admin` 의존성으로 추가한다. 비활성화 시 해당 사용자 세션
      일괄 폐기 포함.
- [ ] **세션 관리(내 기기 목록·전 기기 로그아웃)**: `auth_sessions` 가 이미 세션 단위라 목록·
      개별 폐기·전체 폐기가 가능하다. 표시용 `user_agent`·`ip` 컬럼은 필요해질 때 마이그레이션으로.
- [ ] **세션·스로틀 테이블 청소**: `auth_sessions` 는 로그인마다, `login_throttles` 는 실패한
      username 마다(미존재 계정 포함) 행이 쌓이는데 삭제 경로가 없다. 만료·폐기 세션과 오래된
      스로틀 행을 지우는 주기 작업(또는 기동 시 청소)을 추가한다.
- [ ] **계정 잠금 DoS 완화 검토**: 로그인 스로틀이 username 기준이라, 제3자가 남의 아이디로
      5회 실패시키면 그 계정이 15분 잠긴다(보안-가용성 트레이드오프). 공개 서비스라면 IP 결합·
      캡차 등 배포 환경에 맞는 완화를 결정한다.

### 배포 전환 (오픈 전 필수)

- [ ] **production 전환 체크리스트**: `APP_ENV=production`·`SEED_DEFAULT_ADMIN=false`·admin
      비밀번호 교체·`SECRET_KEY` 운영용 재발급. (기본 SECRET·시드 상태의 production 기동은
      main.py 가 막아 주지만, 계정·키 교체 자체는 수동이다.)
- [ ] **TLS 필수 확인**: production 쿠키는 `__Host-`+`secure` 라 **TLS 없이 배포하면 쿠키가
      저장되지 않아 로그인이 무한 루프**가 된다. 리버스 프록시에서 TLS 종단을 구성한다.
- [ ] **네트워크 경계**: 브라우저는 FastAPI 를 직접 호출하지 않으므로 FastAPI(:8000)는 내부망에만
      노출하고 프록시는 Next(:3000)만 공개한다. `CORS_ORIGINS` 도 운영 도메인 기준으로 정리.
- [ ] **프로세스 구동·재시작 정책**: `next build`→`next start`(Node 런타임 필수 — 정적 호스팅
      불가, §2)와 uvicorn worker 수·systemd 등 재시작 정책을 정한다.
- [ ] **DB 운영 절차**: 배포 시 `alembic upgrade head` 실행 시점·롤백 계획, 백업·복구 주기.

### 관측·유지보수

- [ ] **감사 로그 수집·보존**: 보안 이벤트 전용 로거 `app.audit`(로그인 성공/실패/잠금·refresh
      회전/재사용 감지·로그아웃)를 일반 로그와 분리 수집하고 보존 기간을 정한다.
- [ ] **에러 트래킹·헬스 모니터링**: `/api/v1/health` 외부 모니터링과 5xx 알림 경로를 만든다.
- [ ] **의존성 취약점 대응 루틴**: CI 의 `backend-audit`(pip-audit)·`frontend-audit`(pnpm audit)는
      **경고성**이라 실패해도 초록이다 — 주기적으로 로그의 경고를 확인하고 stack-versions §5
      절차로 패치한다.
- [ ] **Next `middleware.ts` → `proxy` 마이그레이션**: Next 16.3 에서 deprecated. 제거되는
      메이저로 올리면 인증 가드·자동 refresh 가 조용히 무동작이 된다 — **Next 메이저 상향 전
      필수** (`npx @next/codemod@canary middleware-to-proxy .`, §14·stack-versions 스킬 함께 갱신).
- [ ] **템플릿 스냅샷 인지**: 이 프로젝트는 `fastapi-nextjs-pg-starter` 의 생성 시점 스냅샷이다.
      이후 템플릿의 버그픽스·개선은 자동 반영되지 않으므로 필요 시 수동으로 가져온다
      (재스캐폴드는 파괴적 덮어쓰기라 금지).
