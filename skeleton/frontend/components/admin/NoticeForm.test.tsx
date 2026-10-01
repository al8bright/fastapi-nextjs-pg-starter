import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { deleteNoticeAction, saveNoticeAction } from "@/lib/actions/notices"
import type { AdminNoticeDetail } from "@/lib/types"
import NoticeForm from "./NoticeForm"
import { leavingHref } from "./useLeaveGuard"

// 공지 작성 폼(클라이언트) — 화면 검증, Server Action 에 넘기는 FormData, 저장 결과 표시, 이탈 확인.
// Server Action 모듈은 server-only 를 끌고 와 러너에서 로드되지 않으므로 통째로 mock 한다.
// jsdom 에는 execCommand 가 없어 에디터는 같은 계약(initialHtml·onChange·labelId)의 textarea 로 바꾼다.
// (NoticeForm 은 에디터를 next/dynamic 으로 늦게 불러오므로 에디터는 findBy* 로 기다린다.)
vi.mock("@/lib/actions/notices", () => ({
  saveNoticeAction: vi.fn(),
  deleteNoticeAction: vi.fn(),
  uploadAttachmentAction: vi.fn(),
  deleteAttachmentAction: vi.fn(),
}))
vi.mock("@/lib/actions/editor", () => ({ uploadEditorImageAction: vi.fn() }))
vi.mock("@/components/editor/RichTextEditor", () => ({
  default: ({ initialHtml, onChange, labelId }: { initialHtml?: string; onChange: (h: string) => void; labelId?: string }) => (
    <textarea aria-labelledby={labelId} defaultValue={initialHtml} onChange={(e) => onChange(e.target.value)} />
  ),
}))
const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }), usePathname: () => "/admin/notices/new" }))

const mockedSave = vi.mocked(saveNoticeAction)
const mockedDelete = vi.mocked(deleteNoticeAction)

const notice: AdminNoticeDetail = {
  id: 5,
  title: "기존 공지",
  body_html: "<p>본문</p>",
  is_pinned: false,
  is_published: true,
  published_at: "2026-10-02T10:00:00",
  view_count: 3,
  has_attachments: false,
  author_id: 1,
  author_username: "admin",
  created_at: "2026-10-02T10:00:00",
  updated_at: "2026-10-02T10:00:00",
  attachments: [],
}

describe("NoticeForm", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedSave.mockResolvedValue({ error: null, message: "저장했습니다. 사용자 화면에 게시 중입니다." })
  })

  it("필수값이 비면 액션을 부르지 않고 필드 오류를 보여 준다", async () => {
    render(<NoticeForm notice={null} />)
    fireEvent.click(screen.getByRole("button", { name: "저장" }))

    expect(await screen.findByText("제목을 입력하세요.")).toBeInTheDocument()
    expect(screen.getByText("본문을 입력하세요.")).toBeInTheDocument()
    expect(screen.getByLabelText(/제목/)).toHaveAttribute("aria-invalid", "true")
    expect(mockedSave).not.toHaveBeenCalled()
    expect(screen.getByText("첨부 파일은 공지를 처음 저장한 뒤 올릴 수 있습니다.")).toBeInTheDocument()
  })

  it("입력값을 FormData 로 액션에 넘긴다(본문은 hidden body_html, 체크박스는 on)", async () => {
    render(<NoticeForm notice={null} />)
    fireEvent.change(screen.getByLabelText(/제목/), { target: { value: "  새 공지  " } })
    fireEvent.change(await screen.findByRole("textbox", { name: /본문/ }), { target: { value: "<p>안녕하세요</p>" } })
    fireEvent.click(screen.getByLabelText("상단 고정"))
    fireEvent.click(screen.getByLabelText("게시"))
    expect(screen.getByText("저장하지 않은 변경 사항이 있습니다.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "저장" }))

    await waitFor(() => expect(mockedSave).toHaveBeenCalledTimes(1))
    const formData = mockedSave.mock.calls[0][1]
    expect(formData.get("id")).toBeNull()
    expect(formData.get("title")).toBe("  새 공지  ")
    expect(formData.get("body_html")).toBe("<p>안녕하세요</p>")
    expect(formData.get("is_pinned")).toBe("on")
    expect(formData.get("is_published")).toBe("on")
  })

  it("수정 저장에 성공하면 알림을 띄우고 변경 표시를 지운다", async () => {
    render(<NoticeForm notice={notice} />)
    expect(screen.getByRole("heading", { level: 1, name: "공지 수정" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "사용자 화면에서 보기" })).toHaveAttribute("href", "/notices/5")

    fireEvent.change(screen.getByLabelText(/제목/), { target: { value: "고친 제목" } })
    fireEvent.click(screen.getByRole("button", { name: "저장" }))

    expect(await screen.findByText("저장했습니다. 사용자 화면에 게시 중입니다.")).toBeInTheDocument()
    expect(mockedSave.mock.calls[0][1].get("id")).toBe("5")
    expect(screen.queryByText("저장하지 않은 변경 사항이 있습니다.")).toBeNull()
    // 저장된 공지에는 첨부 패널이 열린다.
    expect(within(screen.getByRole("region", { name: /첨부 파일/ })).getByLabelText("파일 올리기")).toBeInTheDocument()
  })

  it("액션이 돌려준 오류 문구를 보여 준다", async () => {
    mockedSave.mockResolvedValue({ error: "본문을 입력하세요.", message: null })
    render(<NoticeForm notice={notice} />)
    fireEvent.click(screen.getByRole("button", { name: "저장" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("본문을 입력하세요.")
  })

  it("처음 저장 직후(created)에는 첨부 안내를 보여 준다", () => {
    render(<NoticeForm notice={notice} created />)
    expect(screen.getByText("공지를 저장했습니다. 이제 첨부 파일을 올릴 수 있습니다.")).toBeInTheDocument()
  })

  it("저장하지 않은 변경이 있으면 링크 이동 전에 확인한다", async () => {
    render(<NoticeForm notice={null} />)
    fireEvent.change(screen.getByLabelText(/제목/), { target: { value: "작성 중" } })

    fireEvent.click(screen.getByRole("link", { name: "목록으로" }))
    const dialog = await screen.findByRole("dialog", { name: "저장하지 않고 나갈까요?" })
    fireEvent.click(within(dialog).getByRole("button", { name: "계속 작성" }))
    expect(push).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/제목/)).toHaveValue("작성 중")

    fireEvent.click(screen.getByRole("link", { name: "목록으로" }))
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "나가기" }))
    expect(push).toHaveBeenCalledWith("/admin/notices")
  })

  it("변경이 없으면 확인 없이 이동한다", () => {
    render(<NoticeForm notice={notice} />)
    fireEvent.click(screen.getByRole("link", { name: "목록으로" }))
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("삭제는 확인 후 액션을 부르고, 실패하면 문구를 보여 준다", async () => {
    mockedDelete.mockResolvedValue({ ok: false, error: "이 작업을 할 권한이 없습니다." })
    render(<NoticeForm notice={notice} />)
    fireEvent.click(screen.getByRole("button", { name: "삭제" }))
    const dialog = await screen.findByRole("dialog", { name: "공지를 삭제할까요?" })
    fireEvent.click(within(dialog).getByRole("button", { name: "삭제" }))
    await waitFor(() => expect(mockedDelete).toHaveBeenCalledWith(5))
    expect(await screen.findByText("이 작업을 할 권한이 없습니다.")).toBeInTheDocument()
  })
})

describe("leavingHref", () => {
  // jsdom 문서의 오리진 기준(앵커 href 가 그 오리진으로 풀린다).
  const here = new URL("/admin/notices/new", window.location.href) as unknown as Location

  function clickOn(html: string, init: MouseEventInit = {}) {
    document.body.innerHTML = html
    const a = document.body.querySelector("a")!
    const event = new MouseEvent("click", { bubbles: true, button: 0, ...init })
    Object.defineProperty(event, "target", { value: a })
    return leavingHref(event, here)
  }

  it("같은 오리진의 다른 화면이면 목적지를 돌려준다", () => {
    expect(clickOn(`<a href="/admin/banners?x=1#top">배너</a>`)).toBe("/admin/banners?x=1#top")
  })

  it("새 탭·다운로드·외부·같은 화면 해시·보조키 클릭은 통과시킨다", () => {
    expect(clickOn(`<a href="/admin" target="_blank">x</a>`)).toBeNull()
    expect(clickOn(`<a href="/file" download>x</a>`)).toBeNull()
    expect(clickOn(`<a href="https://example.com/">x</a>`)).toBeNull()
    expect(clickOn(`<a href="/admin/notices/new#section">x</a>`)).toBeNull()
    expect(clickOn(`<a href="/admin">x</a>`, { ctrlKey: true })).toBeNull()
  })
})
