import { render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { usePathname } from "next/navigation"
import AdminSidebar from "./AdminSidebar"
import { isAdminNavActive } from "./adminNav"
import { isActivePath } from "./MainNav"

// 관리자 사이드바 — 현재 메뉴 강조(aria-current)와 잠긴 계정 배지. 현재 경로는 usePathname 을 mock 한다.
vi.mock("next/navigation", () => ({ usePathname: vi.fn() }))
const mockedPathname = vi.mocked(usePathname)

function nav() {
  return screen.getByRole("navigation", { name: "관리자 메뉴" })
}

describe("AdminSidebar", () => {
  beforeEach(() => mockedPathname.mockReturnValue("/admin"))

  it("그룹 라벨과 메뉴를 그린다", () => {
    render(<AdminSidebar username="admin" lockedCount={0} />)
    for (const group of ["개요", "콘텐츠", "회원·보안", "시스템"]) {
      expect(within(nav()).getByText(group)).toBeInTheDocument()
    }
    for (const label of ["대시보드", "공지사항", "배너", "사용자", "세션", "로그인 잠금", "시스템 상태"]) {
      expect(within(nav()).getByRole("link", { name: new RegExp(label) })).toBeInTheDocument()
    }
    expect(screen.getByText("admin · 관리자")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "사용자 화면으로" })).toHaveAttribute("href", "/")
  })

  it("대시보드는 /admin 에서만, 다른 메뉴는 하위 경로에서도 활성이다", () => {
    mockedPathname.mockReturnValue("/admin/notices/3/edit")
    render(<AdminSidebar username="admin" lockedCount={0} />)
    expect(within(nav()).getByRole("link", { name: "공지사항" })).toHaveAttribute("aria-current", "page")
    expect(within(nav()).getByRole("link", { name: "대시보드" })).not.toHaveAttribute("aria-current")
  })

  it("/admin 에서는 대시보드만 활성", () => {
    render(<AdminSidebar username="admin" lockedCount={0} />)
    expect(within(nav()).getByRole("link", { name: "대시보드" })).toHaveAttribute("aria-current", "page")
    expect(within(nav()).getAllByRole("link").filter((a) => a.getAttribute("aria-current") === "page")).toHaveLength(1)
  })

  it("잠긴 계정이 있으면 로그인 잠금에 배지를 붙인다", () => {
    const { rerender } = render(<AdminSidebar username="admin" lockedCount={2} />)
    expect(within(nav()).getByRole("link", { name: /로그인 잠금/ })).toHaveTextContent("2개 계정 잠김")
    rerender(<AdminSidebar username="admin" lockedCount={0} />)
    expect(within(nav()).getByRole("link", { name: /로그인 잠금/ })).not.toHaveTextContent(/\d/)
  })
})

describe("활성 경로 판정", () => {
  it("관리자 메뉴 — 접두사만 겹치는 경로는 활성이 아니다", () => {
    expect(isAdminNavActive("/admin", { to: "/admin", end: true })).toBe(true)
    expect(isAdminNavActive("/admin/users", { to: "/admin", end: true })).toBe(false)
    expect(isAdminNavActive("/admin/notices/new", { to: "/admin/notices" })).toBe(true)
    expect(isAdminNavActive("/admin/notices-x", { to: "/admin/notices" })).toBe(false)
  })

  it("사용자 주 메뉴 — 홈은 정확히 /, 공지는 하위 경로까지", () => {
    expect(isActivePath("/", "/", true)).toBe(true)
    expect(isActivePath("/notices", "/", true)).toBe(false)
    expect(isActivePath("/notices/3", "/notices", false)).toBe(true)
    expect(isActivePath("/noticesx", "/notices", false)).toBe(false)
  })
})
