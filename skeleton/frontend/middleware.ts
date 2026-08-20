import { NextResponse, type NextRequest } from "next/server"
import { SESSION_COOKIE } from "@/lib/session-cookie"

// 인증 가드 (architecture.md §14). React SPA 판의 ProtectedRoute 컴포넌트에 대응한다.
// 차이: 렌더 트리가 아니라 **요청 단계**에서 막는다 — 보호 페이지의 HTML 이 브라우저로
// 나가기 전에 리다이렉트되므로, 미인증 사용자에게 보호 화면이 한 프레임도 깜빡이지 않는다.
//
// ⚠️ 여기서는 **쿠키의 존재만** 확인한다. 서명 검증은 하지 않는다.
//    - middleware 는 모든 요청마다 돈다. 매번 FastAPI 에 물어보면 요청이 2배가 된다.
//    - JWT 서명키(SECRET_KEY)는 백엔드 것이다. Next 에 복제하면 비밀이 두 곳으로 늘어난다.
//    실제 권한 판정은 언제나 FastAPI 가 한다(401 → lib/session.ts 의 getSessionUser 가 처리).

export function middleware(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next()

  // 원래 가려던 위치(쿼리 포함)를 next 파라미터로 넘겨 로그인 후 복귀시킨다.
  // pathname 만 넘기면 /my?tab=profile 에서 세션이 끊긴 사용자가 로그인 후 /my 로 가서
  // 탭·필터·검색 상태를 잃는다.
  const from = `${request.nextUrl.pathname}${request.nextUrl.search}`
  const loginUrl = new URL("/login", request.nextUrl)
  loginUrl.searchParams.set("next", from)
  return NextResponse.redirect(loginUrl)
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
