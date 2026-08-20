import "server-only"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { FastapiError, fastapiFetch } from "@/lib/server/fastapi"
import { SESSION_COOKIE } from "@/lib/session-cookie"
import type { User } from "@/lib/types"

// 세션 = httpOnly 쿠키 단일 출처 (architecture.md §14).
// React SPA 판의 src/lib/auth.ts(localStorage) 에 대응한다. 차이가 핵심이다:
// 이 토큰은 **브라우저 JS 가 읽을 수 없다**. 따라서 XSS 로 토큰을 탈취당하지 않고,
// 대신 FastAPI 호출은 전부 서버(서버 컴포넌트 / Server Action)에서만 일어난다.

// 쿠키 이름은 middleware(Edge)도 써야 해서 의존성 없는 모듈에 두고 여기서 다시 내보낸다.
// (이 파일을 middleware 가 import 하면 server-only·next/headers 가 Edge 번들로 끌려온다)
export { SESSION_COOKIE } from "@/lib/session-cookie"

// 백엔드 ACCESS_TOKEN_EXPIRE_MINUTES(기본 30분)와 맞춘다.
// 쿠키가 토큰보다 오래 살면 middleware 는 통과시키는데 FastAPI 가 401 을 주는 구간이 생긴다.
const SESSION_MAX_AGE_SECONDS = 30 * 60

/** 현재 요청의 세션 토큰. 없으면 null. */
export async function getSessionToken(): Promise<string | null> {
  const store = await cookies()
  return store.get(SESSION_COOKIE)?.value ?? null
}

/**
 * 세션 시작. **Server Action 또는 Route Handler 안에서만** 호출할 수 있다 —
 * 서버 컴포넌트 렌더 중에는 응답 헤더가 이미 확정되어 Next 가 예외를 던진다.
 */
export async function setSessionToken(token: string): Promise<void> {
  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    // production 에서만 secure — localhost(http)에서 켜면 쿠키가 저장되지 않아 로그인이 무한 루프가 된다.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
}

/** 세션 종료. 마찬가지로 Server Action / Route Handler 전용이다. */
export async function clearSessionToken(): Promise<void> {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}

/**
 * 세션이 **실제로 유효한지** 확인한다. 리다이렉트하지 않고 boolean 만 돌려준다.
 *
 * ⚠️ 쿠키의 존재는 로그인 상태가 아니다. 쿠키는 살아 있는데 토큰만 무효인 구간이
 *    반드시 생긴다(SECRET_KEY 교체, 계정 비활성화·삭제, 만료, 시계 오차).
 *    그 구간에서 로그인 화면이 쿠키만 보고 보호 경로로 되돌려 보내면
 *    `/login ↔ 보호경로` 무한 리다이렉트가 되어 **사이트 전체가 잠긴다**
 *    (로그아웃 버튼도 보호 경로 안에 있어 탈출구가 없다).
 *    그래서 로그인 화면은 존재가 아니라 유효성으로 판단해야 한다.
 */
export async function hasValidSession(): Promise<boolean> {
  const token = await getSessionToken()
  if (!token) return false
  try {
    await fastapiFetch<User>({ path: "/auth/me", token })
    return true
  } catch {
    // 무효 토큰도 백엔드 장애도 로그인 폼을 보여준다.
    // 로그인에 성공하면 setSessionToken 이 낡은 쿠키를 덮어쓰므로 루프가 스스로 풀린다.
    return false
  }
}

/**
 * 현재 세션 사용자 (`GET /api/v1/auth/me`). React 판의 useMe() 에 대응한다.
 *
 * ⚠️ middleware 는 **쿠키의 존재**만 본다 — 토큰이 만료됐는지는 알 수 없다.
 *    그래서 middleware 를 통과하고도 FastAPI 가 401 을 주는 구간이 반드시 생긴다.
 *    그 경우 여기서 `/login?next=<현재경로>` 로 보낸다 (React 판의 401 인터셉터 역할).
 *
 * 백엔드 미기동·5xx 는 세션 문제가 아니므로 리다이렉트하지 않고 `null` 을 돌려준다 —
 * 화면이 "로그인 만료"와 "백엔드 다운"을 구분해 보여줄 수 있어야 한다.
 *
 * @param currentPath 401 일 때 로그인 후 복귀시킬 경로. 서버 컴포넌트는 현재 URL 을 알 수 없으므로
 *                    각 페이지가 자기 경로를 직접 넘긴다.
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
