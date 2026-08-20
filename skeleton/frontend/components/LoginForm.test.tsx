import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { loginAction } from "@/lib/actions/auth"
import LoginForm from "./LoginForm"

// Server Action 은 테스트에서 그대로 부를 수 없다 —
// lib/actions/auth → lib/server/fastapi 가 `server-only` 를 import 하므로 로드 자체가 실패한다.
// 여기서 검증할 것은 "폼이 무엇을 담아 Action 에 넘기고, 응답을 어떻게 보여주는가" 다.
vi.mock("@/lib/actions/auth", () => ({ loginAction: vi.fn() }))

const mockedLoginAction = vi.mocked(loginAction)

describe("LoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedLoginAction.mockResolvedValue({ error: null })
  })

  it("로그인 화면 문구를 렌더한다", () => {
    render(<LoginForm next="/" />)

    expect(screen.getByRole("heading", { name: "로그인" })).toBeInTheDocument()
    expect(screen.getByText("계정으로 로그인하세요.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "로그인" })).toBeEnabled()
    // 스타터의 기본 계정 안내는 유지한다.
    // ⛔ 자격증명(비밀번호)을 화면에 찍지 않는다 — 스캐폴드가 프로젝트마다 무작위로 만든다.
    expect(screen.queryByText(/admin123/)).not.toBeInTheDocument()
    expect(screen.getByText(/DEFAULT_ADMIN_PASSWORD/)).toBeInTheDocument()
  })

  it("입력값과 복귀 경로(next)를 FormData 로 Server Action 에 넘긴다", async () => {
    const user = userEvent.setup()
    // 복귀 경로가 폼에 실려야 로그인 후 /my?tab=profile 로 돌아갈 수 있다.
    render(<LoginForm next="/my?tab=profile" />)

    await user.type(screen.getByLabelText("아이디"), "tester")
    await user.type(screen.getByLabelText("비밀번호"), "password")
    await user.click(screen.getByRole("button", { name: "로그인" }))

    await waitFor(() => expect(mockedLoginAction).toHaveBeenCalledTimes(1))
    const formData = mockedLoginAction.mock.calls[0][1]
    expect(formData.get("username")).toBe("tester")
    expect(formData.get("password")).toBe("password")
    expect(formData.get("next")).toBe("/my?tab=profile")
  })

  it("Server Action 이 돌려준 오류 문구를 그대로 보여준다", async () => {
    const user = userEvent.setup()
    // 원인별 문구는 서버(fastapiErrorMessage)가 만든다 — 폼은 받은 문구를 보여주기만 한다.
    mockedLoginAction.mockResolvedValue({ error: "아이디 또는 비밀번호가 올바르지 않습니다." })
    render(<LoginForm next="/" />)

    expect(screen.queryByRole("alert")).toBeNull()
    await user.click(screen.getByRole("button", { name: "로그인" }))

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "아이디 또는 비밀번호가 올바르지 않습니다.",
      ),
    )
  })

  it("제출 중에는 버튼이 잠기고 대기 문구가 뜬다", async () => {
    const user = userEvent.setup()
    // Action 이 끝나기 전 상태를 관찰하기 위해 수동으로 resolve 한다.
    let resolveAction: (value: { error: string | null }) => void = () => {}
    mockedLoginAction.mockReturnValue(
      new Promise((resolve) => {
        resolveAction = resolve
      }),
    )
    render(<LoginForm next="/" />)

    await user.click(screen.getByRole("button", { name: "로그인" }))

    await waitFor(() => expect(screen.getByRole("button", { name: "로그인 중…" })).toBeDisabled())

    resolveAction({ error: null })
    await waitFor(() => expect(screen.getByRole("button", { name: "로그인" })).toBeEnabled())
  })
})
