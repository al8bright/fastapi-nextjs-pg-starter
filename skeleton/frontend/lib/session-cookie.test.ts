import { describe, expect, it } from "vitest"
import {
  REFRESH_COOKIE,
  SESSION_COOKIE,
  accessCookieMaxAge,
  sessionCookieOptions,
  withHostPrefix,
} from "./session-cookie"

// 쿠키 이름·수명 규칙 회귀 테스트 (architecture.md §14 세션 쿠키 속성).
// 여기가 깨지면 production 에서 쿠키가 브라우저에게 조용히 버려지거나(__Host- 조건 위반),
// middleware 의 만료 선제 감지(refresh 경로)가 무너진다.
describe("withHostPrefix", () => {
  it("production 에서는 __Host- 프리픽스를 붙인다 (서브도메인 쿠키 주입 차단)", () => {
    expect(withHostPrefix("app_session", true)).toBe("__Host-app_session")
  })

  it("dev 에서는 이름을 그대로 둔다 (localhost http 에서는 secure 쿠키가 저장되지 않는다)", () => {
    expect(withHostPrefix("app_session", false)).toBe("app_session")
  })
})

describe("쿠키 이름", () => {
  it("access 와 refresh 는 서로 다른 쿠키다", () => {
    expect(SESSION_COOKIE).not.toBe(REFRESH_COOKIE)
  })

  it("두 이름 모두 같은 환경 판정을 따른다 (한쪽만 __Host- 면 갱신·삭제가 어긋난다)", () => {
    expect(SESSION_COOKIE.startsWith("__Host-")).toBe(REFRESH_COOKIE.startsWith("__Host-"))
  })
})

describe("accessCookieMaxAge", () => {
  it("토큰 유효기간보다 60초 짧다 (쿠키가 먼저 죽어야 middleware 가 만료를 선제 감지한다)", () => {
    expect(accessCookieMaxAge(15 * 60)).toBe(14 * 60)
  })

  it("하한은 60초다 (짧은 만료에서 maxAge 0 이하 → 쿠키 즉시 증발을 막는다)", () => {
    expect(accessCookieMaxAge(90)).toBe(60)
    expect(accessCookieMaxAge(60)).toBe(60)
    expect(accessCookieMaxAge(0)).toBe(60)
  })
})

describe("sessionCookieOptions", () => {
  it("httpOnly·lax·path=/ 를 고정하고 maxAge 를 그대로 싣는다", () => {
    const options = sessionCookieOptions(1234)
    expect(options.httpOnly).toBe(true)
    expect(options.sameSite).toBe("lax")
    expect(options.path).toBe("/")
    expect(options.maxAge).toBe(1234)
  })
})
