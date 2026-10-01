// 배너 링크 URL 규칙 — 백엔드 schemas/banner.py validate_link_url 과 같은 규칙이다.
// http(s) 절대 URL 또는 "/" 로 시작하는 사이트 내부 경로만 허용한다.
// "//host"(프로토콜 상대)와 "/\host"(브라우저가 "//" 로 해석)는 외부로 새므로 거부한다.

export const LINK_URL_MAX_LENGTH = 500
const LINK_RULE_MESSAGE = "링크는 http(s) 주소 또는 / 로 시작하는 내부 경로만 쓸 수 있습니다."

/** 문제 문구(빈 값·정상이면 null). */
export function linkUrlProblem(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null
  if (value.length > LINK_URL_MAX_LENGTH) return `링크는 ${LINK_URL_MAX_LENGTH}자 이하로 입력하세요.`
  // eslint-disable-next-line no-control-regex
  if (/[\s\u0000-\u001f\u007f]/.test(value)) return "링크 URL 에 공백·제어 문자를 넣을 수 없습니다."
  if (value.startsWith("/")) {
    return value.startsWith("//") || value.startsWith("/\\") ? LINK_RULE_MESSAGE : null
  }
  if (value.includes("\\")) return LINK_RULE_MESSAGE
  // URL() 은 "http:/host" 같은 값을 고쳐서 받아들이므로 형식은 정규식으로 먼저 본다.
  if (!/^https?:\/\/[^/?#]+/i.test(value)) return LINK_RULE_MESSAGE
  try {
    new URL(value)
  } catch {
    return LINK_RULE_MESSAGE
  }
  return null
}

/** 사이트 내부 경로인가(라우터로 이동). 아니면 외부 링크(새 창). */
export function isInternalLink(url: string): boolean {
  return url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/\\")
}
