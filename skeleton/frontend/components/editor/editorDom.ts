// 편집 영역 DOM 조작 도우미 (editor-spec §0-1·§0-6·§6).
//
// - `document.execCommand` 호출은 `exec()` 한 곳에 모은다(deprecated API — 대체할 때 여기만 바꾼다).
// - 프로그램적 변경(크기·alt·교체·삽입·삭제)은 대상 노드를 `Range.selectNode` 로 선택한 뒤
//   `exec("insertHTML")`/`exec("delete")` 로 치환한다 — setAttribute 는 브라우저 undo 스택에 남지 않는다.
// - exec 가 실패하면(execCommand 미지원·선택이 편집 영역 밖 등) DOM 을 직접 고치는 폴백을 탄다(undo 에는 안 남음).
import { escapeHtml } from "@/lib/editor/richText"

export type BlockFormat = "p" | "h2" | "h3" | "blockquote"
export type Align = "left" | "center" | "right"

export interface ActiveState {
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  mark: boolean
  link: boolean
  ul: boolean
  ol: boolean
  block: BlockFormat | null
  align: Align | null
}

export const EMPTY_ACTIVE: ActiveState = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  mark: false,
  link: false,
  ul: false,
  ol: false,
  block: null,
  align: null,
}

const BLOCK_SELECTOR = "p, h1, h2, h3, h4, h5, h6, blockquote, li, pre, div"
const ALIGN_CLASSES = ["align-left", "align-center", "align-right"]

/** execCommand 단일 진입점. 미지원 환경(jsdom 등)이나 예외는 false. */
export function exec(command: string, value?: string): boolean {
  if (typeof document.execCommand !== "function") return false
  try {
    return document.execCommand(command, false, value)
  } catch {
    return false
  }
}

/** 브라우저 명령 상태(굵게 등) — 미지원이면 null 을 돌려 DOM 판정으로 넘긴다. */
function queryState(command: string): boolean | null {
  if (typeof document.queryCommandState !== "function") return null
  try {
    return document.queryCommandState(command)
  } catch {
    return null
  }
}

/** 현재 선택이 root 안에 있으면 그 Range (복사본), 아니면 null. */
export function selectionRangeIn(root: HTMLElement): Range | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  return root.contains(range.commonAncestorContainer) ? range.cloneRange() : null
}

/** Range 를 문서 선택으로 되돌린다. */
export function selectRange(range: Range): void {
  const sel = window.getSelection()
  if (!sel) return
  sel.removeAllRanges()
  sel.addRange(range)
}

/** 편집 영역 끝(마지막 블록 안쪽 끝) Range. */
export function rangeAtEnd(root: HTMLElement): Range {
  const range = document.createRange()
  const last = root.lastElementChild
  if (last && last.matches("p, h2, h3") && !last.querySelector("img")) {
    range.selectNodeContents(last)
  } else {
    range.selectNodeContents(root)
  }
  range.collapse(false)
  return range
}

/** range 뒤로 글자·미디어가 없는지 — 문서 끝 삽입이면 뒤에 빈 문단을 붙인다(§5). */
export function isAtDocumentEnd(root: HTMLElement, range: Range): boolean {
  const after = document.createRange()
  after.setStart(range.endContainer, range.endOffset)
  after.setEnd(root, root.childNodes.length)
  const frag = after.cloneContents()
  return (frag.textContent ?? "").trim() === "" && !frag.querySelector("img, iframe, hr, table")
}

function parseHtml(html: string): DocumentFragment {
  const t = document.createElement("template")
  t.innerHTML = html
  return t.content
}

/** range 위치에 HTML 삽입 (§6 커밋 규칙). */
export function insertHtmlAt(root: HTMLElement, range: Range | null, html: string): void {
  const target = range && root.contains(range.commonAncestorContainer) ? range : rangeAtEnd(root)
  selectRange(target)
  if (exec("insertHTML", html)) return
  // 폴백 — undo 스택에는 남지 않는다.
  target.deleteContents()
  const frag = parseHtml(html)
  const lastNode = frag.lastChild
  target.insertNode(frag)
  if (lastNode) {
    const caret = document.createRange()
    caret.setStartAfter(lastNode)
    caret.collapse(true)
    selectRange(caret)
  }
}

/**
 * 노드를 새 HTML 로 치환 — selectNode 후 insertHTML (§6).
 * direct=true 면 execCommand 없이 바로 치환한다(편집 영역에 포커스가 없을 때 포커스를 빼앗지 않도록).
 */
export function replaceNode(node: Element, html: string, direct = false): void {
  if (direct) {
    node.replaceWith(parseHtml(html))
    return
  }
  const range = document.createRange()
  range.selectNode(node)
  selectRange(range)
  if (exec("insertHTML", html)) return
  node.replaceWith(parseHtml(html))
}

/** 노드 삭제 — selectNode 후 delete (§6). direct 는 replaceNode 와 같다. */
export function deleteNode(node: Element, direct = false): void {
  if (direct) {
    node.remove()
    return
  }
  const range = document.createRange()
  range.selectNode(node)
  selectRange(range)
  if (exec("delete")) return
  node.remove()
}

/** 노드 바로 뒤에 캐럿을 둔다. */
export function caretAfter(node: Node): void {
  const range = document.createRange()
  range.setStartAfter(node)
  range.collapse(true)
  selectRange(range)
}

function closestIn(node: Node | null, root: HTMLElement, selector: string): Element | null {
  let el: Element | null = node ? (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement) : null
  while (el && el !== root) {
    if (el.matches(selector)) return el
    el = el.parentElement
  }
  return null
}

/** 캐럿이 속한 가장 가까운 블록(문단·제목·인용·목록 항목). */
export function closestBlock(node: Node | null, root: HTMLElement): HTMLElement | null {
  return closestIn(node, root, BLOCK_SELECTOR) as HTMLElement | null
}

/** 가장 가까운 a 요소. */
export function closestLink(node: Node | null, root: HTMLElement): HTMLAnchorElement | null {
  return closestIn(node, root, "a") as HTMLAnchorElement | null
}

/** 툴바 활성 상태 — 가능하면 브라우저 명령 상태를, 아니면 DOM 조상을 본다. */
export function readActiveState(root: HTMLElement): ActiveState {
  const range = selectionRangeIn(root)
  if (!range) return EMPTY_ACTIVE
  const node = range.startContainer
  const has = (sel: string) => closestIn(node, root, sel) !== null
  const state = (cmd: string, sel: string) => queryState(cmd) ?? has(sel)
  const blockEl = closestIn(node, root, "h2, h3, blockquote, p")
  const tag = blockEl?.tagName.toLowerCase()
  const alignEl = closestBlock(node, root)
  const alignClass = ALIGN_CLASSES.find((c) => alignEl?.classList.contains(c))
  return {
    bold: state("bold", "strong, b"),
    italic: state("italic", "em, i"),
    underline: state("underline", "u"),
    strike: state("strikeThrough", "s, strike, del"),
    mark: has("mark"),
    link: has("a"),
    ul: has("ul"),
    ol: has("ol"),
    block: has("blockquote") ? "blockquote" : tag === "h2" || tag === "h3" || tag === "p" ? tag : null,
    align: alignClass ? (alignClass.replace("align-", "") as Align) : null,
  }
}

/** 선택 범위에 걸친 블록들(정렬 대상). */
export function blocksInRange(root: HTMLElement, range: Range): HTMLElement[] {
  const start = closestBlock(range.startContainer, root)
  const end = closestBlock(range.endContainer, root)
  if (!start) return end ? [end] : []
  if (!end || start === end) return [start]
  const blocks: HTMLElement[] = []
  const all = Array.from(root.querySelectorAll<HTMLElement>(BLOCK_SELECTOR)).filter(
    // 바깥 블록(li 를 감싼 등)은 빼고 가장 안쪽 블록만.
    (el) => !el.querySelector(BLOCK_SELECTOR),
  )
  let inside = false
  for (const el of all) {
    if (el === start || el.contains(start)) inside = true
    if (inside) blocks.push(el)
    if (el === end || el.contains(end)) break
  }
  return blocks.length ? blocks : [start]
}

/**
 * 정렬 — `class="align-*"` 로만 저장한다(style 금지, §0-2). 이미 같은 정렬이면 해제한다.
 * 블록 class 변경은 execCommand 로 표현할 수 없어 직접 바꾼다(undo 스택에 남지 않음 — 알려진 한계).
 */
export function toggleAlign(root: HTMLElement, align: Align): boolean {
  const range = selectionRangeIn(root)
  if (!range) return false
  const blocks = blocksInRange(root, range)
  if (!blocks.length) return false
  const cls = `align-${align}`
  const allSame = blocks.every((b) => b.classList.contains(cls))
  for (const b of blocks) {
    b.classList.remove(...ALIGN_CLASSES)
    if (!allSame) b.classList.add(cls)
    if (!b.classList.length) b.removeAttribute("class")
  }
  return true
}

/**
 * 형광펜(mark) 토글. 캐럿·선택이 mark 안이면 벗기고, 아니면 선택을 감싼다.
 * 반환: 오류 문구 또는 null.
 */
export function toggleMark(root: HTMLElement): string | null {
  const range = selectionRangeIn(root)
  if (!range) return null
  const existing = closestIn(range.commonAncestorContainer, root, "mark")
  if (existing) {
    replaceNode(existing, existing.innerHTML)
    return null
  }
  if (range.collapsed) return "형광펜을 칠할 글자를 먼저 선택하세요."
  const frag = range.cloneContents()
  if (frag.querySelector(BLOCK_SELECTOR + ", ul, ol, hr, img, iframe, table")) {
    return "형광펜은 한 문단 안의 글자에만 칠할 수 있습니다."
  }
  // 안쪽의 기존 mark 는 벗겨 중첩을 막는다.
  frag.querySelectorAll("mark").forEach((m) => m.replaceWith(...Array.from(m.childNodes)))
  const holder = document.createElement("div")
  holder.appendChild(frag)
  selectRange(range)
  if (!exec("insertHTML", `<mark>${holder.innerHTML}</mark>`)) {
    const mark = document.createElement("mark")
    range.deleteContents()
    mark.innerHTML = holder.innerHTML
    range.insertNode(mark)
  }
  return null
}

/** 서식 지우기 — 브라우저 removeFormat 이 건드리지 않는 mark 도 벗긴다. */
export function clearFormatting(root: HTMLElement): void {
  exec("removeFormat")
  const range = selectionRangeIn(root)
  if (!range) return
  const mark = closestIn(range.commonAncestorContainer, root, "mark")
  if (mark) replaceNode(mark, mark.innerHTML)
}

/** 링크 걸기. 선택이 비어 있으면 URL 자체를 글자로 넣는다. */
export function applyLink(root: HTMLElement, range: Range | null, url: string): void {
  const target = range && root.contains(range.commonAncestorContainer) ? range : rangeAtEnd(root)
  const existing = closestLink(target.commonAncestorContainer, root)
  if (existing && target.collapsed) {
    const whole = document.createRange()
    whole.selectNodeContents(existing)
    selectRange(whole)
    if (!exec("createLink", url)) existing.setAttribute("href", url)
    return
  }
  if (target.collapsed) {
    insertHtmlAt(root, target, `<a href="${escapeHtml(url).replace(/"/g, "&quot;")}">${escapeHtml(url)}</a>`)
    return
  }
  selectRange(target)
  if (!exec("createLink", url)) {
    const a = document.createElement("a")
    a.href = url
    a.appendChild(target.extractContents())
    target.insertNode(a)
  }
}

/** 링크 풀기 — 캐럿이 링크 안이면 링크 전체를 푼다. */
export function removeLink(root: HTMLElement): void {
  const range = selectionRangeIn(root)
  if (!range) return
  const link = closestLink(range.commonAncestorContainer, root)
  if (link && range.collapsed) {
    const whole = document.createRange()
    whole.selectNodeContents(link)
    selectRange(whole)
  }
  if (!exec("unlink") && link) link.replaceWith(...Array.from(link.childNodes))
}

/** 블록 형식(문단·제목·인용). 인용이 이미 적용돼 있으면 문단으로 되돌린다. */
export function setBlock(root: HTMLElement, format: BlockFormat): void {
  const current = readActiveState(root).block
  const next = format === "blockquote" && current === "blockquote" ? "p" : format
  exec("formatBlock", `<${next}>`)
}

/**
 * 좌표의 캐럿 Range (드롭 위치). 표준 caretPositionFromPoint → WebKit caretRangeFromPoint 순.
 */
export function rangeFromPoint(x: number, y: number): Range | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
    caretRangeFromPoint?: (x: number, y: number) => Range | null
  }
  if (typeof doc.caretPositionFromPoint === "function") {
    const pos = doc.caretPositionFromPoint(x, y)
    if (!pos) return null
    const range = document.createRange()
    range.setStart(pos.offsetNode, pos.offset)
    range.collapse(true)
    return range
  }
  if (typeof doc.caretRangeFromPoint === "function") return doc.caretRangeFromPoint(x, y)
  return null
}

/**
 * 편집 전용 표식을 붙인다(직렬화 때 제거): 영상 래퍼 contenteditable="false", 이미지 draggable="false".
 * 속성 표식이라 undo 스택과 무관하다.
 */
export function decorateEditable(root: HTMLElement): void {
  root.querySelectorAll("[data-youtube-video]").forEach((el) => {
    if (el.getAttribute("contenteditable") !== "false") el.setAttribute("contenteditable", "false")
  })
  root.querySelectorAll("img").forEach((el) => {
    if (el.getAttribute("draggable") !== "false") el.setAttribute("draggable", "false")
  })
}
