import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { deleteAttachmentAction, uploadAttachmentAction } from "@/lib/actions/notices"
import type { Attachment } from "@/lib/types"
import AttachmentsPanel, { planUploads } from "./AttachmentsPanel"

// 첨부 패널(클라이언트) — 사전 검사, 파일별 순차 업로드(Server Action), 실패 문구, 관리자 다운로드 링크, 삭제 확인.
vi.mock("@/lib/actions/notices", () => ({
  uploadAttachmentAction: vi.fn(),
  deleteAttachmentAction: vi.fn(),
  saveNoticeAction: vi.fn(),
  deleteNoticeAction: vi.fn(),
}))
const mockedUpload = vi.mocked(uploadAttachmentAction)
const mockedDelete = vi.mocked(deleteAttachmentAction)

const existing: Attachment[] = [
  { id: 9, original_name: "안내문.pdf", size_bytes: 2048, content_type: "application/pdf", download_url: "/api/v1/notices/5/attachments/9" },
]

function file(name: string, size = 10): File {
  return new File([new Uint8Array(size)], name)
}

describe("planUploads", () => {
  it("형식·빈 파일·남은 자리를 미리 검사한다", () => {
    const items = planUploads([file("a.pdf"), file("b.exe"), file("c.txt", 0), file("d.hwp")], 9, 1)
    expect(items.map((i) => i.status)).toEqual(["waiting", "error", "error", "error"])
    expect(items[1].error).toContain("허용되지 않는 형식")
    expect(items[2].error).toBe("빈 파일은 올릴 수 없습니다.")
    expect(items[3].error).toContain("10개까지")
  })
})

describe("AttachmentsPanel", () => {
  beforeEach(() => vi.clearAllMocks())

  it("관리자 다운로드는 Route Handler 경로로 링크한다", () => {
    render(<AttachmentsPanel noticeId={5} attachments={existing} />)
    const link = screen.getByRole("link", { name: /내려받기/ })
    expect(link).toHaveAttribute("href", "/admin/notices/5/attachments/9")
    expect(link).toHaveAttribute("download", "안내문.pdf")
    expect(screen.getByRole("heading", { name: /첨부 파일/ })).toHaveTextContent("(1/10)")
  })

  it("고른 파일을 순서대로 올리고 파일별 결과를 보여 준다", async () => {
    mockedUpload.mockResolvedValueOnce({ ok: true, data: undefined }).mockResolvedValueOnce({ ok: false, error: "파일이 너무 큽니다." })
    const user = userEvent.setup({ applyAccept: false })
    render(<AttachmentsPanel noticeId={5} attachments={[]} />)

    await user.upload(screen.getByLabelText("파일 올리기"), [file("a.pdf"), file("b.zip"), file("c.exe")])

    const progress = screen.getByRole("list", { name: "업로드 진행 상황" })
    await waitFor(() => expect(mockedUpload).toHaveBeenCalledTimes(2))
    expect(mockedUpload.mock.calls[0][0]).toBe(5)
    expect((mockedUpload.mock.calls[0][1].get("file") as File).name).toBe("a.pdf")
    expect((mockedUpload.mock.calls[1][1].get("file") as File).name).toBe("b.zip")
    await waitFor(() => expect(within(progress).getByText("파일이 너무 큽니다.")).toBeInTheDocument())
    expect(within(progress).getByText("완료")).toBeInTheDocument()
    expect(within(progress).getByText(/허용되지 않는 형식/)).toBeInTheDocument()
  })

  it("삭제는 확인 후 액션을 부르고 결과를 알린다", async () => {
    mockedDelete.mockResolvedValue({ ok: true, data: undefined })
    const user = userEvent.setup()
    render(<AttachmentsPanel noticeId={5} attachments={existing} />)
    await user.click(screen.getByRole("button", { name: /삭제/ }))
    await user.click(within(screen.getByRole("dialog", { name: "첨부 파일을 삭제할까요?" })).getByRole("button", { name: "삭제" }))
    expect(mockedDelete).toHaveBeenCalledWith(5, 9)
    expect(await screen.findByText("안내문.pdf 을(를) 삭제했습니다.")).toBeInTheDocument()
  })
})
