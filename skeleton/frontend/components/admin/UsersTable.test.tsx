import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { revokeUserSessionsAction, unlockThrottleAction, updateUserAction } from "@/lib/actions/admin"
import type { AdminUser, LoginThrottle } from "@/lib/types"
import ThrottlesTable from "./ThrottlesTable"
import UsersTable from "./UsersTable"

// 사용자 표·로그인 잠금 표(클라이언트) — 확인 후 Server Action 호출 인자와 결과 문구.
// 409 가드 문구 자체는 서버 액션이 apiErrorMessage 로 만든다(lib/api-error.test.ts) — 여기서는 그대로 보여 주는지만 본다.
vi.mock("@/lib/actions/admin", () => ({
  updateUserAction: vi.fn(),
  revokeUserSessionsAction: vi.fn(),
  revokeSessionAction: vi.fn(),
  unlockThrottleAction: vi.fn(),
}))
const mockedUpdate = vi.mocked(updateUserAction)
const mockedRevoke = vi.mocked(revokeUserSessionsAction)
const mockedUnlock = vi.mocked(unlockThrottleAction)

const users: AdminUser[] = [
  { id: 1, username: "admin", role: "admin", is_active: true, created_at: "2026-09-01T10:00:00", active_session_count: 1 },
  { id: 2, username: "kim", role: "user", is_active: true, created_at: "2026-09-02T10:00:00", active_session_count: 2 },
]

async function confirmIn(name: RegExp | string, button: string) {
  const dialog = await screen.findByRole("dialog", { name })
  fireEvent.click(within(dialog).getByRole("button", { name: button }))
}

describe("UsersTable", () => {
  beforeEach(() => vi.clearAllMocks())

  it("권한 변경은 확인 후 PATCH 본문으로 액션을 부르고, 거부 문구를 보여 준다", async () => {
    mockedUpdate.mockResolvedValue({ ok: false, error: "자기 자신의 권한이나 활성 상태는 바꿀 수 없습니다." })
    render(<UsersTable users={users} meId={1} />)
    expect(screen.getByRole("rowheader", { name: /admin\s*\(나\)/ })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("admin 권한"), { target: { value: "user" } })
    await confirmIn(/admin 의 권한을 바꿀까요/, "변경")

    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledWith(1, { role: "user" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("자기 자신의 권한이나 활성 상태는 바꿀 수 없습니다.")
  })

  it("비활성화는 is_active:false 로, 취소하면 부르지 않는다", async () => {
    mockedUpdate.mockResolvedValue({ ok: true, data: undefined })
    render(<UsersTable users={users} meId={1} />)
    const row = screen.getByRole("rowheader", { name: /^kim/ }).closest("tr")!

    fireEvent.click(within(row).getByRole("button", { name: /비활성화/ }))
    await confirmIn(/kim 을\(를\) 비활성화할까요/, "취소")
    expect(mockedUpdate).not.toHaveBeenCalled()

    fireEvent.click(within(row).getByRole("button", { name: /비활성화/ }))
    await confirmIn(/kim 을\(를\) 비활성화할까요/, "변경")
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledWith(2, { is_active: false }))
    expect(await screen.findByText("kim 의 정보를 바꿨습니다.")).toBeInTheDocument()
  })

  it("세션 모두 종료는 종료 개수를 알리고, 세션 수는 세션 화면 필터로 링크한다", async () => {
    mockedRevoke.mockResolvedValue({ ok: true, data: { revoked: 2 } })
    render(<UsersTable users={users} meId={1} />)
    const row = screen.getByRole("rowheader", { name: /^kim/ }).closest("tr")!
    expect(within(row).getByRole("link", { name: /2개/ })).toHaveAttribute("href", "/admin/sessions?user_id=2")

    fireEvent.click(within(row).getByRole("button", { name: /세션 모두 종료/ }))
    await confirmIn(/kim 의 세션을 모두 종료할까요/, "모두 종료")
    expect(await screen.findByText("kim 의 세션 2개를 종료했습니다.")).toBeInTheDocument()
    expect(mockedRevoke).toHaveBeenCalledWith(2)
  })
})

describe("ThrottlesTable", () => {
  const throttles: LoginThrottle[] = [
    { username: "user 05", failed_count: 5, locked_until: "2026-10-02T10:42:00", last_failed_at: "2026-10-02T10:27:00", is_locked: true },
    { username: "kim", failed_count: 2, locked_until: null, last_failed_at: "2026-10-02T09:00:00", is_locked: false },
  ]

  beforeEach(() => vi.clearAllMocks())

  it("잠긴 계정을 강조하고 잠금 해제·기록 지우기를 구분한다", async () => {
    mockedUnlock.mockResolvedValue({ ok: true, data: undefined })
    render(<ThrottlesTable throttles={throttles} />)
    const lockedRow = screen.getByRole("rowheader", { name: "user 05" }).closest("tr")!
    expect(within(lockedRow).getByText("잠김")).toBeInTheDocument()
    expect(within(lockedRow).getByText("2026-10-02 10:42")).toBeInTheDocument()
    expect(lockedRow.className).toMatch(/bg-error-container/)
    const kimRow = screen.getByRole("rowheader", { name: "kim" }).closest("tr")!
    expect(within(kimRow).getByRole("button", { name: /기록 지우기/ })).toBeInTheDocument()

    fireEvent.click(within(lockedRow).getByRole("button", { name: /잠금 해제/ }))
    expect(await screen.findByText("user 05 의 잠금을 해제했습니다.")).toBeInTheDocument()
    expect(mockedUnlock).toHaveBeenCalledWith("user 05")
  })

  it("대시보드(locked)는 잠긴 계정만 보여 준다", () => {
    render(<ThrottlesTable throttles={throttles} variant="locked" />)
    expect(screen.getByText("user 05")).toBeInTheDocument()
    expect(screen.queryByText("kim")).toBeNull()
  })
})
