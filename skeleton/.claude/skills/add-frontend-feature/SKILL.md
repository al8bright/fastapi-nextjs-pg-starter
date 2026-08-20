---
name: add-frontend-feature
description: __PROJECT_NAME__ 프론트엔드(Next.js App Router)에 기능·페이지·데이터 조회/변경을 추가할 때 사용. 서버 컴포넌트 직접 fetch + Server Action + httpOnly 쿠키 세션 표준(lib/types.ts → lib/server/<domain>.ts → app/<route>/page.tsx → lib/actions/<domain>.ts)과 middleware 보호 라우트를 architecture.md §13·§14 기준으로 안내한다. ⛔ axios·React Query·Zustand·localStorage 는 쓰지 않는다.
---

# 프론트엔드 기능 추가

표준 스택: **Next.js App Router + React Server Components + Server Actions** (architecture.md §13). 패키지 매니저는 **pnpm**(⛔ npm 금지).

> **경계 규칙 — 이 스캐폴드의 전제다(§13).**
> 브라우저는 **Next 하고만** 통신한다(세션은 httpOnly 쿠키, JS 로 못 읽는다).
> FastAPI 는 **Next 서버**만 호출한다(`Authorization: Bearer <JWT>`).
> ⛔ **브라우저에서 FastAPI 직접 호출 금지.** ⛔ axios · React Query · Zustand · `localStorage` 전부 안 쓴다.
> ⛔ `app/api/**/route.ts` 를 습관적으로 만들지 마라 — 브라우저가 FastAPI 를 부르지 않으므로 BFF 엔드포인트가 필요 없다. 꼭 필요하다고 판단되면 이유를 남기고 확인받는다.

## 순서

1. **타입** `frontend/lib/types.ts`
   - 백엔드 `backend/app/schemas/<domain>.py` 와 **동기화**한다. 유니온은 리터럴로.
   - 도메인이 커지면 `lib/types.ts` 에 도메인별 블록으로 모아 둔다 — 타입은 서버·클라이언트 양쪽에서 import 하므로 `server-only` 모듈에 두지 않는다.
   ```ts
   export interface Event {
     id: number
     title: string
     status: "active" | "closed"   // 백엔드 스키마와 동기화
   }

   export interface EventCreate {
     title: string
     status: "active" | "closed"
   }
   ```

2. **서버 데이터 접근** `frontend/lib/server/<domain>.ts` — **서버 전용**
   - 공용 fetch 래퍼 `fastapiFetch<T>({ path, method, body, token })` 를 import 해서 쓴다. baseURL(`FASTAPI_URL`)·`cache: "no-store"`·에러 정규화(`FastapiError`)는 래퍼가 담당한다. ⛔ 여기서 `fetch` 를 직접 조립하지 말 것. `body` 는 **객체 그대로** 넘긴다(래퍼가 직렬화한다).
   - 파일 첫 줄의 `import "server-only"` 로 **클라이언트 번들 유입을 차단**한다. 실수로 `'use client'` 컴포넌트가 import 하면 빌드가 깨져서 바로 잡힌다.
   ```ts
   import "server-only"
   import { fastapiFetch } from "@/lib/server/fastapi"
   import { getSessionToken } from "@/lib/session"
   import type { Event, EventCreate } from "@/lib/types"

   export async function listEvents(): Promise<Event[]> {
     const token = await getSessionToken()          // ★ Bearer 는 호출부가 넘긴다
     return fastapiFetch<Event[]>({ path: "/events", token })
   }

   export async function createEvent(data: EventCreate): Promise<Event> {
     const token = await getSessionToken()
     return fastapiFetch<Event>({ path: "/events", method: "POST", body: data, token })
   }
   ```
   - ⚠️ 래퍼는 쿠키를 읽지 않는다 — `lib/session.ts` 가 래퍼를 import 하므로 반대 방향은 **순환 의존**이 된다. 보호 API 는 위처럼 `getSessionToken()` 결과를 넘긴다(공개 API 는 `token` 생략).

3. **화면** `frontend/app/<route>/page.tsx` — **서버 컴포넌트**
   - 데이터는 `page.tsx` 에서 **직접 `await`** 한다. 이게 이 판의 기본 데이터 로딩 방식이다.
   - ⛔ **`useEffect` + fetch 로 서버 데이터를 가져오지 마라.** ⛔ 브라우저에서 FastAPI 직접 호출 금지.
   - 로그인 사용자가 필요하면 `getSessionUser("<이 페이지 경로>")` 를 부른다 — 서버 컴포넌트는 자기 URL 을 모르므로 복귀 경로를 직접 넘긴다. 401 이면 함수가 `/login?next=…` 로 보내고, 백엔드 장애면 `null` 을 준다(⛔ 두 경우를 같은 문구로 뭉뚱그리지 말 것).
   - ⚠️ **`searchParams`·`params` 는 Promise 다.** `await` 없이 프로퍼티를 읽으면 예외도 없이 **조용히 `undefined`** 가 된다.
   ```tsx
   import { getSessionUser } from "@/lib/session"
   import { listEvents } from "@/lib/server/events"

   export default async function EventsPage({
     searchParams,
   }: {
     searchParams: Promise<Record<string, string | string[] | undefined>>
   }) {
     const params = await searchParams          // ★ await 없이 params.q 를 읽으면 undefined
     const user = await getSessionUser("/events")
     const events = await listEvents()
     return (
       <ul className="divide-y divide-outline-variant">
         {events.map(e => <li key={e.id} className="py-2 text-on-surface">{e.title}</li>)}
       </ul>
     )
   }
   ```
   - 느린 조회는 `<Suspense fallback={…}>` 로 감싼 **async 하위 컴포넌트**로 떼어낸다(`app/landing/page.tsx` 가 이 패턴이다). 클라이언트 로딩 상태를 만들지 않는다.
   - 상호작용(입력·토글·낙관적 UI)이 필요한 **조각만** `frontend/components/<Name>.tsx` 로 떼어내 첫 줄에 `'use client'` 를 붙인다. 페이지 전체를 클라이언트 컴포넌트로 만들지 말 것 — 그 순간 서버 렌더링 이점이 사라진다.
   - 컴포넌트 파일명 = 컴포넌트명, `PascalCase.tsx`, default export.
   - 클라이언트 상태는 **지역 `useState`** 로 충분하다. 전역 스토어를 새로 도입하지 않는다 — 세션의 유일한 출처는 쿠키다.

4. **변경(mutation)** `frontend/lib/actions/<domain>.ts` — **Server Action**
   - 파일 첫 줄에 `'use server'`. 폼 제출·삭제·상태 변경은 전부 여기로 모은다.
   - 시그니처는 **`(prevState, formData) => Promise<State>`** 다. 성공하면 `revalidatePath()` 로 서버 컴포넌트 캐시를 무효화하고, 화면을 옮겨야 하면 `redirect()` 한다.
   - 실패는 **던지지 말고** 폼이 렌더할 수 있는 상태 객체로 돌려준다(`{ error: "..." }`). 문구는 `fastapiErrorMessage(error)` 로 만든다 — 원인별 분기가 이미 들어 있다.
   - ⛔ **`"use server"` 파일은 async 함수만 export 할 수 있다.** 폼 초기 상태 같은 **상수를 export 하면 빌드가 깨진다** → 클라이언트 컴포넌트 쪽에 둔다(`components/LoginForm.tsx` 가 그렇게 한다). 타입 export 는 컴파일 시 지워지므로 허용된다.
   - ⚠️ **`redirect()` 는 `NEXT_REDIRECT` 예외를 던져 동작한다.** `try` 안에서 부르면 catch 가 삼켜 "저장은 됐는데 화면이 안 넘어가는" 버그가 된다 — 반드시 `try/catch` **밖에서** 호출한다.
   ```ts
   "use server"

   import { revalidatePath } from "next/cache"
   import { redirect } from "next/navigation"
   import { createEvent } from "@/lib/server/events"
   import { fastapiErrorMessage } from "@/lib/server/fastapi"

   /** 타입 export 는 허용. ⛔ 상수(INITIAL_STATE)는 여기에 두지 마라. */
   export interface EventFormState {
     error: string | null
   }

   export async function createEventAction(
     _prev: EventFormState,
     formData: FormData,
   ): Promise<EventFormState> {
     const title = String(formData.get("title") ?? "").trim()
     if (!title) return { error: "제목을 입력하세요." }

     try {
       await createEvent({ title, status: "active" })
     } catch (error) {
       return { error: fastapiErrorMessage(error) }
     }

     revalidatePath("/events")
     redirect("/events")        // ⚠️ try 블록 밖 — 안에서 부르면 catch 가 삼킨다
   }
   ```
   - 폼은 클라이언트 컴포넌트에서 `useActionState` 로 연결한다. 반환값은 **`[state, formAction, isPending]` 3튜플**이다. `<form action={formAction}>` 이므로 `onSubmit`·`preventDefault` 가 필요 없다.
   ```tsx
   "use client"

   import { useActionState } from "react"
   import { createEventAction, type EventFormState } from "@/lib/actions/events"

   // ⛔ Server Action 파일이 아니라 여기에 둔다 ("use server" 는 상수 export 불가).
   const INITIAL_STATE: EventFormState = { error: null }

   export default function EventForm() {
     const [state, formAction, isPending] = useActionState(createEventAction, INITIAL_STATE)
     return (
       <form action={formAction} className="space-y-2">
         <input name="title" className="w-full rounded border border-outline-variant px-3 py-2" />
         {state.error && (
           <p role="alert" className="rounded bg-error-container px-3 py-2 text-on-error-container">{state.error}</p>
         )}
         <button type="submit" disabled={isPending} className="rounded bg-primary px-4 py-2 text-on-primary">
           {isPending ? "저장 중…" : "저장"}
         </button>
       </form>
     )
   }
   ```
   - 폼이 없는 변경(버튼 하나로 끝나는 삭제·로그아웃)은 `useTransition()` + `startTransition(someAction)` 으로 부른다(`components/LogoutButton.tsx`).
   - ⛔ Server Action 을 클라이언트에서 `fetch` 로 흉내내지 말 것. ⛔ 서버 컴포넌트 렌더 중에 쿠키를 **쓰지** 마라 — 쿠키 쓰기는 Server Action(또는 미들웨어)에서만 가능하다(§14).

5. **보호 라우트** `frontend/middleware.ts`
   - matcher 는 **제외 목록(negative lookahead)** 이다 — 새 라우트는 기본적으로 보호된다. 페이지마다 가드를 손으로 넣지 않는다.
   - 세션 쿠키(`__PROJECT_SNAKE___session`)의 **존재만** 확인하고, 없으면 `/login?next=<pathname+search>` 로 보낸다. 서명 검증·만료 확인은 하지 않는다(실제 판정은 FastAPI 가 한다, §14).
   - ⛔ matcher 에서 `/login`·`_next/static`·`_next/image`·**확장자가 있는 정적 파일**을 빼지 않으면 무한 리다이렉트다(`/login` 요청 → 쿠키 없음 → `/login` → …).
   ```ts
   export const config = {
     //          login = 로그인 화면 자신 · _next/static|image = 빌드 산출물·이미지 최적화
     //          `.*\.` = favicon.ico 처럼 확장자가 있는 public 정적 파일
     matcher: ["/((?!login|_next/static|_next/image|.*\\.).*)"],
   }
   ```
   - 공개 페이지를 늘리려면 이 정규식의 제외 목록에 추가한다(예: `(?!login|signup|_next/…)`). ⛔ 보호 경로를 나열하는 방식으로 바꾸면 새 라우트가 조용히 무방비가 된다.
   - ⚠️ **오픈 리다이렉트 방지**: `next` 파라미터는 그대로 쓰면 취약점이 된다. `lib/safe-redirect.ts` 로 **내부 경로만** 통과시킨다 — `/` 로 시작하고, `//` 로 시작하지 않고, 스킴(`http:`·`javascript:` 등)이 없는 것만. 그 밖에는 `/` 로 떨어뜨린다. 이 검증 함수에는 **테스트를 반드시 붙인다.**

6. **테스트** `frontend/` — Vitest (`pnpm test`)
   - 대상 파일 옆에 `*.test.ts(x)`(`vitest.config.ts` 의 include 는 `{app,components,lib}/**/*.test.{ts,tsx}`). 우선순위는 **`lib/` 의 순수 함수**(특히 `safe-redirect`, 에러 메시지 매핑, 타입 가드)와 **클라이언트 컴포넌트**(폼이 Action 에 넘기는 FormData, 오류 표시, 대기 중 비활성)다. 스켈레톤의 예시는 `lib/safe-redirect.test.ts` 와 `components/LoginForm.test.tsx` 둘뿐이다.
   - ⛔ `lib/server/*`·`lib/session.ts`·`lib/actions/*` 는 `server-only` 를 끌고 와 러너에서 **로드조차 되지 않는다.** 클라이언트 컴포넌트 테스트는 Action 모듈을 통째로 `vi.mock` 해서 끊는다(`vi.mock("@/lib/actions/auth", …)`).
   - ⚠️ **서버 컴포넌트와 Server Action 은 러너 밖의 Next 런타임(요청 컨텍스트·`cookies()`·캐시)에 의존한다.** **억지로 테스트를 만들지 마라** — 무리하게 모킹한 테스트는 구현을 고정할 뿐 회귀를 못 잡는다. 대신 로직을 순수 함수로 뽑아 그것을 테스트하고, 통합 확인은 `pnpm build` + 수동 동작 확인으로 대신한다.
   - `tsc --noEmit`·`eslint` 가 못 잡는 **런타임 동작**을 고정한다 — §14 가 ⛔ 로 규정한 것들(오픈 리다이렉트 통과, 세션 없는 접근, 로그인 실패 문구)이 1순위다.

## 인증/세션 (§14)

- 세션은 **httpOnly 쿠키** `__PROJECT_SNAKE___session` 하나뿐이다. ⛔ `localStorage`·전역 스토어에 토큰을 복제하지 마라 — 클라이언트에서는 읽을 수 없는 게 정상이다.
- 쿠키 read/set/clear 는 `lib/session.ts` 한 경로로만. 쓰기(set/delete)는 **Server Action·Route Handler 안에서만** 가능하다(서버 컴포넌트 렌더 중에는 예외가 난다).
- **`cookies()` 는 async 다** — `await` 한 store 에서 읽고 쓴다.
  ```ts
  // lib/session.ts
  import "server-only"
  import { cookies } from "next/headers"

  export const SESSION_COOKIE = "__PROJECT_SNAKE___session"

  export async function getSessionToken(): Promise<string | null> {
    const store = await cookies()
    return store.get(SESSION_COOKIE)?.value ?? null
  }
  ```
- 쿠키 속성은 `httpOnly` · `sameSite: "lax"` · `path: "/"` · `maxAge`(백엔드 `ACCESS_TOKEN_EXPIRE_MINUTES` 와 **수동 동기화** — `TokenResponse` 에 `expires_in` 이 없다) · **`secure` 는 production 에서만**이다. ⚠️ localhost(http)에서 `secure` 를 켜면 쿠키가 저장되지 않아 **로그인이 무한 루프**가 된다.
- 로그인: `LoginForm`(클라) → `loginAction` → `POST /auth/login`(JSON) → 응답의 `access_token` 을 httpOnly 쿠키에 저장 → `redirect(safeRedirect(next))` 로 원래 위치(없으면 `/`) 이동.
- 로그아웃: `LogoutButton`(클라) → `logoutAction` → 쿠키 삭제 → `/login` 이동. ⛔ 클라이언트에서 쿠키를 지우려 하지 마라(httpOnly 라 불가능하다).
- 사용자 정보는 **필요한 화면의 서버 컴포넌트에서 `getSessionUser("<현재경로>")` 로 그때 조회**한다. ⛔ 로그인 직후 사용자 정보를 미리 당겨와 전역에 심는 패턴 금지 — 중복 요청과 stale 세션의 원인이다.
- FastAPI 실패는 `lib/server/fastapi.ts` 가 `FastapiError`(`kind` = `network`/`unauthorized`/`validation`/`server`/`http`)로 정규화한다. **로그인 실패의 401** 은 폼 오류 메시지로 돌려주고(⛔ 로그아웃·리다이렉트 금지, 에러 메시지가 사라진다), **그 밖의 401**(만료·무효)은 `getSessionUser()` 가 `/login?next=<현재경로>` 로 보낸다. 백엔드 미기동·5xx 는 세션 문제가 아니므로 리다이렉트하지 않고 `null` 을 돌려준다.
- 오류 표시는 `error.kind` 로 구분한다(문구는 `fastapiErrorMessage()`). ⛔ 모든 실패를 자격증명 오류로 하드코딩 금지. 단 401 문구는 고정한다(계정 존재 여부 비노출).

## 스타일 (§15)

- Tailwind v4 CSS-first — `frontend/app/globals.css` 의 `@import "tailwindcss"` + `@theme`. 별도 `tailwind.config.js` 지양.
- Next 는 Vite 가 아니다. ⛔ `@tailwindcss/vite` 는 쓸 수 없다 — **`@tailwindcss/postcss` + `postcss.config.mjs`** 조합이다([stack-versions] 스킬 §3).
- 한글 기본 폰트 Pretendard(+ Noto Sans KR 폴백) 권장.
- 디자인 토큰 클래스(`bg-surface`, `text-on-surface`, `border-outline-variant`, `bg-primary`, `text-on-primary`, `bg-error-container` 등)를 쓰고 임의의 색 값을 새로 넣지 않는다.

## 설정

- FastAPI 주소는 **서버 전용 `FASTAPI_URL`** 이다. `frontend/.env` 로만 주입한다(⛔ 셸 환경변수 의존 금지).
- ⛔ **`NEXT_PUBLIC_` 남용 금지.** 접두를 붙이는 순간 값이 **클라이언트 번들에 그대로 박힌다.** FastAPI 주소·토큰·내부 호스트에는 절대 붙이지 마라. 브라우저가 진짜로 읽어야 하는 공개 값에만 쓴다.
- 배포는 **Node 런타임**이다(`next build` → `next start`). 정적 호스팅 가정으로 코드를 짜지 말 것.

## 마무리

- **`pnpm lint`(경고 0) + `pnpm typecheck` + `pnpm test` + 동작 확인**을 통과한 뒤에만 커밋한다. 서버/클라이언트 경계 위반은 `pnpm build` 에서야 드러나는 경우가 있으니, 경계를 건드린 변경이면 빌드까지 돌린다.
- 커밋/PR은 [pr-workflow] 스킬 참조.
