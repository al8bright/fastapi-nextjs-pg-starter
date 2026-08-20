# Changelog

스캐폴드 템플릿 `fastapi-nextjs-pg-starter` 의 변경 이력.
형식은 [Keep a Changelog](https://keepachangelog.com/) 를 느슨히 따른다.

---

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
- **화면과 사용자 흐름** — 로그인, 메인, 상태, 내 정보 화면과 기본 관리자 `admin` / `admin123`, 로그인 후 원래 위치 복귀 동작 유지.

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
