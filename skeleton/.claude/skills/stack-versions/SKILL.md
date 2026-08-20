---
name: stack-versions
description: __PROJECT_NAME__ 의 고정 스택 버전과 버전별 주의사항(gotcha)을 정의한다. 의존성 추가·업그레이드, pnpm/Next/tsconfig/PostCSS/테스트 설정 작업, 또는 버전에 따라 동작이 달라지는 코드를 작성·디버깅할 때 사용. 정확한 버전의 출처 파일과 pnpm 11(allowBuilds·minimum-release-age)/Next App Router 서버·클라이언트 경계/Server Actions·cookies()/middleware 무한 리다이렉트/Tailwind v4 PostCSS/TypeScript·Vitest 등 버전별 함정, 업그레이드 검증 절차를 안내한다.
---

# 스택 버전 & 버전별 주의

## 1. 정확한 버전의 출처 (SSOT) — 항상 여기서 확인
- **런타임 최소**: `scripts/versions.env`
- **백엔드**: `backend/requirements.txt` (`==` 정확 핀)
- **프론트**: `frontend/package.json` (런타임 4종은 `==` 정확 고정, TypeScript 는 `~`, 그 외 도구는 `^`) + `frontend/pnpm-lock.yaml` (실제 해석 버전 — 커밋 대상)

> ⛔ **패키지 버전을 이 파일에 복사해 두지 않는다.** 값을 세 곳(SSOT·README·이 스킬)에 두면 반드시 드리프트가 난다. 값이 필요하면 위 파일을 읽는다.

## 2. 고정 방식 — 영역마다 다르다

| 영역 | 방식 | 값 | 출처 |
|---|---|---|---|
| 런타임 하한 | 이상이면 기존 설치본 재사용 | Python `≥3.13` · Node `≥24` · pnpm `≥11` | `scripts/versions.env` |
| 런타임 설치 핀 | pyenv·fnm·corepack 이 설치·활성화 | `.python-version`(정확) · `.nvmrc`(major) · `packageManager`(정확) | 각 파일 |
| 백엔드 | `==` **정확 고정** — 재현성 우선 | 13개 | `backend/requirements.txt` |
| 프론트 | next·react·react-dom·eslint-config-next 는 `==`, TypeScript 는 `~`, 그 외 도구는 `^` | Next·React·Tailwind v4 + 린트/테스트 도구 | `frontend/package.json` + `pnpm-lock.yaml` |
| PostgreSQL | 고정 없음 | 14+ 권장, CI 는 `postgres:16` | — |

패키지별 **전체** 목록은 `frontend/package.json` 과 `pnpm-lock.yaml` 이 유일한 출처다. `README.md` 의 "기술 스택과 버전" 표는 주요 항목만 추린 요약이다.

주의할 표기 두 가지 — `^0.x` 는 minor 까지 고정된다(`^0.5.3` = `>=0.5.3 <0.6.0`). 0.x 대 패키지를 추가할 땐 이 점을 의식하고 핀한다. TypeScript 만 `~` 인 이유는 minor 상승이 타입 검사 동작을 바꿔 빌드를 깨뜨릴 수 있어서다.

## 3. ⚠️ 버전별 함정 (코드·설정 작성 시 반드시)

### pnpm 10+ (현재 11)
- 의존성 **빌드 스크립트가 기본 차단**된다. 허용은 `frontend/pnpm-workspace.yaml` 의 **`allowBuilds` 맵**(`패키지: true`)으로 한다. 현재 허용 목록은 그 파일에서 확인한다.
- ⛔ pnpm 10 의 **`onlyBuiltDependencies` 리스트는 pnpm 11 에서 무시된다.** 이 서술은 pnpm 10 기준 문서와 정반대이므로 주의할 것. 리스트로 두면 `ERR_PNPM_IGNORED_BUILDS` 가 그대로 발생할 뿐 아니라, **pnpm 이 `pnpm-workspace.yaml` 에 `allowBuilds` 항목을 자동으로 써 넣어 템플릿 파일을 오염시킨다.**
- ⚠️ **`minimum-release-age` 기본값이 24시간**이다. 배포된 지 24시간이 안 된 버전을 `^` 로 핀하면 설치가 막히고 pnpm 이 `minimumReleaseAgeExclude:` 를 자동 삽입한다(역시 템플릿 오염). → **배포 후 24시간이 지난 버전만 핀한다.** 갓 나온 버전을 급히 올리지 말 것.
- `package.json` 의 `packageManager` 필드로 pnpm 버전 고정(corepack).

### Next.js (App Router) — `16.3`
- **App Router 전용**이다(`app/**`). Pages Router 기준 문서·예제를 그대로 가져오지 말 것.
- **서버 컴포넌트가 기본**이다. `'use client'` 를 붙인 파일부터 아래로 클라이언트 번들에 들어간다. `'use server'` 는 그 반대(Server Action 파일). 두 지시어는 **파일 첫 줄**에 있어야 한다.
  - 훅(`useState`/`useEffect`)·브라우저 API 는 클라이언트 컴포넌트에서만 쓸 수 있다. `async` 컴포넌트는 서버 컴포넌트에서만 가능하다.
  - 서버 → 클라이언트로 넘기는 props 는 **직렬화 가능한 값**만 된다(함수·클래스 인스턴스 불가).
- ⛔ **서버 전용 모듈이 클라이언트 번들로 새는 문제**가 이 스택의 1순위 사고다. FastAPI 호출·세션·비밀값을 다루는 모듈은 첫 줄에 **`import "server-only"`** 를 넣어라 — 클라이언트가 import 하는 순간 빌드가 실패해 즉시 잡힌다. 없으면 조용히 번들에 섞여 나간다.
- ⛔ **`NEXT_PUBLIC_` 을 붙이면 그 값은 빌드 시 클라이언트 번들에 그대로 박힌다.** `FASTAPI_URL` 같은 서버 전용 값에 절대 붙이지 마라. 브라우저가 진짜로 읽어야 하는 공개 값에만 쓴다.
- 배포는 **Node 런타임**이다(`next build` → `next start`). ⛔ 정적 호스팅으로는 서버 컴포넌트·Server Action·`middleware.ts` 가 동작하지 않는다. dev 포트는 **3000**. `next.config.ts` 는 `productionBrowserSourceMaps: false` 하나만 둔다 — ⛔ `output: "export"` 를 켜면 위 세 가지가 전부 죽는다.
- 번들러는 Vite 가 아니다(Turbopack/webpack). ⛔ Vite 플러그인·`import.meta.env`·`vite.config.ts` 전제를 끌어오지 말 것. (`vitest.config.ts` 는 **테스트 전용**이며 빌드와 무관하다.)

### Server Actions / 쿠키
- **`cookies()`(`next/headers`)는 async 다** — `const store = await cookies()` 로 받아서 읽고 쓴다.
- **페이지의 `searchParams`·`params` 도 Promise 다** — `const params = await searchParams`. ⚠️ `await` 없이 프로퍼티를 읽으면 **에러 없이 조용히 `undefined`** 가 된다(`?next=` 가 항상 비어 복귀 경로가 `/` 로 떨어지는 식). 타입은 `Promise<Record<string, string | string[] | undefined>>` 이고, 같은 키가 여러 번 오면 **배열**이다.
- 쿠키 **쓰기(set/delete)는 Server Action·Route Handler·미들웨어에서만** 가능하다. 서버 컴포넌트 렌더 중에는 읽기만 된다 — 렌더 중 쓰기를 시도하면 런타임 에러다.
- 세션 쿠키 속성은 `httpOnly` · `sameSite: "lax"` · `path: "/"` · `maxAge` · **`secure` 는 `NODE_ENV === "production"` 일 때만**이다. ⚠️ localhost(http)에서 `secure` 를 켜면 쿠키가 저장되지 않아 **로그인이 무한 루프**가 된다. `maxAge` 는 백엔드 `ACCESS_TOKEN_EXPIRE_MINUTES` 와 **수동 동기화** — 백엔드 `TokenResponse` 에 `expires_in` 이 없다.
- Server Action 시그니처는 **`(prevState, formData) => Promise<State>`**, 폼 훅은 **`const [state, formAction, isPending] = useActionState(action, INITIAL_STATE)`**(3튜플)다. 액션은 **직렬화 가능한 상태 객체를 반환**하게 하고, 예외를 던져 500 으로 흘리지 마라.
- ⛔ **`"use server"` 파일은 async 함수만 export 할 수 있다.** 폼 초기 상태 같은 **상수를 export 하면 빌드가 깨진다** — 클라이언트 컴포넌트 쪽에 두고(스켈레톤은 `components/LoginForm.tsx` 의 `INITIAL_STATE`), 액션 파일에서는 **타입만** 내보낸다(타입 export 는 컴파일 시 지워진다).
- 변경 후에는 **`revalidatePath()`(또는 `revalidateTag()`)** 로 서버 렌더 캐시를 무효화한다. 무효화하지 않으면 이전 데이터가 그대로 보인다. 화면 이동은 **`redirect()`**.
  - ⚠️ `redirect()` 는 **`NEXT_REDIRECT` 예외를 던져** 흐름을 끊는다. `try` 블록 **안에서** 호출하면 catch 가 삼켜 "처리는 됐는데 화면이 안 넘어가는" 버그가 된다 — try/catch **밖에서** 호출할 것.
- 서버 전용 fetch 래퍼는 **`cache: "no-store"` 고정**이다. ⛔ 사용자별 응답(`/auth/me`)을 Next Data Cache 에 올리면 **다른 사용자에게 캐시된 응답이 나간다.**
- ⛔ Server Action 을 클라이언트에서 `fetch` 로 흉내내지 마라. 폼은 `<form action={...}>` 으로 연결한다. 폼이 없는 변경은 `useTransition()` + `startTransition(action)`.

### `middleware.ts`
- 인증 가드는 루트 `middleware.ts` 한 곳이다. `export const config = { matcher: [...] }` 로 대상을 정하고, 세션 쿠키가 없으면 `/login?next=<pathname+search>` 로 보낸다(쿠키 **존재만** 확인 — 서명·만료 검증은 FastAPI 몫이다).
- ⛔ **matcher 에서 `/login` 과 정적 자산을 제외하지 않으면 무한 리다이렉트**가 난다(로그인 페이지 자체가 다시 가드에 걸린다). 스켈레톤의 실제 값은 **제외 목록**이다:
  ```ts
  matcher: ["/((?!login(?:/|$)|_next/|.*\\.(?:ico|png|jpg|jpeg|gif|svg|webp|avif|css|js|map|txt|xml|json|webmanifest|woff2?)$).*)"]
  ```
  `login`(로그인 화면) · `_next/static`·`_next/image`(빌드 산출물·이미지 최적화) · `.*\.`(favicon.ico 처럼 **확장자가 있는** public 정적 파일)을 빼놓은 것이다. 공개 경로를 늘릴 땐 이 제외 목록에 더한다 — ⛔ 보호 경로를 나열하는 방식으로 바꾸면 새 라우트가 조용히 무방비가 된다.
- ⚠️ **오픈 리다이렉트 방지**: `next` 파라미터를 그대로 `redirect()` 에 넣으면 외부 사이트로 유도할 수 있다. `lib/safe-redirect.ts` 로 **내부 경로만** 통과시킨다 — `/` 로 시작(이것만으로 `https:`·`javascript:` 스킴이 걸러진다)하고, 두 번째 문자가 `/`·`\` 가 아니며, 백슬래시·공백·제어문자가 없고, `/login` 자신이 아닌 것만. 그 외에는 `/` 로 떨어뜨리고(query·hash 는 보존), **이 검증 함수에는 테스트를 붙인다**(`lib/safe-redirect.test.ts`).
- 미들웨어는 요청마다 돈다. 무거운 작업(DB·외부 API 호출)을 넣지 말고 쿠키 존재 확인 수준으로 유지한다.

### Tailwind v4 + Next — `4.3`
- ⛔ **`@tailwindcss/vite` 는 쓸 수 없다.** Next 는 Vite 가 아니다. → **`@tailwindcss/postcss`** 플러그인 + **`postcss.config.mjs`** 조합이다.
- CSS-first 설정: `frontend/app/globals.css` 의 `@import "tailwindcss"` + `@theme { ... }`. ⛔ `tailwind.config.js` 를 새로 만들지 말 것.
- 전역 스타일은 `app/layout.tsx` 에서 `globals.css` 를 import 하는 경로 하나로만 들어온다.

### TypeScript / 테스트 — `6.0` · `4.1`
- 타입체크는 **`tsc --noEmit`**(`pnpm typecheck`)로 별도 실행한다. `next build` 도 타입을 보지만, 빠른 피드백은 `typecheck` 쪽이다. 린트(`eslint .`)와 역할이 다르니 **둘 다** 돌린다.
- 실측 `tsconfig.json`: `moduleResolution: "bundler"` · `plugins: [{ "name": "next" }]` · **`baseUrl` 없이 `paths` 만으로** `@/*` → 프로젝트 루트(⛔ deprecated 된 `baseUrl` 을 되살리지 말 것) · `types` 는 **설정하지 않는다**(설정하는 순간 목록에 없는 `@types/*` 가 전부 빠져 `node:path` 를 쓰는 `vitest.config.ts` 부터 깨진다).
- ⚠️ `next-env.d.ts` 는 **커밋하지 않는다**(빌드가 매번 생성). 이 파일이 없어도 `skipLibCheck` 덕에 `tsc --noEmit` 은 통과하므로, 생성 타입까지 보려면 **typecheck 뒤에 `next build` 까지** 돌려야 한다(CI 가 그렇게 한다).
- 테스트 러너는 **Vitest** + **`@vitejs/plugin-react`** + **jsdom** + Testing Library(`vitest.config.ts` · `vitest.setup.ts` · `pnpm test`). 테스트는 대상 파일 옆에 `*.test.ts(x)`. ⚠️ Vitest 는 tsconfig 의 `paths` 를 읽지 않으므로 `resolve.alias` 에 `@` 를 **다시 적어야** 한다.
- ⚠️ **서버 컴포넌트·Server Action·`middleware.ts` 는 Vitest 로 테스트하지 않는다.** jsdom 에는 RSC 런타임도 요청 컨텍스트(`cookies()`/`redirect()`)도 없고, `server-only` 를 import 하는 모듈(`lib/server/*`·`lib/session.ts`·`lib/actions/*`)은 러너에서 **로드조차 되지 않는다**. 모킹으로 통과시키면 "초록인데 실제로는 깨지는" 가짜 안전망이 된다. 실제로 덮은 범위는 **`lib/safe-redirect.test.ts`(순수 함수)와 `components/LoginForm.test.tsx`(클라이언트 폼 — Action 모듈은 `vi.mock`)** 둘뿐이고, 나머지는 `pnpm build` + 수동 동작 확인으로 대신한다.

### FastAPI 0.137 + Starlette 1.x
- TestClient 는 **httpx2** 를 쓴다(httpx 아님). `requirements.txt` 에 `httpx2`. ⛔ `httpx` 로 되돌리면 deprecation 경고.
- 서버↔서버 HTTP 클라이언트도 `httpx2`.

### Pydantic 2.x
- v2 API(`model_config`, `@field_validator`, `SettingsConfigDict`). ⛔ v1 패턴(`class Config`, `@validator`) 금지.

### 인증 / 린트·CI
- 자체 계정 비밀번호는 **bcrypt** 해시(`core/security` 의 `hash_password`/`verify_password`). JWT `sub` = user id.
- 프론트 린트는 **ESLint flat config**(`frontend/eslint.config.mjs`): `@eslint/js` recommended + **`eslint-config-next/core-web-vitals`** + **`eslint-config-next/typescript`**. ⚠️ `core-web-vitals` 만 넣으면 **타입스크립트 규칙이 하나도 켜지지 않아**(파서만 붙는다) `any`·미사용 변수를 못 잡는다 — `typescript` 진입점을 반드시 함께 넣는다. 이 계열의 eslint-config-next 는 flat config 배열을 그대로 export 하므로 `FlatCompat`(Next 15 시절 템플릿)로 감쌀 필요가 없다. ⚠️ **ESLint 본체 메이저는 `eslint-config-next` 가 요구하는 계열에 맞춘다** — 형제 저장소(React SPA 판)가 더 앞선 메이저를 써도 여기선 Next 쪽을 따른다. 실제 값은 `frontend/package.json`(§1).
- 백엔드 린트는 **ruff**(`backend/pyproject.toml`): FastAPI `Depends` 등은 **B008 예외**(`extend-immutable-calls`), `alembic/` 제외, line-length 120. 새 의존성으로 lint 가 깨지면 이 설정을 먼저 본다.
- **CI**(`.github/workflows/ci.yml`)가 push·PR(main) 마다 실행: `backend`(ruff → pytest(SQLite in-memory))는 **`ubuntu-latest`·`windows-latest` OS 매트릭스**로 돌려 OS 분기 버그를 잡고, `migrations`(**alembic upgrade head + alembic check**, postgres:16 서비스 컨테이너에 `DATABASE_URL` 주입)는 **ubuntu 전용 잡**으로 분리한다 — ⛔ 서비스 컨테이너는 Linux 러너에서만 뜨므로 매트릭스 잡에 `services:` 를 두면 Windows 잡이 시작조차 못 한다. `powershell-syntax` 잡은 Windows PowerShell 5.1 로 모든 `.ps1` 을 파싱하고 PS7 전용 토큰(`??`·`&&`·`||`·`?.`)을 거부한다. frontend 는 **`eslint` → `typecheck`(`tsc --noEmit`) → `test`(vitest) → `build`(`next build`)** 순으로 돈다. Python/Node 버전은 하드코딩 대신 **`python-version-file: .python-version` / `node-version-file: .nvmrc`** 로 읽으므로 버전 상향 시 핀 파일만 갱신하면 된다. 워크플로는 생성 프로젝트(루트)에서만 동작한다.
- frontend 는 **`pnpm-lock.yaml` 커밋 필수** — skeleton 에는 없고 scaffold 의 첫 `pnpm install` 이 생성하므로, **생성 프로젝트의 최초 커밋에 반드시 포함**시킨다. CI 환경(`CI=true`)의 pnpm 은 frozen-lockfile 이 기본이라 lockfile 이 없거나 `package.json` 과 어긋나면 설치가 실패한다. 의존성 변경 시 lockfile 도 함께 커밋한다.

## 4. 백엔드 핀 정책
- `requirements.txt` 는 **`==` 정확 핀, 재현성 우선**(architecture.md §2).
- 런타임 최소를 올린다고(예: 3.13) 핀을 자동으로 올리지 말 것 — **호환되면 유지**(현재 핀은 3.13 호환 확인됨).
- 핀 상향은 보안/기능 목적의 **의식적 결정**으로. FastAPI 는 "최신이 아닌 안정화된 마이너" 선호.

## 5. 업그레이드 검증 절차 (필수)
버전을 올릴 땐 추측 금지 — **임시 스캐폴드로 실제 검증한 뒤** 핀을 고정한다:
1. **템플릿 리포**(`fastapi-nextjs-pg-starter`)를 clone 한 곳에서 임시 스캐폴드를 만든다 —
   ⚠️ `scaffold.sh`/`scaffold.ps1` 은 템플릿 리포 루트에만 있고 **생성 프로젝트에는 복사되지 않는다**.
   - macOS/Linux: `./scaffold.sh --name tmp --target <스크래치경로> --skip-db --skip-install --no-design`
   - Windows: `.\scaffold.ps1 -Name tmp -Target <스크래치경로> -SkipDb -SkipInstall -NoDesign`
2. 백엔드: `python3 -m venv .venv` → `./.venv/bin/python -m pip install -r requirements.txt` → `./.venv/bin/python -m ruff check .` → `./.venv/bin/python -m pytest -q`
   - ⚠️ venv 를 만든 뒤 **venv 의 인터프리터를 명시**한다. 활성화 없이 `pip` 을 부르면 전역 pip 이 돈다.
   - Windows 는 `.\.venv\Scripts\python` 으로 바꿔 읽는다.
3. 프론트: `pnpm install` → `pnpm lint` → `pnpm typecheck` → `pnpm test` → `pnpm build`
   - ⚠️ 서버/클라이언트 경계 위반(서버 전용 모듈 유출 등)은 **`pnpm build` 에서야 드러난다.** 앞 단계가 통과했다고 건너뛰지 말 것.
4. 통과 시 핀 고정 후 **갱신할 곳을 모두**: SSOT 파일(`requirements.txt` 또는 `package.json` + `pnpm-lock.yaml`) + `README.md` 의 "기술 스택과 버전" 표 + 필요 시 `docs/architecture.md` + **이 스킬의 §3 버전별 함정**. 커밋은 [pr-workflow].
   - §2 표에는 개별 패키지 버전이 없으므로 갱신 대상이 아니다. 런타임 하한이나 고정 방식 자체를 바꿀 때만 손댄다.

> §5 의 1단계는 `-SkipDb -SkipInstall` 을 쓰지만, 이 옵션들은 DB 단계와 의존성 설치만 생략한다. **런타임 사전 검사와 bootstrap 선행 실행은 생략되지 않는다**(§20).
