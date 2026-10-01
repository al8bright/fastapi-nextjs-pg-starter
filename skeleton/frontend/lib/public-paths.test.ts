import { describe, expect, it } from "vitest"
import { isPublicPath } from "./public-paths"

// 공개 경로 허용 목록 회귀 테스트 — 여기가 넓어지면 보호 화면이 로그인 없이 열린다.
describe("isPublicPath", () => {
  it("홈과 공지 목록·상세는 공개다", () => {
    expect(isPublicPath("/")).toBe(true)
    expect(isPublicPath("/notices")).toBe(true)
    expect(isPublicPath("/notices/12")).toBe(true)
  })

  it("관리자·내 정보·비슷한 이름의 경로는 보호된다", () => {
    expect(isPublicPath("/admin")).toBe(false)
    expect(isPublicPath("/admin/notices")).toBe(false)
    expect(isPublicPath("/me")).toBe(false)
    expect(isPublicPath("/notices-admin")).toBe(false)
    expect(isPublicPath("/noticesx")).toBe(false)
  })
})
