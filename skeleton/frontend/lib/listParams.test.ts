import { describe, expect, it } from "vitest"
import { firstParam, listHref, pageWindow, parseIdParam, parsePage, parseQuery } from "./listParams"

// 목록 URL 파라미터 — 서버 컴포넌트가 searchParams 를 해석하고 페이지·검색 링크를 만드는 규칙.
describe("listParams", () => {
  it("배열로 온 값은 첫 값만 쓴다", () => {
    expect(firstParam({ q: ["a", "b"] }, "q")).toBe("a")
    expect(firstParam({}, "q")).toBe("")
  })

  it("page 는 양의 정수만, 아니면 1", () => {
    expect(parsePage({ page: "3" })).toBe(3)
    expect(parsePage({ page: "0" })).toBe(1)
    expect(parsePage({ page: "-2" })).toBe(1)
    expect(parsePage({ page: "1.5" })).toBe(1)
    expect(parsePage({ page: "abc" })).toBe(1)
    expect(parsePage({})).toBe(1)
  })

  it("검색어는 공백을 자르고 100자로 제한한다", () => {
    expect(parseQuery({ q: "  점검  " })).toBe("점검")
    expect(parseQuery({ q: "가".repeat(150) })).toHaveLength(100)
  })

  it("id 파라미터는 양의 정수만", () => {
    expect(parseIdParam({ user_id: "7" }, "user_id")).toBe(7)
    expect(parseIdParam({ user_id: "x" }, "user_id")).toBeUndefined()
    expect(parseIdParam({}, "user_id")).toBeUndefined()
  })

  it("링크는 빈 값과 page=1 을 뺀다", () => {
    expect(listHref("/notices", { q: "", page: 1 })).toBe("/notices")
    expect(listHref("/notices", { q: "점검", page: 2 })).toBe(`/notices?q=${encodeURIComponent("점검")}&page=2`)
    expect(listHref("/admin/users", { q: undefined, role: "admin", page: 1 })).toBe("/admin/users?role=admin")
  })

  it("페이지 번호 창은 현재 주변 최대 5개", () => {
    expect(pageWindow(1, 3)).toEqual([1, 2, 3])
    expect(pageWindow(5, 10)).toEqual([3, 4, 5, 6, 7])
    expect(pageWindow(10, 10)).toEqual([6, 7, 8, 9, 10])
  })
})
