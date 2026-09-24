import { NextResponse, type NextRequest } from "next/server"
import {
  REFRESH_COOKIE,
  SESSION_COOKIE,
  accessCookieMaxAge,
  sessionCookieOptions,
} from "@/lib/session-cookie"
import type { TokenResponse } from "@/lib/types"

// 인증 가드 + 자동 세션 갱신 (architecture.md §14). 보호 라우트를 렌더 트리의 가드 컴포넌트가
// 아니라 **요청 단계**에서 막는다 — 보호 페이지의 HTML 이 브라우저로
// 나가기 전에 리다이렉트되므로, 미인증 사용자에게 보호 화면이 한 프레임도 깜빡이지 않는다.
//
// ⚠️ access 쿠키는 **존재만** 확인한다. 서명 검증은 하지 않는다.
//    - proxy 는 모든 요청마다 돈다. 매번 FastAPI 에 물어보면 요청이 2배가 된다.
//    - JWT 서명키(SECRET_KEY)는 백엔드 것이다. Next 에 복제하면 비밀이 두 곳으로 늘어난다.
//    실제 권한 판정은 언제나 FastAPI 가 한다(401 → lib/session.ts 의 getSessionUser 가 처리).
//
// access 쿠키가 없고 refresh 쿠키만 남았을 때만 예외적으로 백엔드를 부른다(자동 갱신) —
// access 쿠키 maxAge 가 토큰보다 60초 짧아(accessCookieMaxAge) 만료가 이 경로로 선제 감지되고,
// 사용자는 재로그인 없이 세션이 이어진다. refresh 는 15분에 한 번꼴이라 요청 2배 문제가 없다.
//
// ⛔ lib/session.ts·lib/server/fastapi.ts 를 import 하지 마라. 그 둘은 렌더·Server Action 용이다 —
//    쿠키는 next/headers 의 cookies() 로, 이동은 NEXT_REDIRECT 를 던지는 redirect() 로 다룬다.
//    proxy 는 NextRequest 로 읽고 NextResponse 로 쓰고 리다이렉트한다. 서버 래퍼는 production 에서
//    FASTAPI_URL 이 없으면 throw 한다(아래 fastapiBaseUrl 참고). 공유할 것은 의존성 0 인
//    lib/session-cookie.ts 에서만 가져오고, 여기서는 fetch/Web API 만 쓴다.
//
// Next 16 의 proxy 는 Node.js 런타임에서 돈다. `runtime` 설정은 proxy 파일에서 허용되지 않는다(빌드 에러).

/**
 * FastAPI 베이스 URL — lib/server/fastapi.ts 의 baseUrl() 과 같은 규칙의 최소 복제다(위 ⛔ 참고).
 * production 의 FASTAPI_URL 미설정 검증은 서버 래퍼가 담당한다 — 여기서 throw 하면
 * 모든 요청이 500 이 되어 로그인 화면조차 열 수 없다.
 */
function fastapiBaseUrl(): string {
  return (process.env.FASTAPI_URL ?? "http://localhost:8000").replace(/\/+$/, "")
}

/**
 * refresh 응답 대기 상한(ms). proxy 는 모든 보호 요청의 길목이다 — 백엔드가 연결만 받고
 * 응답을 물고 있으면(DB 락·스레드풀 고갈) 사이트 전체가 이 fetch 에 매달리므로 짧게 끊는다.
 */
const REFRESH_TIMEOUT_MS = 5_000

function redirectToLogin(request: NextRequest): NextResponse {
  // 원래 가려던 위치(쿼리 포함)를 next 파라미터로 넘겨 로그인 후 복귀시킨다.
  // pathname 만 넘기면 /my?tab=profile 에서 세션이 끊긴 사용자가 로그인 후 /my 로 가서
  // 탭·필터·검색 상태를 잃는다.
  const from = `${request.nextUrl.pathname}${request.nextUrl.search}`
  const loginUrl = new URL("/login", request.nextUrl)
  loginUrl.searchParams.set("next", from)
  return NextResponse.redirect(loginUrl)
}

/**
 * 두 세션 쿠키를 응답에서 만료시킨다. delete() 가 아니라 maxAge 0 으로 같은 속성을 덮어쓴다 —
 * production 의 `__Host-` 쿠키는 삭제용 Set-Cookie 도 프리픽스 조건(secure·path=/)을 채워야
 * 브라우저가 받아들인다(lib/session-cookie.ts 참고).
 */
function expireSessionCookies(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(0))
  response.cookies.set(REFRESH_COOKIE, "", sessionCookieOptions(0))
}

export async function proxy(request: NextRequest) {
  // access 쿠키가 있으면 통과 — 존재만 본다(파일 머리 주석).
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next()

  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value
  if (!refreshToken) return redirectToLogin(request)

  // access 는 죽고 refresh 만 남은 상태 — 백엔드에 회전(rotation)을 요청해 세션을 잇는다.
  let response: Response
  try {
    response = await fetch(`${fastapiBaseUrl()}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
      signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
    })
  } catch {
    // 네트워크 오류·타임아웃 — 백엔드 **일시 장애**일 수 있다. 여기서 쿠키를 지우면
    // 아직 유효한 refresh 토큰을 파기해, 백엔드가 복구된 뒤에도 전 사용자가 재로그인해야 한다.
    // 쿠키는 남겨 두고 로그인 화면으로만 보낸다 — 복구 후 보호 경로로 다시 오면 여기서 갱신된다.
    return redirectToLogin(request)
  }

  if (response.status === 401) {
    // 무효·만료·폐기·재사용 감지 — 이 refresh 토큰으로는 회복할 수 없다.
    // 쿠키를 남겨 두면 모든 요청이 실패할 refresh 를 반복하므로 여기서 확실히 지운다.
    const redirect = redirectToLogin(request)
    expireSessionCookies(redirect)
    return redirect
  }

  // 5xx 등 그 밖의 실패 — 토큰 유효성 판정이 아니라 백엔드 문제다. 네트워크 오류와 같은 취급.
  if (!response.ok) return redirectToLogin(request)

  let tokens: TokenResponse
  try {
    tokens = (await response.json()) as TokenResponse
  } catch {
    // 리버스 프록시가 200 으로 HTML 오류 페이지를 끼워 넣는 경우 — 백엔드 문제로 취급한다.
    return redirectToLogin(request)
  }
  if (
    typeof tokens.access_token !== "string" ||
    typeof tokens.refresh_token !== "string" ||
    typeof tokens.expires_in !== "number" ||
    typeof tokens.refresh_expires_in !== "number"
  ) {
    return redirectToLogin(request)
  }

  // 회전된 새 쌍으로 두 쿠키를 갈아끼우고 원래 요청을 그대로 통과시킨다 —
  // 사용자는 리다이렉트 한 번 없이 세션이 이어진다. NextResponse.next() 의 응답 쿠키는
  // Next 가 같은 요청의 cookies() 에도 반영하므로(13.0.1+), 이어지는 서버 컴포넌트의
  // getSessionToken() 이 새 access 토큰을 바로 읽는다.
  const next = NextResponse.next()
  next.cookies.set(
    SESSION_COOKIE,
    tokens.access_token,
    sessionCookieOptions(accessCookieMaxAge(tokens.expires_in)),
  )
  next.cookies.set(REFRESH_COOKIE, tokens.refresh_token, sessionCookieOptions(tokens.refresh_expires_in))
  return next
}

export const config = {
  // ⚠️ matcher 에서 /login 과 정적 자산을 빼지 않으면 무한 리다이렉트가 난다
  //    (/login 요청 → 쿠키 없음 → /login 으로 리다이렉트 → …).
  //    - login(?:/|$)      : 로그인 화면 자신. ⛔ 앵커 없이 `login` 만 쓰면 /login-history 같은
  //                          평범한 보호 경로까지 가드 밖으로 새어나간다.
  //    - _next/            : 빌드 산출물·이미지 최적화
  //    - 정적 자산 확장자   : favicon.ico 등 public 파일. ⛔ "확장자처럼 생긴 모든 것"을 빼면
  //                          /users/john.doe·/reports/2026.q1 같은 평범한 보호 경로까지 무방비가
  //                          된다. 그래서 실제 정적 자산 확장자만 열거한다 — public/ 에 다른
  //                          확장자를 추가하면 이 목록에도 넣어야 한다.
  matcher: ["/((?!login(?:/|$)|_next/|.*\\.(?:ico|png|jpg|jpeg|gif|svg|webp|avif|css|js|map|txt|xml|json|webmanifest|woff2?)$).*)"],
}
