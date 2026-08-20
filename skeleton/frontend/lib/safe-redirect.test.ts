import { describe, expect, it } from "vitest"
import { DEFAULT_REDIRECT, safeRedirect } from "./safe-redirect"

// 오픈 리다이렉트 방지 회귀 테스트 (architecture.md §14).
// `?next=` 는 사용자가 만든 링크로 들어온다 — 여기서 새면 로그인 직후 외부 사이트로 튕긴다.
describe("safeRedirect", () => {
  it("내부 경로는 그대로 통과시킨다", () => {
    expect(safeRedirect("/")).toBe("/")
    expect(safeRedirect("/my")).toBe("/my")
    expect(safeRedirect("/landing")).toBe("/landing")
    // query·hash 까지 살려야 /my?tab=profile 에서 끊긴 사용자가 원래 위치로 돌아온다.
    expect(safeRedirect("/my?tab=profile&sort=desc")).toBe("/my?tab=profile&sort=desc")
    expect(safeRedirect("/my?tab=profile#top")).toBe("/my?tab=profile#top")
    // 하이픈·언더스코어·퍼센트 인코딩은 정상 경로 문자다 (과잉 차단 방지).
    expect(safeRedirect("/orders/2026-08-01?q=a%20b")).toBe("/orders/2026-08-01?q=a%20b")
  })

  it("스킴 상대 URL(//host)을 거부한다", () => {
    expect(safeRedirect("//evil.com")).toBe(DEFAULT_REDIRECT)
    expect(safeRedirect("//evil.com/path")).toBe(DEFAULT_REDIRECT)
    // 앞뒤 공백으로 검사를 우회하려는 시도도 trim 후 같은 판정을 받는다.
    expect(safeRedirect("  //evil.com  ")).toBe(DEFAULT_REDIRECT)
  })

  it("절대 URL을 거부한다", () => {
    expect(safeRedirect("https://evil.com")).toBe(DEFAULT_REDIRECT)
    expect(safeRedirect("http://evil.com")).toBe(DEFAULT_REDIRECT)
    expect(safeRedirect("HTTPS://evil.com")).toBe(DEFAULT_REDIRECT)
  })

  it("javascript: 등 위험 스킴을 거부한다", () => {
    expect(safeRedirect("javascript:alert(1)")).toBe(DEFAULT_REDIRECT)
    expect(safeRedirect("data:text/html,<script>")).toBe(DEFAULT_REDIRECT)
    expect(safeRedirect("vbscript:msgbox(1)")).toBe(DEFAULT_REDIRECT)
  })

  it("백슬래시가 섞인 경로를 거부한다", () => {
    // 브라우저·프록시가 \ 를 / 로 정규화해 //evil.com 이 되는 우회 경로다.
    expect(safeRedirect("/\\evil.com")).toBe(DEFAULT_REDIRECT)
    expect(safeRedirect("\\\\evil.com")).toBe(DEFAULT_REDIRECT)
    expect(safeRedirect("/foo\\bar")).toBe(DEFAULT_REDIRECT)
  })

  it("공백·제어문자가 섞인 경로를 거부한다 (헤더 주입)", () => {
    expect(safeRedirect("/foo\r\nSet-Cookie: a=b")).toBe(DEFAULT_REDIRECT)
    expect(safeRedirect("/foo\tbar")).toBe(DEFAULT_REDIRECT)
    expect(safeRedirect("/foo bar")).toBe(DEFAULT_REDIRECT)
    expect(safeRedirect("/foo\u00a0bar")).toBe(DEFAULT_REDIRECT)
    expect(safeRedirect("/foo\u0000bar")).toBe(DEFAULT_REDIRECT)
  })

  it("상대 경로와 빈 값을 거부한다", () => {
    expect(safeRedirect("my")).toBe(DEFAULT_REDIRECT)
    expect(safeRedirect("../admin")).toBe(DEFAULT_REDIRECT)
    expect(safeRedirect("")).toBe(DEFAULT_REDIRECT)
    expect(safeRedirect("   ")).toBe(DEFAULT_REDIRECT)
  })

  it("문자열이 아닌 값을 거부한다", () => {
    // searchParams 는 배열로 올 수 있고, FormData.get() 은 File 을 돌려줄 수도 있다.
    expect(safeRedirect(undefined)).toBe(DEFAULT_REDIRECT)
    expect(safeRedirect(null)).toBe(DEFAULT_REDIRECT)
    expect(safeRedirect(["/my"])).toBe(DEFAULT_REDIRECT)
    expect(safeRedirect(42)).toBe(DEFAULT_REDIRECT)
    expect(safeRedirect({ toString: () => "/my" })).toBe(DEFAULT_REDIRECT)
  })

  it("/login 으로 되돌리지 않는다 (로그인 루프 방지)", () => {
    expect(safeRedirect("/login")).toBe(DEFAULT_REDIRECT)
    expect(safeRedirect("/login?next=/my")).toBe(DEFAULT_REDIRECT)
    expect(safeRedirect("/login#top")).toBe(DEFAULT_REDIRECT)
    // 다른 경로의 접두사로 /login 이 들어간 것은 정상 경로다.
    expect(safeRedirect("/login-history")).toBe("/login-history")
  })
})
