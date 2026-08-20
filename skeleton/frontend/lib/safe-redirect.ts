// 로그인 후 원래 목적지 복귀 (architecture.md §14).
// React SPA 판의 src/lib/returnTo.ts 에 대응하지만, Next 는 목적지를 **URL 쿼리(`?next=`)** 로
// 실어 나른다 — 라우터 state 가 아니라 사용자가 조작할 수 있는 값이다.
// 따라서 여기서 걸러내지 않으면 그대로 **오픈 리다이렉트 취약점**이 된다.
// (`/login?next=https://evil.example` 링크를 받은 사용자가 로그인 직후 외부 사이트로 튕긴다.)

/** 검증 실패 시 돌아갈 기본 목적지. */
export const DEFAULT_REDIRECT = "/"

/**
 * 제어문자(개행·탭 포함) 포함 여부.
 * Location 헤더에 그대로 실리면 헤더 주입이 된다. 정규식에 제어문자를 직접 쓰지 않고
 * 코드포인트로 검사한다(소스에 보이지 않는 바이트를 남기지 않기 위해).
 */
function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) return true
  }
  return false
}

/**
 * `next` 파라미터를 **내부 경로**로만 허용한다. 아니면 `/` 를 돌려준다.
 *
 * 허용 조건 (전부 만족해야 한다):
 * - 문자열이고 비어 있지 않다
 * - `/` 로 시작한다 → `https://evil.example`·`javascript:alert(1)`·`foo` 는 전부 거부
 * - 두 번째 문자가 `/` 나 `\` 가 아니다 → `//evil.example`·`/\evil.example` 는 브라우저가
 *   **스킴 상대 URL** 로 해석해 외부 도메인으로 나간다
 * - 백슬래시·공백·제어문자가 없다 (일부 브라우저는 `\` 를 `/` 로 정규화한다)
 * - `/login` 자신으로 되돌아가지 않는다 (로그인 성공 → 다시 로그인 화면 루프 방지)
 */
export function safeRedirect(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_REDIRECT
  const path = value.trim()

  if (path === "" || path[0] !== "/") return DEFAULT_REDIRECT
  if (path[1] === "/" || path[1] === "\\") return DEFAULT_REDIRECT
  if (path.includes("\\") || /\s/.test(path) || hasControlChar(path)) return DEFAULT_REDIRECT
  if (path === "/login" || path.startsWith("/login?") || path.startsWith("/login#")) {
    return DEFAULT_REDIRECT
  }

  return path
}
