// 세션 쿠키의 이름과 공통 속성만 담는 모듈 — **의존성이 없어야 한다**.
//
// 이 모듈을 쓰는 곳은 세 군데다 — proxy.ts(요청 단계), lib/session.ts(Server Action·서버 컴포넌트),
// 그리고 Vitest(lib/session-cookie.test.ts). lib/session.ts 는 `server-only`·`next/headers`·
// `next/navigation`·FastAPI 래퍼를 물고 있어 proxy 가 쓰기엔 렌더 전용 API 투성이고,
// Vitest 에서는 로드조차 되지 않는다. 그래서 상수와 순수 함수만 여기로 분리한다.
//
// ⛔ 이 파일에는 어떤 import 도 추가하지 마라 — 세 소비자 중 하나라도 끌려오는 순간 깨진다.
//    환경 판별도 process.env.NODE_ENV 만 쓴다 — 어느 소비자에서든 빌드 시점에 정적으로 치환된다.

const IS_PRODUCTION = process.env.NODE_ENV === "production"

/**
 * production 에서는 쿠키 이름에 `__Host-` 프리픽스를 붙인다 (RFC 6265bis 쿠키 프리픽스).
 *
 * `__Host-` 이름의 쿠키는 브라우저가 **secure + path=/ + Domain 미지정**을 강제한다 —
 * 조건을 어긴 Set-Cookie 는 브라우저가 통째로 버린다. 그래서 탈취된 서브도메인이
 * Domain 쿠키를 심어 부모 도메인의 세션을 덮어쓰는 쿠키 주입(세션 고정)을
 * 서버 코드가 아니라 **브라우저 단에서** 차단한다.
 *
 * dev(localhost, http)에서는 secure 쿠키가 저장되지 않아 프리픽스를 뗀다.
 * 이름이 환경마다 갈리므로 NODE_ENV 를 바꿔 재기동하면 이전 쿠키는 무시된다(재로그인 필요).
 */
export function withHostPrefix(name: string, isProduction: boolean): string {
  return isProduction ? `__Host-${name}` : name
}

/** access 토큰 쿠키 — 같은 도메인에 여러 프로젝트를 올릴 때 충돌하지 않도록 프로젝트별로 분리한다. */
export const SESSION_COOKIE = withHostPrefix("__PROJECT_SNAKE___session", IS_PRODUCTION)

/** refresh 토큰 쿠키 — 백엔드가 준 불투명 문자열이다. 프론트는 해석하지 않고 /auth/refresh 로 전달만 한다. */
export const REFRESH_COOKIE = withHostPrefix("__PROJECT_SNAKE___refresh", IS_PRODUCTION)

/**
 * access 쿠키 maxAge(초) — 토큰 유효기간(expires_in)보다 **60초 짧게** 잡는다.
 *
 * 쿠키가 토큰보다 먼저 죽어야 proxy 가 "access 쿠키 없음 → refresh" 경로로
 * 만료를 **선제** 감지한다. 쿠키가 토큰보다 오래 살면 proxy 는 통과시키는데
 * FastAPI 가 401 을 주는 구간이 생기고, 아슬아슬하게 같으면 렌더 도중 만료돼
 * 페이지 절반만 그려지다 로그인으로 튕긴다.
 *
 * 하한 60초 — 백엔드가 아주 짧은 만료를 주더라도 maxAge 가 0 이하로 떨어져
 * 쿠키가 즉시 증발(=매 요청 refresh)하는 것을 막는다.
 */
export function accessCookieMaxAge(expiresInSeconds: number): number {
  return Math.max(expiresInSeconds - 60, 60)
}

/**
 * 두 세션 쿠키의 공통 속성 (architecture.md §14 세션 쿠키 속성).
 *
 * lib/session.ts(Server Action)와 proxy.ts(요청 단계)가 **같은 속성**으로 굽지 않으면
 * 같은 이름·다른 속성의 쿠키가 공존해 "로그아웃했는데 세션이 남는" 상태가 된다 —
 * 그래서 속성을 이 한 곳에서만 만든다. production 의 secure 는 `__Host-` 프리픽스의
 * 강제 조건이기도 하다(withHostPrefix 참고). 삭제할 때도 이 속성으로 maxAge 0 을 덮어써야
 * `__Host-` 쿠키의 프리픽스 조건을 채워 브라우저가 삭제를 받아들인다.
 */
export function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    // production 에서만 secure — localhost(http)에서 켜면 쿠키가 저장되지 않아 로그인이 무한 루프가 된다.
    secure: IS_PRODUCTION,
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  } as const
}
