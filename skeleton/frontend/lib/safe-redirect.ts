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
 * - **정규화한 뒤에도** 스킴 상대 URL 이 아니다 — 문자열 검사만으로는 부족하다.
 *   `/..//evil.example` 은 `/` 로 시작하고 두 번째 문자도 `/` 가 아니라 위 검사를 통과하지만,
 *   `..` 세그먼트가 접히면 `//evil.example` 이 되어 막으려던 바로 그 형태가 된다.
 * - `/login` 자신으로 되돌아가지 않는다 (로그인 성공 → 다시 로그인 화면 루프 방지)
 *
 * 반환값은 **정규화된 경로**다. 원문을 그대로 돌려주면 위 불변식이 호출부까지 이어지지 않는다.
 */
export function safeRedirect(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_REDIRECT
  const path = value.trim()

  if (path === "" || path[0] !== "/") return DEFAULT_REDIRECT
  if (path[1] === "/" || path[1] === "\\") return DEFAULT_REDIRECT
  if (path.includes("\\") || /\s/.test(path) || hasControlChar(path)) return DEFAULT_REDIRECT

  // 브라우저와 같은 파서(WHATWG URL)로 정규화한 뒤 다시 본다.
  // ⚠️ 기준 origin 은 RFC 2606 예약 TLD 라 실제 조회가 발생하지 않는다.
  const BASE = "https://safe-redirect.invalid"
  let url: URL
  try {
    url = new URL(path, BASE)
  } catch {
    return DEFAULT_REDIRECT
  }
  // 입력이 어떤 식으로든 origin 을 바꿨거나(절대 URL), `..` 가 접혀 스킴 상대 형태가 됐으면 거부.
  if (url.origin !== BASE) return DEFAULT_REDIRECT
  if (url.pathname.startsWith("//")) return DEFAULT_REDIRECT
  // 인코딩된 슬래시는 URL 파서가 구분자로 풀지 않으므로 위 검사를 그대로 통과한다.
  // 브라우저는 내부 경로로 취급하지만(=404), `%2f` 를 디코드하는 프록시·게이트웨이 뒤에서는
  // `//evil.example` 로 되살아난다. 어차피 라우트에 매칭되지 않는 값이므로 거부한다.
  if (/%2f|%5c/i.test(url.pathname)) return DEFAULT_REDIRECT

  // 트레일링 슬래시(`/login/`)와 하위 경로(`/login/foo`)까지 루프 가드에 포함한다.
  if (url.pathname === "/login" || url.pathname.startsWith("/login/")) return DEFAULT_REDIRECT

  return `${url.pathname}${url.search}${url.hash}`
}
