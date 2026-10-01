# Changelog

스캐폴드 템플릿 `fastapi-nextjs-pg-starter` 의 변경 이력.
형식은 [Keep a Changelog](https://keepachangelog.com/) 를 느슨히 따른다.

---

## 2026-10-02 — 공지사항·배너·관리자 API + 업로드 저장소·본문 HTML 정화 (네 템플릿 공통 백엔드) + 사용자 화면·관리자 콘솔 (Next.js)

### Added (백엔드 — 네 템플릿 공통)

- **테이블 3종** (alembic `0004_notices_banners`) — `notices`(정화된 `body_html`, 고정·게시·`published_at`·조회수, `author_id` SET NULL),
  `notice_attachments`(공지 CASCADE, 공지당 최대 10개), `banners`(이미지 key·크기, `link_url`, 노출 기간 `starts_at`/`ends_at`, 순서, 활성).
- **공개 API** — `GET /notices`(게시분만, 고정 먼저 → 게시일 최신순, `page·size·q`), `GET /notices/{id}`(조회수 +1, 첨부 목록),
  `GET /notices/{id}/attachments/{aid}`(attachment + RFC 5987 `filename*` 한글 파일명 + nosniff), `GET /banners`(활성 + KST 노출 기간 안).
- **관리자 API** (`/admin/*`, 라우터 단위 `require_admin` — 비로그인 401, 일반 사용자 403) — 대시보드 집계(사용자·세션·잠금·공지·배너·DB 상태·Alembic 리비전),
  사용자 목록·권한/활성 변경(자기 강등·비활성화 금지, 마지막 활성 관리자 보호 409, 비활성화 시 세션 전부 폐기), 세션 목록·강제 폐기,
  로그인 잠금 목록·해제, 공지 CRUD·첨부 업로드/다운로드/삭제, 배너 CRUD·이미지 업로드·순서 변경, 에디터 이미지 업로드(`POST /admin/editor/images` → `{key,url,width,height}`).
- **업로드 저장소** `app/core/storage.py` — `UPLOAD_DIR`(기본 `backend/uploads/`, `.gitignore`) 아래 서버 생성 키로만 저장.
  이미지는 시그니처 + Pillow 검증(PNG·JPEG·WebP·GIF), EXIF 방향 반영 후 메타데이터 없이 재인코딩, 긴 변 2000px 초과 축소, GIF 는 원본 그대로.
  첨부는 확장자 허용 목록·무작위 파일명(원본 이름은 DB). `public/` 만 `/uploads/public` 으로 정적 서빙하고 `private/` 첨부는 API 로만 내려간다.
- **본문 HTML 정화** `app/core/sanitize.py`(nh3) — 에디터 명세 허용 목록. 유튜브 embed 외 iframe 제거 + sandbox 등 강제, `style`·`on*`·`javascript:`·`data:` 제거,
  링크 `rel="noopener noreferrer"`. 공지 저장 시 서비스 계층에서 항상 정화하고, 정화 후 빈 본문은 422.
- 새 설정 `UPLOAD_DIR`·`PUBLIC_FILES_BASE_URL`(이 템플릿은 비움 — Next rewrite)·`MAX_IMAGE_UPLOAD_MB`(5)·`MAX_ATTACHMENT_UPLOAD_MB`(20), 의존성 `nh3==0.3.7`·`pillow==12.3.0`.
- `ServiceError`·`StorageError` 전역 핸들러(`app/api/errors.py`) — 코드별 HTTP 상태 표 한 곳, 응답 `{"detail","code"}`.
- 백엔드 테스트 → **319** 건(`test_sanitize`·`test_storage`·`test_uploads_serving`·`test_notices`·`test_banners`·`test_admin`).

### Added (프론트엔드 — 사용자 화면 디자인 A · 관리자 콘솔 디자인 A, BFF 그대로)

- **공개 사용자 화면** — 라우트 그룹 `app/(site)/`(상단 내비 레이아웃). 첫 화면 `/` 를 로그인 없이 공개: 배너 캐러셀(이전/다음·점 버튼, 6초 자동 넘김은
  마우스 올림·포커스·일시정지 버튼으로 멈춤, `prefers-reduced-motion` 이면 자동 넘김 없음, 내부 링크는 `next/link`·외부 링크는 새 창 `noopener`) — 배너가 없으면
  기본 히어로, 주요 서비스(자리표시), 최신 공지 5건, 내 계정. `/notices`(고정·첨부 표시·제목 검색·페이지 — URL 파라미터, GET 폼 `next/form`),
  `/notices/<id>`(게시일·조회수·`RichContent` 본문·첨부 다운로드·보던 목록으로), `/me`. 헤더 계정 메뉴(내 정보·로그아웃)와 **admin 에게만** "관리자 콘솔".
  사용자는 레이아웃(서버)이 `getOptionalUser()`(요청당 한 번 `/auth/me`)로 읽어 표시값만 내려준다.
- **관리자 콘솔** `app/admin/*` — 그룹형 사이드바(개요·콘텐츠·회원·보안·시스템, 현재 메뉴 `aria-current`, "로그인 잠금" 잠긴 계정 수 배지, 1024px 미만 서랍):
  대시보드(KPI·최근 세션 강제 종료·잠금 해제), 공지(목록·작성/수정 — 리치 에디터·상단 고정·게시, 첫 저장 뒤 수정 화면 + 첨부 패널: 여러 파일 순차 업로드·사전 검사·삭제),
  배너(썸네일·기간·활성 토글/순서 이동 `useOptimistic`·삭제, 작성/수정 — 이미지 업로드 미리보기·대체 텍스트 필수·링크 규칙·KST 기간), 사용자(검색·역할 필터·권한/활성 변경·
  세션 모두 종료, 409 `self_modification`·`last_admin` 한국어 안내), 세션(`?user_id=` 필터·강제 종료), 로그인 잠금, 시스템 상태(헬스 + DB·Alembic 리비전).
- **관리자 가드** — `proxy.ts`(비로그인 → `/login?next=`) → `app/admin/layout.tsx` 의 `checkAdmin()`(role≠admin → 403 화면, 백엔드 장애 → 오류 화면) →
  백엔드 `require_admin`(권한 경계). 각 화면 조회는 `loadForPage()`(401 → 로그인, 403 등 → 문구).
- **자체 리치 텍스트 에디터**(React 템플릿과 같은 코드, 라이브러리 없음 — 서식·이미지 변환/자르기/크기·유튜브 임베드·붙여넣기 정리). 원 가이드 설계대로
  `uploadImage` 는 **Server Action**(`uploadEditorImageAction` → `POST /admin/editor/images`, 세션의 access 토큰). 에디터는 `next/dynamic(ssr:false)` 로 브라우저에서만 그린다.
- **서버 데이터·액션** — `lib/server/{notices,banners,admin,load}.ts`(server-only), `lib/actions/{notices,banners,admin,editor}.ts`(조회는 서버 컴포넌트, 변경·업로드는
  Server Action + `revalidatePath`), `lib/api-error.ts`(도메인 code·413·422 배열 → 한국어), `fastapiFetch` 의 `query`·`FormData`(multipart)·`timeoutMs`·`fastapiStream`,
  `FastapiError.code`·`.validation`.
- **업로드 파일 서빙** — `next.config.ts` 의 `rewrites()`(`beforeFiles`)가 `/uploads/*` 와 공개 첨부 `/api/v1/notices/<id>/attachments/<aid>` 를 같은 오리진에서 백엔드로 넘긴다
  (응답 URL 이 루트 상대라 그대로 동작). 관리자 첨부 다운로드(임시저장 포함)는 Route Handler `app/admin/notices/[id]/attachments/[attachmentId]/route.ts` 가 세션 토큰으로 스트리밍 중계.
  Server Action·proxy 본문 상한 25mb(`experimental.serverActions.bodySizeLimit`·`proxyClientMaxBodySize`).
- **CSP** — `frame-src https://www.youtube-nocookie.com https://www.youtube.com`(정확한 호스트만), `img-src` 에 `https://img.youtube.com` 추가, `media-src 'self' blob:`.
- 저장하지 않은 변경 이탈 확인(`useLeaveGuard` — `beforeunload` + 화면 안 링크 클릭 가로채기 확인 다이얼로그; 뒤로 가기는 막지 못함, 문서화).
- 확장 디자인 토큰 기본값(`primary-fixed`·`outline`·`surface-container-low/high/highest`·`tertiary`·`error` 등)과 `.rich-text`·`.editor` 스타일을 `globals.css` 에 추가 —
  기본 테마(`-NoDesign`)에서도 동작하고, DESIGN.md 테마가 주입되면 그 값이 이긴다.
- 프론트엔드 테스트 4 → **19** 파일, **236** 건(에디터 순수 로직·컴포넌트, 캐러셀, 공지 폼 검증·FormData·이탈 확인, 첨부 패널, 배너 폼, 사용자·잠금 표, 사이드바 활성 상태,
  오류 문구·목록 파라미터·공개 경로 허용 목록). 새 런타임 의존성은 없다.

### Changed (프론트엔드)

- 첫 화면이 공개 홈이 됐다(이전: 로그인 필수 메인). `app/page.tsx`(메인)·`app/landing`(시스템 상태) 삭제 — 시스템 상태는 `/admin/system` 으로 옮겼다.
  `/my` 는 `/me` 로 영구 리다이렉트. 로그인 화면에 "홈으로" 링크. 로그아웃 후 이동이 `/login` → `/` 로 바뀌었다.
- `proxy.ts` — 공개 화면(`lib/public-paths.ts` 의 `isPublicPath`: `/`·`/notices/**`)은 로그인 없이 통과시키되 만료 세션 갱신은 그대로 한다.
  matcher 제외 목록에 `uploads/`·`api/v1/notices/`(rewrite 되는 파일 경로)를 더했다. matcher 는 계속 **제외 목록**이다(새 화면은 기본이 보호).
- 스캐폴드 완료 메시지·루트 README 의 확인 안내를 "홈 화면 → 관리자 콘솔 › 시스템 상태" 로 바꿨다.

### ⚠️ 기존 프로젝트에 반영할 때

- 백엔드: `pip install -r requirements.txt` → `alembic upgrade head`(0004) → `backend/.env` 에 위 4개 키 추가(없으면 기본값, `PUBLIC_FILES_BASE_URL` 은 비움). `backend/uploads/` 를 `.gitignore` 에 추가한다.
- 프론트엔드: `app/`(`(site)`·`admin` 트리, 기존 `page.tsx`·`landing`·`my` 제거)·`components/`·`lib/`·`proxy.ts`·`next.config.ts`(rewrite·CSP·본문 상한)·`globals.css`(확장 토큰·`.rich-text`)를 옮긴다.
  `FASTAPI_URL` 은 rewrite 대상이라 빌드 시점 값이 박힌다 — 배포 환경 값으로 빌드한다. 새 의존성은 없다.

## 2026-10-02 — 백엔드 보안 보강 (네 템플릿 공통)

### Added (추가)

- **보안 응답 헤더** — 모든 응답에 `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Cross-Origin-Opener-Policy: same-origin`. HSTS(`max-age=31536000`)는 `COOKIE_SECURE=true` 또는 `APP_ENV=production` 일 때만 보낸다.
- **`/api/v1/auth/*` 캐시 금지** — 성공·401/422/429·쿠키 삭제 응답 모두 `Cache-Control: no-store`.
- **로그인 잠금 429 의 `Retry-After`** — 남은 잠금 초(올림·최소 1). 미존재 계정도 동일하게 받아 계정 존재가 드러나지 않는다.
- `tests/test_security.py` 24건.

### Changed (변경)

- CORS `allow_methods`/`allow_headers` 를 `"*"` 에서 명시 목록(`GET·POST·PUT·PATCH·DELETE·OPTIONS` / `Authorization·Content-Type`)으로 좁히고 `Retry-After` 를 expose 한다.
- CSP 는 `/docs`·`/redoc` 을 깨뜨리므로 백엔드에서 붙이지 않는다(프론트엔드 호스팅 책임). `ARCHITECTURE.md` §9 에 정리했다.

## 2026-10-02 — refresh 토큰 전달 방식 설정 추가 (네 템플릿 공통 백엔드)

이 저장소의 `skeleton/backend` 를 react·nuxt·svelte 템플릿과 **완전히 같은 백엔드**로 쓰기 위해, refresh 토큰을
어떻게 주고받을지 설정으로 고를 수 있게 했다. 이 템플릿의 동작(body)은 바뀌지 않는다.

### Added (추가)

- **`REFRESH_TOKEN_TRANSPORT=cookie|body`**, **`COOKIE_SECURE`** (`app/config.py`) — `cookie` 는 브라우저 SPA 용으로 백엔드가
  httpOnly 쿠키 `refresh_token`(`Path=/api/v1/auth`, `SameSite=lax`)을 직접 설정하고 응답의 `refresh_token` 은 `null` 이다.
  `body` 는 지금까지의 BFF 방식이다. 코드 기본값은 안전한 쪽인 `cookie` 이고, 이 템플릿의 `.env.example`·스캐폴드가 생성하는
  `backend/.env` 는 `body` 를 명시한다. cookie 방식 + `APP_ENV=production` 에서 `COOKIE_SECURE=false` 면 기동을 거부한다.
- **`tests/test_auth_cookie_transport.py`** — cookie 방식 23건(쿠키 속성·회전·재사용 감지·로그아웃·429·운영 fail-fast).

### Changed (변경)

- `TokenResponse.refresh_token` 은 `str | None` 이다(cookie 방식에서 `null`). body 방식에서는 항상 채워진다.
- ⚠️ 직접 작성한 운영 `.env` 에 `REFRESH_TOKEN_TRANSPORT=body` 가 없으면 cookie 방식으로 동작해 로그인이 실패한다 — 추가할 것.
- `ARCHITECTURE.md` §9 에 전달 방식 절, §17 환경변수 표에 두 항목을 추가했다.

## 2026-10-02 — 스택 최신화(FastAPI 0.142·SQLAlchemy 2.1·Next 16.3.8)

### Changed (변경)

- **백엔드 의존성 상향** — fastapi 0.142.2, uvicorn 0.54.0, **sqlalchemy 2.1.1(마이너)**, PyJWT 2.15.1,
  ruff 0.16.9. 나머지(alembic 1.20.0·psycopg2-binary 2.9.13·pydantic 2.13.5·pydantic-settings 2.15.0·
  bcrypt 5.0.0·python-multipart 0.0.32·httpx2 2.13.1·pytest 9.1.1)는 이미 최신이라 그대로다.
  SQLAlchemy 2.1 상향에서 앱 코드 수정은 필요 없었다(`-W error::DeprecationWarning` 으로 pytest 통과).
- **프론트엔드 의존성 상향** — next·eslint-config-next 16.3.8, vitest 5.0.3, @types/node 24.19.0(24 계열 유지),
  packageManager pnpm 11.28.3(11 계열 유지), `pnpm-lock.yaml` 재생성. react·react-dom 은 19.3.0 그대로라
  `eslint.config.mjs` 의 `settings.react.version` 은 바꾸지 않았다. **TypeScript 는 `~6.0.3` 유지**(TS 7 금지 —
  stack-versions §3).
- **vite 는 `^8.3.1` 로 핀** — 최신 8.3.2 는 배포 후 24시간이 지나지 않아 pnpm 11 의 `minimum-release-age`
  에 걸린다(템플릿 오염 방지). 다음 상향 때 올린다.
- 검증: 임시 스캐폴드 → 백엔드 ruff·pytest 60개 → Alembic PostgreSQL 16 왕복(upgrade→check→downgrade→upgrade→check)
  → 프론트 lint·typecheck·vitest 29개·build 끝-대-끝 통과. `pnpm-workspace.yaml` 자동 삽입 없음을 확인했다.

### Fixed (수정)

- **`alembic.ini` 에 `path_separator = os` 추가** — 없으면 Alembic 이 `prepend_sys_path` 를 레거시 방식으로
  쪼개며 DeprecationWarning 을 냈다(`-W error` 검증에서 드러남). stack-versions §3 에 SQLAlchemy 2.1·Alembic
  항목을 추가했다.

## 2026-10-02 — 기본 문서 세트 정리 (AGENTS.md 도입, 문서 루트 배치)

생성 프로젝트의 기준 문서 6종을 골격 루트에 두고, `docs/` 는 프로젝트 고유 문서(PRD·유저 플로우·기획서 등) 전용으로 비웠다.
네 형제 템플릿(react·nextjs·nuxt·svelte)이 같은 구성을 갖는다.

```
skeleton/
├── README.md  AGENTS.md  CLAUDE.md  ARCHITECTURE.md  DESIGN.md  PLAN.md
└── docs/README.md   # 프로젝트 고유 문서 안내
```

### Changed (변경)

- **`docs/architecture.md` → `ARCHITECTURE.md`** (골격 루트) — 대문자로 개명하고 저장소 안의 모든 참조와 §3 구조도를 갱신했다.
- **`DESIGN.md` (템플릿 루트) → `skeleton/DESIGN.md`** — 생성 프로젝트는 `-Design`/`-NoDesign` 과 무관하게 항상 `DESIGN.md` 를 받는다.
  두 옵션은 이제 `@theme` 주입 여부만 결정하며, 스캐폴드의 별도 복사 단계(`docs/DESIGN.md`)는 제거했다.
- **`CLAUDE.md` → `AGENTS.md`** — 에이전트 공통 지침의 원본을 `AGENTS.md` 로 옮겼다(`git mv`, 이력 유지).
  새 `CLAUDE.md` 는 `@AGENTS.md` 를 import 하고 Claude Code 전용 내용만 둔다. Claude Code 는 `CLAUDE.md` 가 있으면
  `AGENTS.md` 를 스스로 읽지 않으므로, import 없이 두 파일을 따로 두면 규칙이 갈라진다.

### Added (추가)

- **`docs/README.md`** — `docs/` 의 용도(프로젝트 고유 문서)와 루트 기준 문서 목록을 안내한다. 빈 폴더가 git 에 남도록 하는 역할도 한다.

## 2026-09-25 — 인증 가드 `middleware.ts` → `proxy.ts` 전환, 스킬 정정

### Changed (변경)

- **`frontend/middleware.ts` → `frontend/proxy.ts`** — Next 16 에서 `middleware` 파일 규약이 deprecated 되고
  `proxy` 로 이름이 바뀐 데 따른 전환이다(export 함수도 `proxy`). 동작은 그대로이며 `next build` 의
  deprecated 경고가 사라졌다. proxy 는 Node.js 런타임에서 돌기 때문에 "Edge 번들 오염"을 근거로 삼던
  주석·문서를 고쳤다. `lib/session-cookie.ts` 의 의존성 0 규칙은 유지한다 — 이제 근거는
  proxy·Vitest 가 함께 쓴다는 점이다. `docs/architecture.md`·스킬·README·`CLAUDE.md` 를 동기화했고,
  `PLAN.md` 의 전환 TODO 는 완료되어 삭제했다.
- 검증: 임시 스캐폴드 → lint·typecheck·vitest 29개·build(경고 없음) 통과. `next start` + 가짜 백엔드로
  쿠키 없음 307(query 보존)·`/login` 200·refresh 성공 시 쿠키 회전 후 통과·refresh 401 시 쿠키 파기·
  백엔드 다운 시 쿠키 보존 리다이렉트를 확인했다.

### Fixed (수정)

- **스킬 정정 (prompt-audit)** — `stack-versions` 가 프론트 테스트를 2개로 적던 것을 실제 4개로 맞췄다.
  `add-backend-domain` 예시의 미사용 `Integer` import(ruff F401)를 제거했다. `add-frontend-feature` 에서는
  삭제된 SPA 판 비교의 잔재 문구를 정리하고, 트리거 설명(description)에 있던 금지 규칙을 뺐고(본문에 이미 있다),
  중복된 ⛔ 줄은 이유를 붙인 한 문장으로 합쳤다. `pr-workflow` 의 push 전 검증 명령에 macOS/Linux 판을 추가했다.

## 2026-09-24 — 스택 최신화(FastAPI 0.141·Next 16.3.6)와 스캐폴드 복사·치환 결함 수정

### Changed (변경)

- **백엔드 의존성 일괄 상향** — fastapi 0.141.1, uvicorn 0.53.0, sqlalchemy 2.0.54, alembic 1.20.0,
  psycopg2-binary 2.9.13, pydantic 2.13.5, pydantic-settings 2.15.0, PyJWT 2.15.0, **bcrypt 5.0.0(메이저)**,
  httpx2 2.13.1, ruff 0.16.8. bcrypt 5 에서도 타이밍 방어용 더미 해시가 실 bcrypt 라운드를 소모하는 것을
  실측·테스트로 확인했다. ruff 0.16 의 UP042 에 따라 `UserRole` 을 `enum.StrEnum` 으로 전환했다.
- **프론트엔드 의존성 일괄 상향** — next·eslint-config-next 16.3.6, react·react-dom 19.3.0,
  **eslint 10(메이저)**, **vitest 5(메이저)**, vite 8.3, @vitejs/plugin-react 6.1.1, jsdom 30.1.1,
  testing-library 계열, packageManager pnpm 11.27.1(11 계열 유지 — 12 상향은 별도 결정).
  ESLint 10 이 제거한 API 를 eslint-plugin-react 가 아직 호출하는 문제는 `settings.react.version`
  명시로 우회했다(stack-versions §3).
- **TypeScript 는 6.0.3 유지** — typescript-eslint 8.x 가 TS 7.0 을 하드 거부한다
  (peer `<6.1`, TS 7.1+ 지원은 typescript-eslint#10940). eslint-config-next 의 직접 의존이라 우회
  불가하므로, 지원이 풀린 뒤 stack-versions §5 절차로 상향한다.
- 검증: 임시 스캐폴드 생성 → 백엔드 ruff·pytest 60개 → 프론트 lint·typecheck·vitest 29개·build
  끝-대-끝 통과. Alembic 은 로컬 PostgreSQL 왕복(upgrade→check→downgrade)까지 확인.

### Fixed (수정)

- **스캐폴드가 "토큰 치환" 에서 사실상 멈추던 결함** — 원인 두 가지를 모두 제거했다.
  (1) 템플릿 저장소의 `skeleton/` 안에 남은 gitignore 산출물(node_modules·.venv·.next, 수백 MB)을
  `cp -R`/`Copy-Item` 이 통째로 복사했고, 치환 대상 제외 목록에 `.next` 가 없어 수 MB 빌드 산출물에
  문자열 치환이 걸렸다 → 복사를 `tar --exclude`(sh)/`robocopy /XD /XF`(ps1) 로 바꿔 산출물과 실제
  `.env`(SECRET_KEY 유출 방지)를 원천 제외하고, 치환 제외 목록도 보강했다.
  (2) macOS 기본 bash 3.2 의 `${var//…}` 가 UTF-8 한국어 대용량 문서에서 제곱 시간으로 동작해
  75KB 문서 하나에 49초가 걸렸다 → 치환을 python3 단일 패스 바이트 치환으로 교체했다(전체 실행
  50초+ → 1초 미만).

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
