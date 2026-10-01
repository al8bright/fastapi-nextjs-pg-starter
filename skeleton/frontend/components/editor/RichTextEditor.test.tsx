import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest"
import type { EditorUploadResult, UploadImageFn } from "@/lib/editor/upload"
import { transformImage } from "./imageCanvas"
import RichTextEditor from "./RichTextEditor"

// jsdom 에는 canvas·createImageBitmap 이 없다 — 브라우저 전용 모듈은 통째로 mock 한다.
vi.mock("./imageCanvas", () => ({
  decodeImage: vi.fn(async () => ({ width: 800, height: 600 })),
  sizeOf: (img: { width: number; height: number }) => ({ width: img.width, height: img.height }),
  drawPreview: vi.fn(),
  releaseImage: vi.fn(),
  transformImage: vi.fn(async (file: File) => ({ blob: file, filename: "converted.webp" })),
}))

// jsdom 에는 document.execCommand 도 없다 — insertHTML·delete·insertText 를 Range 로 흉내 낸다.
function installExecCommand(): Mock {
  const fn = vi.fn((command: string, _ui?: boolean, value?: string) => {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return false
    const range = sel.getRangeAt(0)
    if (command === "insertHTML" || command === "insertText") {
      range.deleteContents()
      const t = document.createElement("template")
      if (command === "insertHTML") t.innerHTML = value ?? ""
      else t.content.append(document.createTextNode(value ?? ""))
      const last = t.content.lastChild
      range.insertNode(t.content)
      if (last) {
        range.setStartAfter(last)
        range.collapse(true)
      }
      return true
    }
    if (command === "delete") {
      range.deleteContents()
      return true
    }
    return true
  })
  Object.defineProperty(document, "execCommand", { value: fn, configurable: true, writable: true })
  return fn
}

function caretAt(node: Node, offset = 0) {
  const range = document.createRange()
  range.setStart(node, offset)
  range.collapse(true)
  const sel = window.getSelection()!
  sel.removeAllRanges()
  sel.addRange(range)
}

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

const lastHtml = (onChange: Mock) => onChange.mock.calls.at(-1)?.[0] as string | undefined
const pngFile = (name = "photo.png") => new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" })

function setup(props: { initialHtml?: string; uploadImage?: UploadImageFn } = {}) {
  const onChange = vi.fn()
  const uploadImage =
    props.uploadImage ?? vi.fn(async (): Promise<EditorUploadResult> => ({ url: "/uploads/a.webp", width: 640, height: 360 }))
  render(<RichTextEditor initialHtml={props.initialHtml} onChange={onChange} uploadImage={uploadImage} />)
  const editor = screen.getByRole("textbox", { name: "본문" })
  return { onChange, uploadImage, editor }
}

describe("RichTextEditor", () => {
  let exec: Mock

  beforeEach(() => {
    exec = installExecCommand()
  })

  afterEach(() => {
    delete (document as { execCommand?: unknown }).execCommand
    vi.clearAllMocks()
  })

  it("접근 가능한 툴바와 여러 줄 편집 영역을 렌더하고 initialHtml 을 한 번 넣는다", () => {
    const { editor } = setup({ initialHtml: "<p>처음</p>" })
    const toolbar = screen.getByRole("toolbar", { name: "서식 도구" })
    expect(within(toolbar).getByRole("button", { name: "굵게 (Ctrl+B)" })).toHaveAttribute("aria-pressed", "false")
    expect(within(toolbar).getByRole("button", { name: "영상" })).not.toHaveAttribute("aria-pressed")
    expect(within(toolbar).getAllByRole("button").length).toBeGreaterThanOrEqual(20)
    // roving tabindex — 탭 정지는 하나뿐
    expect(within(toolbar).getAllByRole("button").filter((b) => b.tabIndex === 0)).toHaveLength(1)
    expect(editor).toHaveAttribute("aria-multiline", "true")
    expect(editor).toHaveAttribute("contenteditable", "true")
    expect(editor.innerHTML).toBe("<p>처음</p>")
    expect(editor).not.toHaveAttribute("data-empty")
  })

  it("빈 문서면 placeholder 를 보이고 빈 문단으로 시작한다", () => {
    const { editor } = setup()
    expect(editor).toHaveAttribute("data-empty", "true")
    expect(editor).toHaveAttribute("data-placeholder", "내용을 입력하세요")
    expect(editor.innerHTML).toBe("<p><br></p>")
  })

  it("입력하면 편집 전용 속성을 지운 직렬화 HTML 로 onChange 를 부른다", () => {
    const { editor, onChange } = setup()
    editor.innerHTML = `<p style="color:red"><b>안녕</b> <span style="x">세상</span><img src="/a.png" data-selected="true" draggable="false"></p>`
    fireEvent.input(editor)
    expect(onChange).toHaveBeenCalledWith(`<p><strong>안녕</strong> 세상<img src="/a.png"></p>`)
    expect(editor).not.toHaveAttribute("data-empty")
    // 같은 값이면 다시 부르지 않는다
    fireEvent.input(editor)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it("붙여넣은 HTML 을 정리해 insertHTML 로 넣는다", () => {
    const { editor, onChange } = setup({ initialHtml: "<p>앞</p>" })
    caretAt(editor.querySelector("p")!.firstChild!, 1)
    const html = `<p style="font-size:30px" onclick="x()">붙인 <b>글</b></p><script>alert(1)</script><iframe src="https://evil.com"></iframe>`
    fireEvent.paste(editor, {
      clipboardData: { getData: (t: string) => (t === "text/html" ? html : ""), files: [], items: [] },
    })
    expect(exec).toHaveBeenCalledWith("insertHTML", false, "<p>붙인 <strong>글</strong></p>")
    const out = lastHtml(onChange)!
    expect(out).toContain("<p>붙인 <strong>글</strong></p>")
    expect(out).not.toMatch(/script|iframe|style|onclick/)
  })

  it("여러 줄 일반 텍스트는 문단으로, 한 줄은 insertText 로 붙인다", () => {
    const { editor, onChange } = setup({ initialHtml: "<p>x</p>" })
    caretAt(editor.querySelector("p")!.firstChild!, 1)
    fireEvent.paste(editor, {
      clipboardData: { getData: (t: string) => (t === "text/plain" ? "a<b>\nc" : ""), files: [], items: [] },
    })
    expect(lastHtml(onChange)).toContain("<p>a&lt;b&gt;</p><p>c</p>")
    caretAt(editor.lastChild!, 0)
    fireEvent.paste(editor, {
      clipboardData: { getData: (t: string) => (t === "text/plain" ? "한 줄" : ""), files: [], items: [] },
    })
    expect(exec).toHaveBeenCalledWith("insertText", false, "한 줄")
  })

  describe("유튜브", () => {
    it("잘못된 링크는 거절하고, 올바른 링크는 고정 템플릿 마크업으로 넣는다", async () => {
      const { editor, onChange } = setup({ initialHtml: "<p>본문</p>" })
      caretAt(editor.querySelector("p")!.firstChild!, 2)
      fireEvent.click(screen.getByRole("button", { name: "영상" }))
      const dialog = screen.getByRole("dialog", { name: "유튜브 영상 넣기" })
      const input = within(dialog).getByLabelText("유튜브 링크")
      expect(input).toHaveFocus()

      fireEvent.change(input, { target: { value: "https://vimeo.com/12345" } })
      fireEvent.click(within(dialog).getByRole("button", { name: "넣기" }))
      expect(within(dialog).getByRole("alert")).toHaveTextContent("유튜브 링크만 넣을 수 있습니다.")
      expect(screen.getByRole("dialog")).toBeInTheDocument()

      fireEvent.change(input, { target: { value: "https://youtu.be/dQw4w9WgXcQ?t=3" } })
      fireEvent.keyDown(input, { key: "Enter" })
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())

      const wrapper = editor.querySelector("[data-youtube-video]")!
      expect(wrapper).toHaveAttribute("contenteditable", "false")
      const out = lastHtml(onChange)!
      expect(out).toContain(
        `<div class="video" data-youtube-video=""><iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" width="640" height="360" title="YouTube 영상" allowfullscreen=""></iframe></div>`,
      )
      expect(out).not.toContain("contenteditable")
      // 문서 끝 삽입이면 뒤에 빈 문단
      expect(wrapper.nextElementSibling?.outerHTML).toBe("<p><br></p>")
    })

    it("Esc 로 다이얼로그를 닫는다", () => {
      setup()
      fireEvent.click(screen.getByRole("button", { name: "영상" }))
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })
  })

  describe("이미지 업로드", () => {
    it("자르기 다이얼로그 → 그대로 넣기 → 자리표시 → 업로드 성공 시 응답 url 로 치환", async () => {
      const pending = deferred<EditorUploadResult>()
      const uploadImage = vi.fn(() => pending.promise)
      const { editor, onChange } = setup({ initialHtml: "<p>글</p>", uploadImage })
      caretAt(editor.querySelector("p")!.firstChild!, 1)
      fireEvent.click(screen.getByRole("button", { name: "이미지" }))
      fireEvent.change(screen.getByLabelText("이미지 파일 선택"), { target: { files: [pngFile()] } })

      const dialog = await screen.findByRole("dialog", { name: "이미지 자르기" })
      await within(dialog).findByTestId("crop-stage")
      fireEvent.click(within(dialog).getByRole("button", { name: "그대로 넣기" }))
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()

      // 업로드 중: 자리표시는 편집 영역에만 있고 직렬화 HTML 에는 없다
      expect(editor.querySelector("img[data-uploading]")).not.toBeNull()
      expect(screen.getByRole("status")).toHaveTextContent("이미지 올리는 중")
      expect(lastHtml(onChange) ?? "").not.toContain("<img")
      await waitFor(() => expect(uploadImage).toHaveBeenCalledTimes(1))
      expect(transformImage).toHaveBeenCalledWith(expect.any(File), { crop: null, rotate: 0 })
      expect(uploadImage).toHaveBeenCalledWith(expect.any(File), "converted.webp")

      await act(async () => pending.resolve({ url: "/uploads/public/editor/a.webp", width: 640, height: 360 }))
      await waitFor(() => expect(editor.querySelector("img[data-uploading]")).toBeNull())
      expect(editor.querySelector("img")).toHaveAttribute("src", "/uploads/public/editor/a.webp")
      expect(lastHtml(onChange)).toContain(`<img src="/uploads/public/editor/a.webp" alt="" width="640" height="360">`)
      expect(screen.queryByRole("status")).not.toBeInTheDocument()
    })

    it("자르기 적용 시 회전·자르기 값을 변환에 넘긴다", async () => {
      const { editor } = setup()
      caretAt(editor.querySelector("p")!, 0)
      fireEvent.change(screen.getByLabelText("이미지 파일 선택"), { target: { files: [pngFile()] } })
      const dialog = await screen.findByRole("dialog", { name: "이미지 자르기" })
      await within(dialog).findByTestId("crop-stage")
      fireEvent.click(within(dialog).getByRole("button", { name: "1:1" }))
      fireEvent.click(within(dialog).getByRole("button", { name: "오른쪽으로 90° 회전" }))
      fireEvent.click(within(dialog).getByRole("button", { name: "적용" }))
      await waitFor(() => expect(transformImage).toHaveBeenCalled())
      // 800×600 을 90° 회전 → 600×800, 1:1 가운데 → 600×600
      expect(transformImage).toHaveBeenCalledWith(expect.any(File), {
        crop: { x: 0, y: 100, width: 600, height: 600 },
        rotate: 90,
      })
    })

    it("업로드 실패 시 자리표시를 지우고 하단에 오류를 보인다", async () => {
      const uploadImage = vi.fn(async (): Promise<EditorUploadResult> => ({ error: "이미지는 5MB 이하만 올릴 수 있습니다." }))
      const { editor, onChange } = setup({ uploadImage })
      // 여러 장이면 다이얼로그 없이 바로 올린다
      fireEvent.change(screen.getByLabelText("이미지 파일 선택"), { target: { files: [pngFile("a.png"), pngFile("b.png")] } })
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
      expect(editor.querySelectorAll("img[data-uploading]")).toHaveLength(2)

      expect(await screen.findByRole("alert")).toHaveTextContent("이미지는 5MB 이하만 올릴 수 있습니다.")
      await waitFor(() => expect(editor.querySelectorAll("img")).toHaveLength(0))
      expect(uploadImage).toHaveBeenCalledTimes(2)
      expect(lastHtml(onChange) ?? "").not.toContain("<img")
      expect(editor).toHaveAttribute("aria-describedby")
    })

    it("허용하지 않는 파일은 올리지 않고 안내한다", () => {
      const { uploadImage } = setup()
      const pdf = new File(["x"], "a.pdf", { type: "application/pdf" })
      fireEvent.change(screen.getByLabelText("이미지 파일 선택"), { target: { files: [pdf] } })
      expect(screen.getByRole("alert")).toHaveTextContent("PNG·JPEG·WebP·GIF 이미지만 올릴 수 있습니다.")
      expect(uploadImage).not.toHaveBeenCalled()
    })

    it("이미지 파일 붙여넣기도 같은 경로로 올린다", async () => {
      const { editor, uploadImage } = setup()
      caretAt(editor.querySelector("p")!, 0)
      const gif = new File([new Uint8Array([1])], "a.gif", { type: "image/gif" })
      fireEvent.paste(editor, { clipboardData: { getData: () => "", files: [gif], items: [] } })
      // GIF 는 자르기 다이얼로그 없이 바로
      await waitFor(() => expect(uploadImage).toHaveBeenCalledTimes(1))
      await waitFor(() => expect(editor.querySelector('img[src="/uploads/a.webp"]')).not.toBeNull())
    })
  })

  describe("미디어 선택", () => {
    const IMG = `<p><img src="/uploads/a.webp" alt="" width="1600" height="900"></p>`

    it("이미지를 누르면 오버레이가 뜨고, 크기 프리셋은 selectNode + insertHTML 로 커밋한다", async () => {
      const { editor, onChange } = setup({ initialHtml: IMG })
      fireEvent.click(editor.querySelector("img")!)
      const tools = await screen.findByRole("toolbar", { name: "이미지 도구" })
      expect(editor.querySelector("img")).toHaveAttribute("data-selected", "true")
      fireEvent.click(within(tools).getByRole("button", { name: "중" }))
      expect(exec).toHaveBeenCalledWith("insertHTML", false, expect.stringContaining(`width="640" height="360"`))
      expect(lastHtml(onChange)).toBe(`<p><img src="/uploads/a.webp" alt="" width="640" height="360"></p>`)
      // 치환 뒤에도 새 노드가 선택돼 있다
      expect(editor.querySelector("img")).toHaveAttribute("data-selected", "true")
    })

    it("원본보다 큰 프리셋은 비활성", async () => {
      const { editor } = setup({ initialHtml: `<p><img src="/a.webp" alt="" width="500" height="250"></p>` })
      fireEvent.click(editor.querySelector("img")!)
      const tools = await screen.findByRole("toolbar", { name: "이미지 도구" })
      expect(within(tools).getByRole("button", { name: "중" })).toBeDisabled()
      expect(within(tools).getByRole("button", { name: "소" })).toBeEnabled()
    })

    it("선택 상태에서 Delete 는 이미지를 지운다", async () => {
      const { editor, onChange } = setup({ initialHtml: `<p>a</p>${IMG}` })
      fireEvent.click(editor.querySelector("img")!)
      await screen.findByRole("toolbar", { name: "이미지 도구" })
      fireEvent.keyDown(editor, { key: "Delete" })
      expect(exec).toHaveBeenCalledWith("delete", false, undefined)
      expect(editor.querySelector("img")).toBeNull()
      expect(lastHtml(onChange)).not.toContain("<img")
      expect(screen.queryByRole("toolbar", { name: "이미지 도구" })).not.toBeInTheDocument()
    })

    it("대체 텍스트를 바꾼다", async () => {
      const { editor, onChange } = setup({ initialHtml: IMG })
      fireEvent.click(editor.querySelector("img")!)
      const tools = await screen.findByRole("toolbar", { name: "이미지 도구" })
      fireEvent.click(within(tools).getByRole("button", { name: "대체 텍스트" }))
      const dialog = screen.getByRole("dialog", { name: "대체 텍스트" })
      fireEvent.change(within(dialog).getByLabelText("이미지 설명"), { target: { value: `고양이 "나비"` } })
      fireEvent.click(within(dialog).getByRole("button", { name: "적용" }))
      expect(lastHtml(onChange)).toContain(`alt="고양이 &quot;나비&quot;"`)
    })

    it("영상을 누르면 영상 도구가 뜨고 Esc 로 선택을 푼다", async () => {
      const video = `<div class="video" data-youtube-video><iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" width="640" height="360" title="YouTube 영상" allowfullscreen></iframe></div><p>뒤</p>`
      const { editor } = setup({ initialHtml: video })
      expect(editor.querySelector("[data-youtube-video]")).toHaveAttribute("contenteditable", "false")
      fireEvent.click(editor.querySelector("[data-youtube-video]")!)
      const tools = await screen.findByRole("toolbar", { name: "영상 도구" })
      expect(within(tools).getByRole("button", { name: "전체 폭" })).toBeEnabled()
      fireEvent.keyDown(editor, { key: "Escape" })
      await waitFor(() => expect(screen.queryByRole("toolbar", { name: "영상 도구" })).not.toBeInTheDocument())
    })
  })

  it("정렬은 class 로만 저장한다(style 금지)", () => {
    const { editor, onChange } = setup({ initialHtml: "<p>가운데</p>" })
    caretAt(editor.querySelector("p")!.firstChild!, 1)
    fireEvent.click(screen.getByRole("button", { name: "가운데 정렬" }))
    expect(lastHtml(onChange)).toBe(`<p class="align-center">가운데</p>`)
    expect(screen.getByRole("button", { name: "가운데 정렬" })).toHaveAttribute("aria-pressed", "true")
    // 다시 누르면 해제
    fireEvent.click(screen.getByRole("button", { name: "가운데 정렬" }))
    expect(lastHtml(onChange)).toBe("<p>가운데</p>")
  })

  it("형광펜은 선택을 <mark> 로 감싼다", () => {
    const { editor, onChange } = setup({ initialHtml: "<p>형광펜</p>" })
    const text = editor.querySelector("p")!.firstChild!
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 2)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
    fireEvent.click(screen.getByRole("button", { name: "형광펜" }))
    expect(lastHtml(onChange)).toBe("<p><mark>형광</mark>펜</p>")
  })
})
