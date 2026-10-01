import { describe, expect, it } from "vitest"
import { fromDateTimeLocal, toDateTimeLocal } from "@/lib/format"
import { isInternalLink, linkUrlProblem } from "@/lib/linkUrl"
import { type BannerValues, validateBanner } from "./bannerForm"

// 배너 폼 검증 — 백엔드 BannerWrite(validate_link_url·기간) 규칙과 같아야 한다.

const valid: BannerValues = {
  title: "가을 이벤트",
  alt: "가을 이벤트 — 10월 한 달",
  link: "",
  startsAt: "",
  endsAt: "",
  active: true,
  image: { key: "public/banners/2026/10/02/abc.webp", url: "/uploads/public/banners/abc.webp", width: 1440, height: 480 },
}

describe("링크 URL 규칙 (linkUrlProblem)", () => {
  it.each(["", "   ", "/notices/1", "/a?b=c#d", "http://example.com", "https://example.com/path?x=1"])(
    "허용: %j",
    (url) => expect(linkUrlProblem(url)).toBeNull(),
  )

  it.each([
    "//evil.com",
    "/\\evil.com",
    "javascript:alert(1)",
    "data:text/html,hi",
    "ftp://example.com",
    "example.com",
    "http:/example.com",
    "https://exa mple.com",
    "http://exa\\mple.com",
    "/path\twith-tab",
  ])("거부: %j", (url) => expect(linkUrlProblem(url)).not.toBeNull())

  it("500자를 넘으면 거부한다", () => {
    expect(linkUrlProblem(`https://example.com/${"a".repeat(500)}`)).toMatch(/500자/)
  })

  it("내부 경로만 라우터 링크로 본다", () => {
    expect(isInternalLink("/notices")).toBe(true)
    expect(isInternalLink("//evil.com")).toBe(false)
    expect(isInternalLink("https://example.com")).toBe(false)
  })
})

describe("배너 폼 검증 (validateBanner)", () => {
  it("올바른 값이면 오류가 없다", () => {
    expect(validateBanner(valid)).toEqual({})
  })

  it("이미지·제목·대체 텍스트는 필수다", () => {
    const errors = validateBanner({ ...valid, image: null, title: " ", alt: "  " })
    expect(Object.keys(errors).sort()).toEqual(["alt", "image", "title"])
  })

  it("잘못된 링크를 막는다", () => {
    expect(validateBanner({ ...valid, link: "javascript:alert(1)" }).link).toMatch(/http\(s\)/)
  })

  it("종료 시각은 시작 시각보다 뒤여야 한다 (같아도 거부)", () => {
    expect(validateBanner({ ...valid, startsAt: "2026-10-02T10:00", endsAt: "2026-10-02T10:00" }).period).toBeDefined()
    expect(validateBanner({ ...valid, startsAt: "2026-10-02T10:00", endsAt: "2026-10-01T10:00" }).period).toBeDefined()
    expect(validateBanner({ ...valid, startsAt: "2026-10-02T10:00", endsAt: "2026-10-02T10:01" }).period).toBeUndefined()
    // 한쪽만 있으면 기간 검사를 하지 않는다(무제한).
    expect(validateBanner({ ...valid, endsAt: "2026-10-01T10:00" }).period).toBeUndefined()
  })

  it("datetime-local 값은 KST naive 문자열로 오간다", () => {
    expect(fromDateTimeLocal("2026-10-02T10:00")).toBe("2026-10-02T10:00:00")
    expect(fromDateTimeLocal("")).toBeNull()
    expect(toDateTimeLocal("2026-10-02T10:00:00")).toBe("2026-10-02T10:00")
    expect(toDateTimeLocal(null)).toBe("")
  })
})
