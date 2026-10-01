import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { saveBannerAction, uploadBannerImageAction } from "@/lib/actions/banners"
import BannerForm from "./BannerForm"

// 배너 폼(클라이언트) — 화면 검증(이미지·제목·대체 텍스트·링크·기간), 이미지 업로드 액션, 저장 FormData.
vi.mock("@/lib/actions/banners", () => ({
  saveBannerAction: vi.fn(),
  uploadBannerImageAction: vi.fn(),
}))
const mockedSave = vi.mocked(saveBannerAction)
const mockedUpload = vi.mocked(uploadBannerImageAction)

describe("BannerForm", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedSave.mockResolvedValue({ error: null })
  })

  it("필수값이 비면 액션을 부르지 않고 오류를 보여 준다", async () => {
    render(<BannerForm banner={null} />)
    fireEvent.change(screen.getByLabelText("링크 URL"), { target: { value: "//evil.example" } })
    fireEvent.click(screen.getByRole("button", { name: "저장" }))

    expect(await screen.findByText("배너 이미지를 올리세요.")).toBeInTheDocument()
    expect(screen.getByText("제목을 입력하세요.")).toBeInTheDocument()
    expect(screen.getByText(/대체 텍스트를 입력하세요/)).toBeInTheDocument()
    expect(screen.getByText(/링크는 http\(s\) 주소/)).toBeInTheDocument()
    expect(mockedSave).not.toHaveBeenCalled()
  })

  it("이미지를 올리면 미리보기를 보이고, 저장 때 image_key 와 값을 FormData 로 넘긴다", async () => {
    mockedUpload.mockResolvedValue({
      ok: true,
      data: { key: "public/banners/a.webp", url: "/uploads/public/banners/a.webp", width: 1440, height: 480 },
    })
    const user = userEvent.setup()
    render(<BannerForm banner={null} />)

    await user.upload(screen.getByLabelText(/배너 이미지/), new File([new Uint8Array(10)], "a.png", { type: "image/png" }))
    expect(await screen.findByAltText("업로드한 배너 미리보기")).toHaveAttribute("src", "/uploads/public/banners/a.webp")
    expect((mockedUpload.mock.calls[0][0].get("file") as File).name).toBe("a.png")

    fireEvent.change(screen.getByLabelText(/^제목/), { target: { value: "가을 행사" } })
    fireEvent.change(screen.getByLabelText(/대체 텍스트/), { target: { value: "가을 행사 안내" } })
    fireEvent.change(screen.getByLabelText("링크 URL"), { target: { value: "/notices/1" } })
    fireEvent.click(screen.getByRole("button", { name: "저장" }))

    await waitFor(() => expect(mockedSave).toHaveBeenCalledTimes(1))
    const fd = mockedSave.mock.calls[0][1]
    expect(fd.get("image_key")).toBe("public/banners/a.webp")
    expect(fd.get("title")).toBe("가을 행사")
    expect(fd.get("alt_text")).toBe("가을 행사 안내")
    expect(fd.get("link_url")).toBe("/notices/1")
    expect(fd.get("is_active")).toBe("on")
    expect(fd.get("id")).toBeNull()
  })

  it("이미지 업로드 실패 문구를 이미지 칸에 보여 준다", async () => {
    mockedUpload.mockResolvedValue({ ok: false, error: "파일이 너무 큽니다. 5MB 이하만 올릴 수 있습니다." })
    const user = userEvent.setup()
    render(<BannerForm banner={null} />)
    await user.upload(screen.getByLabelText(/배너 이미지/), new File([new Uint8Array(10)], "a.png", { type: "image/png" }))
    expect(await screen.findByText("파일이 너무 큽니다. 5MB 이하만 올릴 수 있습니다.")).toBeInTheDocument()
  })

  it("저장 실패(액션 상태의 error)를 폼 위에 보여 준다", async () => {
    mockedSave.mockResolvedValue({ error: "이미지를 다시 올려 주세요. (올린 이미지를 찾을 수 없습니다)" })
    render(
      <BannerForm
        banner={{
          id: 3,
          title: "기존",
          image_key: "public/banners/x.webp",
          image_url: "/uploads/public/banners/x.webp",
          image_width: 1440,
          image_height: 480,
          link_url: null,
          alt_text: "기존 배너",
          starts_at: null,
          ends_at: null,
          sort_order: 0,
          is_active: true,
          created_at: "2026-10-02T10:00:00",
          updated_at: "2026-10-02T10:00:00",
        }}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "저장" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("이미지를 다시 올려 주세요.")
    expect(mockedSave.mock.calls[0][1].get("id")).toBe("3")
  })
})
