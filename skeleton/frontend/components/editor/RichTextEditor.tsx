"use client"

import {
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { youtubeEmbedHtml, extractYoutubeId, imageHtml, serializeEditorHtml, youtubeIdFromEmbedSrc } from "@/lib/editor/mediaHtml"
import { sizeForWidth, type Size, videoSizeForWidth } from "@/lib/editor/imageTransform"
import {
  cleanPastedHtml,
  EDITOR_IMAGE_TYPES,
  editorImageProblem,
  escapeHtml,
  isRichTextEmpty,
  normalizeLinkUrl,
  plainTextToHtml,
} from "@/lib/editor/richText"
import type { EditorUploadResult, UploadImageFn } from "@/lib/editor/upload"
import {
  type ActiveState,
  applyLink,
  caretAfter,
  clearFormatting,
  closestLink,
  decorateEditable,
  deleteNode,
  EMPTY_ACTIVE,
  exec,
  insertHtmlAt,
  isAtDocumentEnd,
  rangeAtEnd,
  rangeFromPoint,
  readActiveState,
  removeLink,
  replaceNode,
  selectRange,
  selectionRangeIn,
  setBlock,
  toggleAlign,
  toggleMark,
} from "./editorDom"
import EditorToolbar, { type ToolbarCommand } from "./EditorToolbar"
import ImageCropDialog, { type CropResult } from "./ImageCropDialog"
import { transformImage } from "./imageCanvas"
import MediaOverlay from "./MediaOverlay"
import TextPromptDialog from "./TextPromptDialog"

// 자체 리치 텍스트 에디터 (editor-spec 전체). contentEditable + execCommand, 라이브러리 없음.
//
// 비제어 컴포넌트다 — initialHtml 은 마운트 때 한 번만 쓰고 이후 변경은 무시한다(대상이 바뀌면 key 로 재마운트).
// 입력 중에는 innerHTML 을 다시 쓰지 않는다(캐럿·undo 스택 보존). 변경은 onChange(직렬화 HTML)로만 알린다.
// 저장 전 정화는 백엔드 서비스 계층의 sanitize_html 몫이다 — 이 컴포넌트는 정화하지 않는다.

export interface RichTextEditorProps {
  /** 마운트 시 한 번 넣는 HTML(서버가 정화해 돌려준 본문). */
  initialHtml?: string
  /** 편집 전용 속성을 지운 직렬화 HTML. 빈 문서면 "". */
  onChange: (html: string) => void
  /** 이미지 업로드 함수 — reject 하지 않고 실패는 `{ error }`. 이 템플릿에서는 Server Action(lib/actions/editor.ts)을 감싼 함수를 넘긴다. */
  uploadImage: UploadImageFn
  placeholder?: string
  /** 편집 영역의 aria-labelledby (보이는 라벨 요소 id). 없으면 aria-label="본문". */
  labelId?: string
  className?: string
}

type Selected = { el: HTMLElement; kind: "image" | "video" }

type DialogState =
  | { type: "link"; range: Range | null; initial: string }
  | { type: "youtube"; range: Range | null; target: HTMLElement | null; initial: string }
  | { type: "alt"; target: HTMLImageElement }
  | { type: "crop-insert"; file: File; range: Range | null }
  | { type: "crop-again"; file: File; target: HTMLImageElement }
  | null

interface UploadItem {
  file: File
  edit: CropResult | null
}

const ACCEPT = EDITOR_IMAGE_TYPES.join(",")
const BLANK_GIF = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="
const RECROP_ERROR = "이 이미지는 다시 자를 수 없습니다. 새로 올려 주세요."

let uploadSeq = 0

/** 커밋 마크업에 선택 표식을 붙여, 치환 뒤 새 노드를 다시 찾는다(직렬화 때 제거됨). */
const withSelectedMarker = (html: string) => html.replace(/^<(\w+)/, '<$1 data-selected="true"')

function imageNatural(img: HTMLImageElement): Size {
  const attrW = Number.parseInt(img.getAttribute("width") ?? "", 10)
  const attrH = Number.parseInt(img.getAttribute("height") ?? "", 10)
  const width = img.naturalWidth || attrW || 0
  const height = img.naturalHeight || attrH || 0
  return width > 0 && height > 0 ? { width, height } : { width: 1600, height: 900 }
}

function currentWidthOf(sel: Selected): number {
  const el = sel.kind === "image" ? sel.el : sel.el.querySelector("iframe")
  const attr = Number.parseInt(el?.getAttribute("width") ?? "", 10)
  if (Number.isFinite(attr) && attr > 0) return attr
  return sel.kind === "image" ? imageNatural(sel.el as HTMLImageElement).width : 640
}

function imageFilesFrom(data: DataTransfer | null): File[] {
  if (!data) return []
  const files = Array.from(data.files ?? []).filter((f) => f.type.startsWith("image/"))
  if (files.length) return files
  return Array.from(data.items ?? [])
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((f): f is File => f !== null)
}

function filenameFromUrl(src: string): string {
  try {
    return decodeURIComponent(new URL(src, window.location.href).pathname.split("/").pop() || "image")
  } catch {
    return "image"
  }
}

export default function RichTextEditor({
  initialHtml,
  onChange,
  uploadImage,
  placeholder = "내용을 입력하세요",
  labelId,
  className = "",
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const replaceInputRef = useRef<HTMLInputElement>(null)
  const pendingRangeRef = useRef<Range | null>(null)
  const savedRangeRef = useRef<Range | null>(null)
  const replaceTargetRef = useRef<HTMLImageElement | null>(null)
  // 이 세션에서 올린 이미지의 원본 — 다시 자르기에 쓴다(서버 재인코딩본 대신 원본 화질).
  const originalsRef = useRef(new Map<string, File>())
  const lastHtmlRef = useRef<string | null>(null)
  const onChangeRef = useRef(onChange)
  const uploadRef = useRef(uploadImage)

  const [initial] = useState(initialHtml)
  const [empty, setEmpty] = useState(() => isRichTextEmpty(initialHtml))
  const [active, setActive] = useState<ActiveState>(EMPTY_ACTIVE)
  const [selected, setSelected] = useState<Selected | null>(null)
  const [dialog, setDialog] = useState<DialogState>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(0)
  // 커밋 뒤 오버레이를 다시 그리기 위한 카운터(폭 입력 초기화 등).
  const [revision, setRevision] = useState(0)
  // 오버레이 기준 래퍼 — 렌더 중 ref 를 읽지 않도록 콜백 ref 로 state 에 둔다.
  const [wrapperEl, setWrapperEl] = useState<HTMLDivElement | null>(null)

  const editorId = useId()
  const errorId = useId()

  // 최신 콜백을 ref 에 둔다 — 업로드 완료처럼 렌더 밖(비동기)에서 부를 때 오래된 클로저를 쓰지 않도록.
  useLayoutEffect(() => {
    onChangeRef.current = onChange
    uploadRef.current = uploadImage
  })

  // 마운트 시 한 번 초기 HTML 을 넣는다.
  useLayoutEffect(() => {
    const el = editorRef.current
    if (!el) return
    el.innerHTML = initial && initial.trim() ? initial : "<p><br></p>"
    decorateEditable(el)
    lastHtmlRef.current = serializeEditorHtml(el.innerHTML)
  }, [initial])

  /** 직렬화해 onChange — 이전 값과 같으면 부르지 않는다. 모든 변경 경로가 이 함수로 모인다. */
  const emitChange = useCallback(() => {
    const el = editorRef.current
    if (!el) return
    const raw = el.innerHTML
    const html = serializeEditorHtml(raw)
    setEmpty(isRichTextEmpty(raw) && !el.querySelector("hr, table"))
    setSelected((prev) => (prev && !prev.el.isConnected ? null : prev))
    if (html !== lastHtmlRef.current) {
      lastHtmlRef.current = html
      onChangeRef.current(html)
    }
  }, [])

  // 선택 변화 — 툴바 활성 상태, 마지막 선택 위치 저장, 미디어 선택 해제.
  useEffect(() => {
    const onSelectionChange = () => {
      const el = editorRef.current
      if (!el) return
      const range = selectionRangeIn(el)
      if (!range) return
      savedRangeRef.current = range
      const next = readActiveState(el)
      setActive((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
      setSelected((prev) => {
        if (!prev) return prev
        const touches = range.intersectsNode(prev.el) || prev.el.contains(range.startContainer)
        return touches ? prev : null
      })
    }
    document.addEventListener("selectionchange", onSelectionChange)
    return () => document.removeEventListener("selectionchange", onSelectionChange)
  }, [])

  // 선택 표식(data-selected) 동기화 — 편집 전용 속성이라 undo 와 무관하다.
  useEffect(() => {
    const el = editorRef.current
    if (!el) return
    el.querySelectorAll("[data-selected]").forEach((n) => {
      if (n !== selected?.el) n.removeAttribute("data-selected")
    })
    selected?.el.setAttribute("data-selected", "true")
  }, [selected, revision])

  // 미디어 선택 중 에디터 바깥을 누르면 해제(오버레이·다이얼로그 안은 제외).
  useEffect(() => {
    if (!selected) return
    const onDown = (e: globalThis.MouseEvent) => {
      const t = e.target as Node
      if (wrapperEl?.contains(t)) return
      if (t instanceof Element && t.closest("[role=dialog]")) return
      setSelected(null)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [selected, wrapperEl])

  const editorHasFocus = () => {
    const el = editorRef.current
    return Boolean(el && document.activeElement && el.contains(document.activeElement))
  }

  /** 포커스를 편집 영역으로 되돌리고 마지막 선택을 복원한다(툴바·다이얼로그에서 돌아올 때). */
  const focusEditor = (range: Range | null = savedRangeRef.current) => {
    const el = editorRef.current
    if (!el) return
    if (!editorHasFocus()) el.focus({ preventScroll: true })
    if (range && el.contains(range.commonAncestorContainer)) selectRange(range)
  }

  /**
   * 사용자의 현재 선택을 보존하며 노드를 치환/삭제한다(업로드 완료 등 비동기 커밋).
   * 편집 영역에 포커스가 없으면 execCommand 가 포커스를 빼앗지 않도록 DOM 직접 치환으로 처리한다.
   */
  const commitAsync = (fn: () => void) => {
    const el = editorRef.current
    if (!el) return
    const keep = editorHasFocus() ? selectionRangeIn(el) : null
    const focused = document.activeElement as HTMLElement | null
    fn()
    if (keep && el.contains(keep.startContainer)) selectRange(keep)
    else if (!keep && focused && focused !== document.body && !el.contains(focused)) focused.focus({ preventScroll: true })
    decorateEditable(el)
    emitChange()
  }

  const selectMedia = (node: HTMLElement | null) => {
    if (!node) {
      setSelected(null)
      return
    }
    const kind = node.matches("img") ? "image" : "video"
    const range = document.createRange()
    range.selectNode(node)
    selectRange(range)
    setSelected({ el: node, kind })
    // 다른 미디어로 옮겨 가도 오버레이(폭 입력 등)를 새로 그린다.
    setRevision((r) => r + 1)
  }

  /** 치환 커밋 후 표식으로 새 노드를 찾아 다시 선택한다. */
  const reselectMarked = () => {
    const el = editorRef.current
    const next = el?.querySelector<HTMLElement>("[data-selected]")
    if (next) selectMedia(next)
    else setSelected(null)
  }

  // ---------- 이미지 업로드 ----------

  const safeUpload = async (blob: Blob, filename: string): Promise<EditorUploadResult> => {
    try {
      return await uploadRef.current(blob, filename)
    } catch {
      // 계약상 reject 하지 않지만, 방어적으로 문구를 만든다.
      return { error: "이미지를 올리지 못했습니다. 잠시 후 다시 시도해 주세요." }
    }
  }

  const prepare = async (file: File, edit: CropResult | null) => {
    try {
      return await transformImage(file, { crop: edit?.crop ?? null, rotate: edit?.rotate ?? 0 })
    } catch {
      return { blob: file as Blob, filename: file.name || "image" }
    }
  }

  /** 자리표시를 넣고 각 파일을 변환·업로드한 뒤 결과로 치환(실패 시 제거 + 오류). */
  const insertUploads = (items: UploadItem[], range: Range | null) => {
    const el = editorRef.current
    if (!el || !items.length) return
    const entries = items.map((item) => {
      uploadSeq += 1
      const id = `u${Date.now().toString(36)}${uploadSeq}`
      const preview = typeof URL.createObjectURL === "function" ? URL.createObjectURL(item.file) : BLANK_GIF
      return { ...item, id, preview }
    })
    const placeholders = entries
      .map((e) => `<img data-uploading="${e.id}" src="${escapeHtml(e.preview)}" alt="업로드 중">`)
      .join("")
    const target = range && el.contains(range.commonAncestorContainer) ? range : rangeAtEnd(el)
    // 편집 영역 바로 아래(문단 밖)에 들어가면 문단으로 감싼다.
    const html = target.startContainer === el ? `<p>${placeholders}</p>` : placeholders
    focusEditor(target)
    insertHtmlAt(el, target, html)
    decorateEditable(el)
    emitChange()
    setError(null)

    for (const entry of entries) {
      setUploading((n) => n + 1)
      void (async () => {
        const prepared = await prepare(entry.file, entry.edit)
        const result = await safeUpload(prepared.blob, prepared.filename)
        if (entry.preview.startsWith("blob:")) URL.revokeObjectURL(entry.preview)
        setUploading((n) => n - 1)
        const placeholder = editorRef.current?.querySelector<HTMLImageElement>(`img[data-uploading="${entry.id}"]`)
        if ("error" in result) {
          setError(result.error)
          if (placeholder) commitAsync(() => removeNodeCommitted(placeholder))
          return
        }
        originalsRef.current.set(result.url, entry.file)
        // 사용자가 업로드 중 자리표시를 지웠으면 넣지 않는다.
        if (!placeholder) return
        const markup = imageHtml({ src: result.url, alt: "", width: result.width, height: result.height })
        commitAsync(() => replaceNodeCommitted(placeholder, markup))
      })()
    }
  }

  // 포커스 여부에 따라 exec(undo 가능) 또는 직접 치환.
  const replaceNodeCommitted = (node: Element, html: string) => replaceNode(node, html, !editorHasFocus())
  const removeNodeCommitted = (node: Element) => deleteNode(node, !editorHasFocus())

  /** 버튼·붙여넣기·드롭으로 들어온 파일 처리 — 사전 검사 후 1장(GIF 제외)이면 자르기 다이얼로그. */
  const handleFiles = (files: File[], range: Range | null) => {
    const valid: File[] = []
    let problem: string | null = null
    for (const file of files) {
      const p = editorImageProblem(file)
      if (p) problem ??= p
      else valid.push(file)
    }
    setError(problem)
    if (!valid.length) return
    if (valid.length === 1 && valid[0].type !== "image/gif") {
      setDialog({ type: "crop-insert", file: valid[0], range })
      return
    }
    // 여러 장은 다이얼로그 없이 전부 "그대로 넣기".
    insertUploads(
      valid.map((file) => ({ file, edit: null })),
      range,
    )
  }

  /** 다시 자르기 — 세션 원본 또는 fetch(src). 결과는 새 파일로 업로드 후 src 교체. */
  const startRecrop = async (img: HTMLImageElement) => {
    const src = img.getAttribute("src") ?? ""
    let file = originalsRef.current.get(src) ?? null
    if (!file) {
      try {
        // 공개 이미지 파일은 같은 오리진의 /uploads/*(next.config.ts rewrite → 백엔드)라 fetch 로 바로 받는다
        // (CSP connect-src 'self' 로 충분하다). PUBLIC_FILES_BASE_URL 로 다른 오리진을 쓰면 CORS·CSP 에 막혀 실패할 수 있다.
        const res = await fetch(src)
        if (!res.ok) throw new Error(String(res.status))
        const blob = await res.blob()
        if (!blob.type.startsWith("image/")) throw new Error(blob.type)
        file = new File([blob], filenameFromUrl(src), { type: blob.type })
      } catch {
        setError(RECROP_ERROR)
        return
      }
    }
    if (file.type === "image/gif") {
      setError("GIF 이미지는 자를 수 없습니다.")
      return
    }
    setDialog({ type: "crop-again", file, target: img })
  }

  const finishRecrop = async (target: HTMLImageElement, file: File, edit: CropResult) => {
    setUploading((n) => n + 1)
    const prepared = await prepare(file, edit)
    const result = await safeUpload(prepared.blob, prepared.filename)
    setUploading((n) => n - 1)
    if ("error" in result) {
      setError(result.error)
      return
    }
    originalsRef.current.set(result.url, file)
    if (!target.isConnected) return
    const keepWidth = Number.parseInt(target.getAttribute("width") ?? "", 10)
    const size = sizeForWidth(result, Number.isFinite(keepWidth) ? keepWidth : result.width)
    const markup = imageHtml({ src: result.url, alt: target.getAttribute("alt") ?? "", ...size })
    commitAsync(() => replaceNodeCommitted(target, markup))
    setSelected(null)
  }

  const finishReplace = async (target: HTMLImageElement, file: File) => {
    const problem = editorImageProblem(file)
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    setUploading((n) => n + 1)
    const prepared = await prepare(file, null)
    const result = await safeUpload(prepared.blob, prepared.filename)
    setUploading((n) => n - 1)
    if ("error" in result) {
      setError(result.error)
      return
    }
    originalsRef.current.set(result.url, file)
    if (!target.isConnected) return
    const markup = imageHtml({
      src: result.url,
      alt: target.getAttribute("alt") ?? "",
      width: result.width,
      height: result.height,
    })
    commitAsync(() => replaceNodeCommitted(target, markup))
    setSelected(null)
  }

  // ---------- 미디어 커밋 (§6: selectNode → insertHTML) ----------

  const resizeSelected = (width: number) => {
    if (!selected) return
    const { el, kind } = selected
    let html: string | null = null
    if (kind === "image") {
      const img = el as HTMLImageElement
      const size = sizeForWidth(imageNatural(img), width)
      html = imageHtml({ src: img.getAttribute("src") ?? "", alt: img.getAttribute("alt") ?? "", ...size })
    } else {
      const id = youtubeIdFromEmbedSrc(el.querySelector("iframe")?.getAttribute("src"))
      if (id) html = youtubeEmbedHtml(id, videoSizeForWidth(width).width, true)
    }
    if (!html) return
    focusEditor(null)
    replaceNode(el, withSelectedMarker(html))
    decorateEditable(editorRef.current!)
    reselectMarked()
    emitChange()
  }

  const deleteSelected = () => {
    if (!selected) return
    focusEditor(null)
    deleteNode(selected.el)
    setSelected(null)
    emitChange()
  }

  // ---------- 툴바 ----------

  const runCommand = (command: ToolbarCommand) => {
    const el = editorRef.current
    if (!el) return
    const range = selectionRangeIn(el) ?? savedRangeRef.current
    if (command === "image") {
      pendingRangeRef.current = range
      fileInputRef.current?.click()
      return
    }
    if (command === "video") {
      setDialog({ type: "youtube", range, target: null, initial: "" })
      return
    }
    if (command === "link") {
      const href = closestLink(range?.startContainer ?? null, el)?.getAttribute("href") ?? ""
      setDialog({ type: "link", range, initial: href })
      return
    }
    focusEditor(range)
    // execCommand 기본값: 문단 구분자 <p>, 서식은 태그로(style 금지 §0-2).
    exec("defaultParagraphSeparator", "p")
    exec("styleWithCSS", "false")
    switch (command) {
      case "undo":
      case "redo":
        exec(command)
        break
      case "p":
      case "h2":
      case "h3":
      case "blockquote":
        setBlock(el, command)
        break
      case "bold":
      case "italic":
      case "underline":
        exec(command)
        break
      case "strike":
        exec("strikeThrough")
        break
      case "mark":
        setError(toggleMark(el))
        break
      case "clear":
        clearFormatting(el)
        break
      case "align-left":
      case "align-center":
      case "align-right":
        toggleAlign(el, command.replace("align-", "") as "left" | "center" | "right")
        break
      case "ul":
        exec("insertUnorderedList")
        break
      case "ol":
        exec("insertOrderedList")
        break
      case "hr":
        if (!exec("insertHorizontalRule")) insertHtmlAt(el, selectionRangeIn(el), "<hr>")
        break
      case "unlink":
        removeLink(el)
        break
    }
    decorateEditable(el)
    emitChange()
    setActive(readActiveState(el))
  }

  // ---------- 편집 영역 이벤트 ----------

  const onInput = () => {
    const el = editorRef.current
    if (el) decorateEditable(el)
    emitChange()
  }

  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    const el = editorRef.current
    if (!el) return
    const data = e.clipboardData
    const html = data.getData("text/html")
    const text = data.getData("text/plain")
    const files = imageFilesFrom(data)
    const range = selectionRangeIn(el)
    // 워드·엑셀은 서식 HTML 과 함께 "그림" 표현을 같이 싣는다 — 글자가 있는 HTML 이면 HTML 을 우선한다.
    const htmlHasText = html ? !isRichTextEmpty(html.replace(/<img[^>]*>/gi, "")) : false
    if (files.length && !htmlHasText) {
      e.preventDefault()
      handleFiles(files, range)
      return
    }
    e.preventDefault()
    setSelected(null)
    if (html) {
      const cleaned = cleanPastedHtml(html)
      if (cleaned) insertHtmlAt(el, range, cleaned)
    } else if (text) {
      if (!/[\r\n]/.test(text)) {
        if (range) selectRange(range)
        if (!exec("insertText", text)) insertHtmlAt(el, range, escapeHtml(text))
      } else {
        insertHtmlAt(el, range, plainTextToHtml(text))
      }
    }
    decorateEditable(el)
    emitChange()
  }

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (Array.from(e.dataTransfer.types).includes("Files")) {
      e.preventDefault()
      e.dataTransfer.dropEffect = "copy"
    }
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    const el = editorRef.current
    const files = imageFilesFrom(e.dataTransfer)
    if (!el || !files.length) {
      // 파일이 아니면(글자 끌어 옮기기 등) 브라우저 기본 동작 — 직렬화가 style 등을 지운다.
      if (e.dataTransfer.types.includes("Files")) e.preventDefault()
      return
    }
    e.preventDefault()
    const point = rangeFromPoint(e.clientX, e.clientY)
    handleFiles(files, point && el.contains(point.startContainer) ? point : selectionRangeIn(el))
  }

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const el = editorRef.current
    const target = e.target as Element
    if (!el) return
    const img = target.closest("img")
    if (img && el.contains(img) && !img.hasAttribute("data-uploading")) {
      selectMedia(img)
      return
    }
    const video = target.closest<HTMLElement>("[data-youtube-video]")
    if (video && el.contains(video)) {
      selectMedia(video)
      return
    }
    if (selected) setSelected(null)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!selected) return
    const node = selected.el
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault()
      deleteSelected()
      return
    }
    if (e.key === "Escape") {
      e.preventDefault()
      caretAfter(node)
      setSelected(null)
      return
    }
    if (e.key === "Enter") {
      e.preventDefault()
      const el = editorRef.current!
      if (selected.kind === "video") {
        const next = node.nextElementSibling
        if (!(next && next.matches("p") && isRichTextEmpty(next.innerHTML))) {
          caretAfter(node)
          insertHtmlAt(el, selectionRangeIn(el), "<p><br></p>")
        }
        const p = node.nextElementSibling
        if (p) {
          const r = document.createRange()
          r.setStart(p, 0)
          r.collapse(true)
          selectRange(r)
        }
      } else {
        caretAfter(node)
        if (!exec("insertParagraph")) insertHtmlAt(el, selectionRangeIn(el), "<p><br></p>")
      }
      setSelected(null)
      emitChange()
      return
    }
    // 그 밖의 키: 선택을 풀고 캐럿을 미디어 뒤로 — 글자 입력이 미디어를 덮어쓰지 않게 한다.
    if (e.key.length === 1 || e.key.startsWith("Arrow")) {
      if (!e.key.startsWith("Arrow")) caretAfter(node)
      setSelected(null)
    }
  }

  // ---------- 다이얼로그 결과 ----------

  const closeDialog = () => setDialog(null)

  const submitLink = (value: string, range: Range | null) => {
    const el = editorRef.current
    const url = normalizeLinkUrl(value)
    if (!el || !url) return
    setDialog(null)
    focusEditor(range)
    applyLink(el, range, url)
    emitChange()
  }

  const submitYoutube = (value: string, range: Range | null, target: HTMLElement | null) => {
    const el = editorRef.current
    const id = extractYoutubeId(value)
    if (!el || !id) return
    setDialog(null)
    if (target && target.isConnected) {
      const width = Number.parseInt(target.querySelector("iframe")?.getAttribute("width") ?? "", 10)
      focusEditor(null)
      replaceNode(target, withSelectedMarker(youtubeEmbedHtml(id, Number.isFinite(width) ? width : undefined, true)))
      decorateEditable(el)
      reselectMarked()
      emitChange()
      return
    }
    const at = range && el.contains(range.commonAncestorContainer) ? range : rangeAtEnd(el)
    const atEnd = isAtDocumentEnd(el, at)
    focusEditor(at)
    insertHtmlAt(el, at, youtubeEmbedHtml(id, undefined, true) + (atEnd ? "<p><br></p>" : ""))
    decorateEditable(el)
    emitChange()
  }

  const submitAlt = (value: string, target: HTMLImageElement) => {
    setDialog(null)
    if (!target.isConnected) return
    const width = Number.parseInt(target.getAttribute("width") ?? "", 10)
    const height = Number.parseInt(target.getAttribute("height") ?? "", 10)
    focusEditor(null)
    replaceNode(
      target,
      withSelectedMarker(imageHtml({ src: target.getAttribute("src") ?? "", alt: value.trim(), width, height })),
    )
    decorateEditable(editorRef.current!)
    reselectMarked()
    emitChange()
  }

  const selectedNatural = selected?.kind === "image" ? imageNatural(selected.el as HTMLImageElement) : { width: 1280, height: 720 }
  const selectedSrc = selected?.kind === "image" ? (selected.el.getAttribute("src") ?? "") : ""
  const canRecrop = selected?.kind === "image" && !/\.gif(?:$|\?)/i.test(selectedSrc)

  return (
    <div
      className={`rounded-xl border border-outline-variant bg-surface-container-lowest focus-within:border-primary ${className}`}
    >
      <EditorToolbar active={active} controlsId={editorId} onCommand={runCommand} />
      <div ref={setWrapperEl} className="relative">
        <div
          ref={editorRef}
          id={editorId}
          className="editor rich-text min-h-60 px-4 py-3 text-on-surface outline-none"
          contentEditable
          role="textbox"
          aria-multiline="true"
          aria-labelledby={labelId}
          aria-label={labelId ? undefined : "본문"}
          aria-describedby={error ? errorId : undefined}
          data-placeholder={placeholder}
          data-empty={empty ? "true" : undefined}
          spellCheck
          onInput={onInput}
          onPaste={onPaste}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onClick={onClick}
          onKeyDown={onKeyDown}
          onFocus={() => {
            exec("defaultParagraphSeparator", "p")
            exec("styleWithCSS", "false")
          }}
        />
        {selected && wrapperEl && (
          <MediaOverlay
            key={`${revision}`}
            kind={selected.kind}
            target={selected.el}
            container={wrapperEl}
            natural={selectedNatural}
            currentWidth={currentWidthOf(selected)}
            canRecrop={canRecrop}
            onResize={resizeSelected}
            onDelete={deleteSelected}
            onAltText={() => setDialog({ type: "alt", target: selected.el as HTMLImageElement })}
            onRecrop={() => void startRecrop(selected.el as HTMLImageElement)}
            onReplace={() => {
              replaceTargetRef.current = selected.el as HTMLImageElement
              replaceInputRef.current?.click()
            }}
            onChangeLink={() => {
              const id = youtubeIdFromEmbedSrc(selected.el.querySelector("iframe")?.getAttribute("src"))
              setDialog({
                type: "youtube",
                range: null,
                target: selected.el,
                initial: id ? `https://www.youtube.com/watch?v=${id}` : "",
              })
            }}
          />
        )}
      </div>

      {(uploading > 0 || error) && (
        <div className="space-y-1 border-t border-outline-variant px-3 py-2">
          {uploading > 0 && (
            <p role="status" className="text-sm text-on-surface-variant">
              이미지 올리는 중… ({uploading})
            </p>
          )}
          {error && (
            <div
              id={errorId}
              role="alert"
              className="flex items-center justify-between gap-2 rounded-lg bg-error-container px-3 py-2 text-sm text-on-error-container"
            >
              <span>{error}</span>
              <button
                type="button"
                onClick={() => setError(null)}
                className="min-h-11 min-w-11 rounded-lg font-medium hover:underline"
                aria-label="오류 닫기"
              >
                닫기
              </button>
            </div>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        aria-label="이미지 파일 선택"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = ""
          handleFiles(files, pendingRangeRef.current)
        }}
      />
      <input
        ref={replaceInputRef}
        type="file"
        accept={ACCEPT}
        hidden
        aria-label="교체할 이미지 파일 선택"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ""
          const target = replaceTargetRef.current
          replaceTargetRef.current = null
          if (file && target) void finishReplace(target, file)
        }}
      />

      {dialog?.type === "link" && (
        <TextPromptDialog
          title="링크 걸기"
          label="링크 주소"
          inputType="url"
          initialValue={dialog.initial}
          placeholder="https://example.com"
          hint="http·https·mailto·tel 링크를 넣을 수 있습니다."
          validate={(v) => (normalizeLinkUrl(v) ? null : "http·https·mailto·tel 링크만 넣을 수 있습니다.")}
          onSubmit={(v) => submitLink(v, dialog.range)}
          onClose={closeDialog}
        />
      )}
      {dialog?.type === "youtube" && (
        <TextPromptDialog
          title={dialog.target ? "영상 링크 바꾸기" : "유튜브 영상 넣기"}
          label="유튜브 링크"
          inputType="url"
          initialValue={dialog.initial}
          placeholder="https://www.youtube.com/watch?v=…"
          hint="watch·youtu.be·shorts·embed 링크를 넣을 수 있습니다."
          submitLabel={dialog.target ? "바꾸기" : "넣기"}
          validate={(v) => (extractYoutubeId(v) ? null : "유튜브 링크만 넣을 수 있습니다.")}
          onSubmit={(v) => submitYoutube(v, dialog.range, dialog.target)}
          onClose={closeDialog}
        />
      )}
      {dialog?.type === "alt" && (
        <TextPromptDialog
          title="대체 텍스트"
          label="이미지 설명"
          initialValue={dialog.target.getAttribute("alt") ?? ""}
          hint="화면 낭독기 사용자에게 읽어 줄 설명입니다. 장식용 이미지면 비워 두세요."
          onSubmit={(v) => submitAlt(v, dialog.target)}
          onClose={closeDialog}
        />
      )}
      {dialog?.type === "crop-insert" && (
        <ImageCropDialog
          file={dialog.file}
          mode="insert"
          onApply={(edit) => {
            setDialog(null)
            insertUploads([{ file: dialog.file, edit }], dialog.range)
          }}
          onSkip={() => {
            setDialog(null)
            insertUploads([{ file: dialog.file, edit: null }], dialog.range)
          }}
          onCancel={closeDialog}
        />
      )}
      {dialog?.type === "crop-again" && (
        <ImageCropDialog
          file={dialog.file}
          mode="recrop"
          onApply={(edit) => {
            setDialog(null)
            void finishRecrop(dialog.target, dialog.file, edit)
          }}
          onCancel={closeDialog}
        />
      )}
    </div>
  )
}
