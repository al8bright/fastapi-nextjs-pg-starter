# Changelog

스캐폴드 템플릿 `fastapi-nextjs-pg-starter` 의 변경 이력.
형식은 [Keep a Changelog](https://keepachangelog.com/) 를 느슨히 따른다.

---

## 2026-09-03 — 인증 개편: refresh 세션·로그인 스로틀·보안 헤더

access 토큰 단일 발급이던 인증을 **DB 세션 기반 refresh 토큰** 체계로 전면 개편하고,
로그인 브루트포스 방어와 프론트 보안 응답 헤더를 추가했다.

### Added (추가)

- **DB 세션 기반 refresh 토큰** — `POST /auth/refresh`·`POST /auth/logout` 추가.
  refresh 토큰은 JWT 가 아닌 불투명 토큰(`"<sid>.<urlsafe>"`)으로 DB(`auth_sessions`)에 SHA-256
  해시만 저장하고, 회전(rotation) 방식에 **재사용 감지 시 세션 즉시 폐기**를 넣었다. 회전해도
  절대 수명(로그인 시점 + `REFRESH_TOKEN_EXPIRE_DAYS`, 기본 14일)은 연장되지 않는다.
  로그아웃은 refresh 토큰 소지를 폐기 권한으로 보는 멱등 204(인증 불요)다.
  (`app/models/auth_session.py`, `app/services/session_service.py`, 마이그레이션 `0003_auth_sessions`)
- **access 토큰의 즉시 무효화** — access JWT 에 `sid` 클레임을 넣고 `get_current_user` 가 요청마다
  세션 유효성을 검사한다. 로그아웃·강제 폐기가 access 만료를 기다리지 않고 즉시 401 이 된다.
- **로그인 시도 제한** — 계정(username)별 DB 카운터(`login_throttles`). `LOGIN_MAX_FAILURES`(5) 도달
  시 `LOGIN_LOCKOUT_MINUTES`(15분) 잠금 → 429. 미존재 계정도 기록해 잠금 응답 유무로 계정 존재가
  드러나지 않는다.
- **비밀번호 정책 통합** — `validate_new_password()` 한 곳에서 최소 8자(`PASSWORD_MIN_LENGTH`) +
  72 bytes 상한(bcrypt)을 검증한다. 하한은 새 비밀번호에만 적용된다(기존 계정 로그인은 통과).
- **감사 로그** — 보안 이벤트(로그인 성공/실패/잠금, refresh 회전/거부/재사용 감지, 로그아웃)를
  전용 로거 `app.audit` 로 분리 수집한다.
- **middleware 자동 세션 갱신** — access 쿠키가 없고 refresh 쿠키만 있으면 백엔드 `/auth/refresh` 를
  직접 호출(5초 타임아웃)해 회전된 새 쌍으로 쿠키를 교체하고 통과시킨다. 401 이면 쿠키 파기,
  네트워크·5xx 는 쿠키 보존 후 리다이렉트만 한다(일시 장애로 전 사용자를 로그아웃시키지 않는다).
- **보안 응답 헤더** — `next.config.ts` 에서 전 경로에 CSP·`X-Frame-Options: DENY`·nosniff·
  Referrer-Policy·Permissions-Policy·production HSTS 를 내보낸다.
- **CI 의존성 취약점 스캔** — `backend-audit`(pip-audit)·`frontend-audit`(`pnpm audit --prod`)
  경고성(`continue-on-error`) 잡 추가.

### Changed (변경)

- **`ACCESS_TOKEN_EXPIRE_MINUTES` 기본 30 → 15분** — 갱신을 refresh 가 담당하므로 access 는 짧게.
  두 스캐폴드 스크립트가 생성하는 `.env` 도 15분으로 동기화했다.
- **세션 쿠키 2개 체계** — access(`<project>_session`, maxAge = `expires_in` − 60초) +
  refresh(`<project>_refresh`, maxAge = `refresh_expires_in`). production 은 `__Host-` 프리픽스로
  서브도메인 쿠키 주입을 브라우저 단에서 차단한다. maxAge 가 백엔드 응답 값으로 **자동 동기화**
  되어 수동 동기화 규칙이 사라졌다. 삭제는 `delete()` 가 아니라 같은 속성으로 maxAge 0 덮어쓰기다.
  이름·속성 헬퍼는 의존성 0 인 `lib/session-cookie.ts` 로 모았다.
- **`TokenResponse` 확장** — `/auth/login`·`/auth/refresh` 가 동일하게
  `{access_token, refresh_token, token_type, expires_in, refresh_expires_in}` 을 돌려준다
  (`expires_in` 은 "지금부터 남은 초").
- **로그아웃 Server Action** — 백엔드 `/auth/logout` 을 best-effort 로 호출해 refresh 세션을
  폐기한 뒤 두 쿠키를 지운다.
- **`FastapiError` 를 `lib/fastapi-error.ts` 로 분리** — `server-only` 없는 순수 모듈로 뽑아 vitest 로
  고정하고(`lib/server/fastapi.ts` 가 re-export), 429 용 `"throttled"` kind 를 추가해 시도 제한을
  자격증명 오류와 구분해 안내한다.
- **scaffold.sh 시크릿 폴백 제거** — openssl·python3 둘 다 없으면 타임스탬프 기반 약한 키로
  진행하는 대신 즉시 중단한다(생성 시각 추측만으로 서명키가 복원되는 위험 제거).

## 2026-08-20 (2) — 실행 검증 및 보안 수정

템플릿을 실제로 스캐폴드해 PostgreSQL 18 + SSR 프로덕션 모드로 끝까지 돌려보고, 재현된 결함을 고쳤다.

### Fixed (수정)

- **스캐폴드가 pyenv 환경에서 항상 실패하던 문제** — `pyenv init` 은 shim 을 PATH 에 올릴 뿐 버전을
  선택하지 않는다. `pyenv global` 이 `system` 이면 bootstrap 이 3.13 을 확보한 뒤에도 검증 단계에서
  중단됐다. 핀 로드를 활성화보다 앞으로 옮기고 `PYENV_VERSION` 을 (설치 여부를 확인해) 지정하며,
  bootstrap 에 넘기는 임시 폴더에 골격의 `.python-version`·`.nvmrc` 를 미리 심어 핀이 존중되게 했다.
  `scaffold.ps1` 도 동일하게 고쳤다.
- **만료·무효 토큰에서 사이트 전체가 잠기던 무한 리다이렉트** — 로그인 화면이 쿠키의 *존재*만 보고
  보호 경로로 되돌려 보내 `ERR_TOO_MANY_REDIRECTS` 가 났다(`SECRET_KEY` 교체 시 전 사용자 동시 발생).
  `hasValidSession()` 을 추가해 로그인 화면이 토큰 *유효성*으로 판단하게 했다.
- **기본 자격증명이 모든 프로젝트에 공유되던 문제** — `seed_default_admin` 기본값을 `false`,
  `default_admin_password` 기본값을 제거하고 `APP_ENV` 를 추가했다. `APP_ENV=production` 에서
  기본 `SECRET_KEY` 이거나 시드가 켜져 있으면 경고가 아니라 **기동을 거부**한다. 스캐폴드는
  관리자 비밀번호를 프로젝트마다 무작위 생성해 `.env`(권한 600)에 넣고 완료 안내에 출력한다.
- **`/landing` 인증 우회** — middleware 는 쿠키의 존재만 보므로 임의 문자열 쿠키로 통과됐다.
  페이지에서 `getSessionUser()` 로 실검증한다.
- **오픈 리다이렉트 (dot-segment·인코딩 우회)** — `/..//evil.com` 이 정규화되면 `//evil.com` 이 되어
  검증기가 선언한 불변식이 깨졌다. WHATWG URL 로 정규화한 뒤 다시 검사하고 정규화된 경로를 반환한다.
- **middleware matcher 가 보호 경로를 흘리던 문제** — `login` 이 앵커되지 않아 `/login-history` 가,
  "확장자처럼 생긴 모든 것"을 제외해 `/users/john.doe` 가 가드 밖이었다. 앵커를 붙이고 정적 자산
  확장자만 열거한다.
- **`pnpm-lock.yaml` 부재** — pnpm 11 은 CI 에서 `frozen-lockfile` 이 기본이라 설치가 실패했다. 커밋했다.
- **프로젝트 이름에 ASCII 영숫자가 없으면 조용히 깨진 프로젝트가 생성되던 문제** — DB 이름이 비고
  쿠키가 `_session` 이 되는데도 종료 코드가 0 이었다. 이제 중단한다(sh·ps1 공통).
- `skeleton/scripts/bootstrap.sh` 실행 비트 누락(생성 프로젝트에서 `permission denied`).

### Changed (변경)

- **SSR fetch 에 타임아웃 추가** — 응답하지 않는 백엔드가 Next 워커를 붙잡지 않도록
  `AbortSignal.timeout`(기본 10s, `FASTAPI_TIMEOUT_MS`)을 걸고, 비-JSON 응답도 `FastapiError` 로 정규화한다.
- **프로덕션에서 `FASTAPI_URL` 미설정 시 fail-fast** — 조용히 localhost 로 폴백하지 않는다.
- **`SESSION_COOKIE` 를 `lib/session-cookie.ts` 로 분리** — middleware(Edge)가 `server-only`·
  `next/headers` 를 번들로 끌어오지 않게 했다.
- **스캐폴드 재실행 안전성** — 비어있지 않은 대상은 확인을 받고(비대화형이면 중단), 기존
  `backend/.env` 는 덮어쓰기 전에 백업한다.
- **로그인 화면에서 비밀번호 표시 제거** — 개발 환경에서만 `backend/.env` 위치를 안내한다.
- **CI 강화** — `permissions: contents: read`, `concurrency`, `timeout-minutes`, 액션 버전 상향
  (checkout@v5 / setup-python@v6 / setup-node@v5), 템플릿 CI 의 생성물 검증에 `typecheck` 추가.
- **문서·스킬을 구현과 재동기화** — matcher 정규식, 시드 기본값, 프론트 버전 고정 방식,
  `SECRET_KEY` 기본값 문구, PowerShell 전용이던 스킬 명령에 macOS/Linux 병기.

## 2026-08-20

`fastapi-react-pg-starter` 로부터 프론트엔드를 **Next.js** 로 이식해 신규 저장소로 분기.

### Added (추가)

- **Next.js App Router 프론트엔드** — React Server Components로 페이지를 렌더링하고, 로그인·로그아웃 mutation은 Server Actions로 처리하는 골격 추가.
- **서버 전용 FastAPI 통신 계층** — `lib/server/fastapi.ts`에서 `FASTAPI_URL`을 읽고 Bearer JWT를 주입하는 fetch 래퍼 추가.
- **쿠키 기반 인증 경계** — `lib/session.ts`의 httpOnly 쿠키 세션과 `middleware.ts`의 보호 경로 인증 가드 추가.
- **안전한 원래 위치 복귀** — `/login?next=<원래경로>` 흐름과 내부 경로만 허용하는 `lib/safe-redirect.ts`, 오픈 리다이렉트 회귀 테스트 추가.
- **Next.js 빌드 구성** — `next.config.ts`, `postcss.config.mjs`, App Router용 `app/globals.css`, `next build`·`next start` 스크립트 추가.
- **프론트 품질 게이트** — Vitest 테스트와 `pnpm lint` → `pnpm typecheck` → `pnpm test` → `pnpm build` CI 흐름 추가.

### Changed (변경)

- **렌더링과 배포 모델** — 앞의 세 SPA 판과 달리 서버 렌더링을 채택하고, 정적 호스팅 대신 `next build` 후 `next start`로 구동하는 **Node 런타임** 배포로 변경.
- **인증 토큰 보관** — `localStorage` 대신 브라우저 JavaScript가 읽을 수 없는 **httpOnly 쿠키**를 사용하도록 변경.
- **데이터 접근** — React Query 같은 쿼리 라이브러리, Zustand 같은 상태 라이브러리와 axios를 제거하고, 서버 컴포넌트의 직접 fetch와 Server Actions로 변경.
- **통신 경계** — 브라우저가 FastAPI를 직접 호출하지 않으며, 브라우저는 Next 서버하고만 통신하고 Next 서버가 FastAPI에 Bearer JWT로 요청하도록 변경.
- **환경변수** — `VITE_` 접두의 클라이언트 공개 변수 대신 서버 전용 `FASTAPI_URL`을 사용하도록 변경. `NEXT_PUBLIC_` 접두를 붙이지 않아 클라이언트 번들 노출을 막는다.
- **개발 서버 포트** — 프론트엔드 기본 포트를 5173에서 Next.js 관례인 **3000**으로 변경.
- **테마 주입 위치** — 디자인 토큰의 Tailwind `@theme` 주입 대상을 `frontend/app/globals.css`로 변경하고 `@tailwindcss/postcss`를 사용.

### Unchanged (그대로 유지)

- **FastAPI 백엔드** — SQLAlchemy 2.0, Alembic, PostgreSQL, JWT 발급, bcrypt 검증, 관리자 자동 시드와 인증 API를 React 판과 동일하게 유지.
- **백엔드 패키지와 런타임 기준** — `requirements.txt` 정확 핀과 Python ≥ 3.13, Node.js ≥ 24, pnpm ≥ 11 최소 기준 유지.
- **스캐폴드 동작** — Windows PowerShell과 macOS/Linux bash 양쪽에서 런타임 검사·bootstrap·실패 시 복사 전 중단·DB 생성·Alembic 적용·의존성 설치를 자동화하는 흐름 유지.
- **프로젝트 규칙** — DB 변경은 Alembic으로만 수행하고, 설정은 `.env`로 관리하며, KST 단일 기준과 TDD + Tidy First 원칙 유지.
- **화면과 사용자 흐름** — 로그인, 메인, 상태, 내 정보 화면과 기본 관리자 `admin`(비밀번호는 스캐폴드가 무작위 생성), 로그인 후 원래 위치 복귀 동작 유지.

### 작업 관례 (다음 세션 참고)

- **pnpm 11 빌드 허용 설정**은 `pnpm-workspace.yaml`의 **`allowBuilds` 맵**을 사용한다. `onlyBuiltDependencies`는 pnpm 11에서 무시되어 설정 파일 자동 수정과 템플릿 오염을 일으킬 수 있으므로 사용하지 않는다.
- **버전 핀 정책**: 프론트 버전은 추측하지 않고 실제 `install + lint + typecheck + test + build`가 모두 통과한 조합만 핀한다. `minimum-release-age` 기본값을 지키기 위해 **배포 후 24시간 경과한 버전만 핀**한다.
- `requirements.txt`는 `==` 정확 핀을 유지하며, 런타임 최소 상향만으로 패키지 핀을 자동 상향하지 않는다.
- 커밋 메시지는 `[Structural]` 또는 `[Behavioral]` 접두와 conventional type을 함께 사용한다.
- 정확한 버전과 버전별 함정은 `stack-versions` 스킬과 SSOT 파일인 `versions.env`·`requirements.txt`·`package.json`을 기준으로 판단한다.

### 남은 후속 (미진행)

- `middleware.ts` 는 Next 16 에서 deprecated 다(`next build` 마다 경고). 향후 `proxy.ts` 로 전환 검토.
- PostgreSQL 경로와 `scaffold.ps1`(Windows)은 아직 실행 검증하지 못했다. README 검증 상태 참조.
- 도메인 기능은 각 프로젝트에서 PRD를 작성한 뒤 진행하며, 후보는 회원가입·사용자 관리·비밀번호 변경·토큰 만료와 refresh.
- CI 머지 게이트 강제는 GitHub 저장소의 main 브랜치 보호와 필수 체크 설정으로 적용.
