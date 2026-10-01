// 리치 텍스트 순수 유틸 (editor-spec §3). DOM 파서(DOMParser·template)만 쓰고 부수효과가 없다.
//
// ⚠️ 이 파일의 허용 목록은 "붙여넣기 정리"용 1차 필터일 뿐이다. 최종 방어선은 백엔드
//    `app/core/sanitize.py`(nh3)이며, 서식·미디어를 추가하면 정화 허용 목록과 테스트를 같은 변경에서 고친다.

/** 에디터 이미지 업로드 허용 MIME (백엔드 시그니처 검사와 같은 집합). */
export const EDITOR_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const
/** 업로드 전 사전 검사 한도 — 5MB. 서버도 같은 한도로 413 을 준다. */
export const EDITOR_IMAGE_MAX_BYTES = 5 * 1024 * 1024

/** 링크로 허용하는 스킴 (서버 정화기와 같은 목록 — 상대 경로는 서버가 허용하지만 에디터 입력은 절대 URL 만 받는다). */
const LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"])
const ALIGN_CLASSES = new Set(["align-left", "align-center", "align-right"])
const DIMENSION_RE = /^\d{1,4}$/
const ZERO_WIDTH = new Set([0x200b, 0x200c, 0x200d, 0xfeff])

// 붙여넣기에서 그대로 남기는 태그. 정화기 허용 목록의 부분집합이다(iframe·div·span 제외).
const KEEP_TAGS = new Set([
  "p", "br", "hr", "h2", "h3", "strong", "em", "u", "s", "mark", "sub", "sup",
  "ul", "ol", "li", "blockquote", "pre", "code", "a", "img",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption",
])
// 의미가 같은 태그는 저장 표준 태그로 바꾼다.
const RENAME_TAGS: Record<string, string> = {
  b: "strong", i: "em", strike: "s", del: "s", h1: "h2", h4: "h3", h5: "h3", h6: "h3",
}
// 내용째 버리는 태그. iframe 은 붙여넣기로 받지 않는다(영상은 "영상" 버튼으로만).
const DROP_TAGS = new Set([
  "script", "style", "iframe", "object", "embed", "noscript", "template", "head", "meta", "link",
  "title", "svg", "math", "canvas", "video", "audio", "form", "input", "button", "select", "textarea",
])
// 붙여넣은 div 를 p 로 바꿀지 판정할 때 쓰는 블록 태그.
const BLOCK_TAGS = new Set([
  "p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote", "pre", "hr",
  "table", "section", "article", "header", "footer", "aside", "nav", "main", "figure",
])
// 태그별 허용 속성 (class 는 정렬 값만 따로 검사한다).
const KEEP_ATTRS: Record<string, string[]> = {
  a: ["href", "title"],
  img: ["src", "alt", "width", "height", "title"],
  td: ["colspan", "rowspan"],
  th: ["colspan", "rowspan", "scope"],
  ol: ["start"],
}

/** HTML 텍스트 이스케이프 (`& < >`). */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/** HTML 속성값 이스케이프 (큰따옴표로 감싸는 속성용). */
export function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}

/**
 * 링크 입력값을 저장 가능한 URL 로 정규화한다. 허용하지 않는 스킴이면 null.
 * 스킴이 없고 도메인처럼 보이면 https:// 를 붙인다(`example.com/a` → `https://example.com/a`).
 */
export function normalizeLinkUrl(input: string): string | null {
  const value = input.trim()
  if (!value || /\s/.test(value)) return null
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(value)
  const candidate = hasScheme ? value : `https://${value.replace(/^\/\//, "")}`
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return null
  }
  if (!LINK_PROTOCOLS.has(url.protocol)) return null
  if ((url.protocol === "http:" || url.protocol === "https:") && !url.hostname.includes(".") && url.hostname !== "localhost") {
    return null
  }
  // 입력 원문을 최대한 보존한다(URL.href 는 끝에 / 를 붙이는 등 모양을 바꾼다).
  return hasScheme ? value : candidate
}

/** 서버 정화기와 같은 기준의 URL 스킴 검사 — http·https·mailto·tel 과 상대 경로만 허용. */
function isSafeUrl(value: string, allowMailTel: boolean): boolean {
  // 브라우저는 URL 의 탭·개행·제어문자를 무시한다("java\tscript:") — 같은 기준으로 지운 뒤 검사한다.
  // eslint-disable-next-line no-control-regex
  const v = value.replace(/[\x00-\x20\x7f]/g, "")
  if (!v) return false
  // 스킴이 없으면 상대 경로 — 서버가 허용한다.
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(v)
  if (!scheme) return true
  const protocol = `${scheme[1].toLowerCase()}:`
  if (protocol === "http:" || protocol === "https:") return true
  return allowMailTel && (protocol === "mailto:" || protocol === "tel:")
}

function parseFragment(html: string): HTMLTemplateElement {
  const template = document.createElement("template")
  template.innerHTML = html
  return template
}

function unwrap(el: Element): void {
  const parent = el.parentNode
  if (!parent) return
  while (el.firstChild) parent.insertBefore(el.firstChild, el)
  parent.removeChild(el)
}

function renameElement(el: Element, tag: string): Element {
  const next = el.ownerDocument.createElement(tag)
  for (const attr of Array.from(el.attributes)) next.setAttribute(attr.name, attr.value)
  while (el.firstChild) next.appendChild(el.firstChild)
  el.replaceWith(next)
  return next
}

function hasBlockChild(el: Element): boolean {
  return Array.from(el.children).some((c) => BLOCK_TAGS.has(c.tagName.toLowerCase()))
}

function cleanAttributes(el: Element, tag: string): void {
  const allowed = KEEP_ATTRS[tag] ?? []
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase()
    if (name === "class") {
      const kept = attr.value.split(/\s+/).filter((c) => ALIGN_CLASSES.has(c))
      if (kept.length) el.setAttribute("class", kept.join(" "))
      else el.removeAttribute("class")
      continue
    }
    if (!allowed.includes(name)) {
      el.removeAttribute(attr.name)
      continue
    }
    if ((name === "width" || name === "height") && !DIMENSION_RE.test(attr.value.trim())) {
      el.removeAttribute(attr.name)
    } else if ((name === "colspan" || name === "rowspan" || name === "start") && !/^\d{1,3}$/.test(attr.value.trim())) {
      el.removeAttribute(attr.name)
    } else if (name === "href" && !isSafeUrl(attr.value, true)) {
      el.removeAttribute(attr.name)
    }
  }
}

function cleanNode(node: Node): void {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.COMMENT_NODE || child.nodeType === Node.PROCESSING_INSTRUCTION_NODE) {
      child.parentNode?.removeChild(child)
      continue
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue
    let el = child as Element
    let tag = el.tagName.toLowerCase()

    if (DROP_TAGS.has(tag)) {
      el.remove()
      continue
    }
    // 이미지는 http(s)·상대 경로만. data:·blob: 은 본문에 넣지 않는다(서버도 data: 를 지운다).
    if (tag === "img") {
      const src = el.getAttribute("src") ?? ""
      if (!src || !isSafeUrl(src, false)) {
        el.remove()
        continue
      }
    }
    // 구글 문서 붙여넣기는 전체를 <b style="font-weight:normal" id="docs-internal-guid-…"> 로 감싼다.
    if (tag === "b" && (el.getAttribute("id") ?? "").startsWith("docs-internal-guid")) {
      cleanNode(el)
      unwrap(el)
      continue
    }
    if (tag === "div") {
      // 블록 자식이 없는 div 는 한 문단으로, 블록을 감싼 div 는 껍데기만 벗긴다.
      if (hasBlockChild(el)) {
        cleanNode(el)
        unwrap(el)
        continue
      }
      el = renameElement(el, "p")
      tag = "p"
    } else if (RENAME_TAGS[tag]) {
      tag = RENAME_TAGS[tag]
      el = renameElement(el, tag)
    }

    if (!KEEP_TAGS.has(tag)) {
      // span·font·section 등 — 내용만 남긴다.
      cleanNode(el)
      unwrap(el)
      continue
    }
    cleanAttributes(el, tag)
    cleanNode(el)
    // 링크는 서버가 rel 을 강제한다. 여기서는 target 을 받지 않는다.
  }
}

/**
 * 붙여넣은 HTML 을 에디터 허용 태그·속성으로 정리한다(editor-spec §1·§3).
 * - img 는 width/height(px 정수)를 유지하고 src 가 http(s)·상대 경로가 아니면 통째로 버린다.
 * - iframe·script·style 은 내용째 제거한다.
 * - style·id·on* 등 허용 목록 밖 속성은 모두 제거, class 는 정렬 값만 남긴다.
 * - 표는 붙여넣기로만 들어온다(편집 UI 는 없다).
 */
export function cleanPastedHtml(html: string): string {
  // 워드·브라우저 클립보드는 <html><body><!--StartFragment--> 형태로 온다 — body 만 쓴다.
  const bodyMatch = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)
  const template = parseFragment(bodyMatch ? bodyMatch[1] : html)
  cleanNode(template.content)
  return template.innerHTML.trim()
}

/** 글자·이미지·영상이 하나도 없으면 true (필수 입력 검사용). */
export function isRichTextEmpty(html: string | null | undefined): boolean {
  if (!html) return true
  const template = parseFragment(html)
  if (template.content.querySelector("img, iframe")) return false
  const text = template.content.textContent ?? ""
  // 공백(nbsp·BOM 포함 — JS 정규식 \s)과 폭 없는 문자(ZWSP·ZWNJ·ZWJ)는 글자로 치지 않는다.
  return Array.from(text).every((ch) => /\s/.test(ch) || ZERO_WIDTH.has(ch.codePointAt(0) ?? 0))
}

/** 일반 텍스트를 문단 HTML 로 바꾼다. 줄마다 <p>, 빈 줄은 <p><br></p>. */
export function plainTextToHtml(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n")
  // 끝의 줄바꿈 하나는 빈 문단으로 만들지 않는다(복사한 텍스트 끝의 개행).
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop()
  return lines.map((line) => (line === "" ? "<p><br></p>" : `<p>${escapeHtml(line)}</p>`)).join("")
}

/**
 * 업로드 전 사전 검사 — 문제가 있으면 사용자에게 보여 줄 문구, 없으면 null.
 * 서버도 시그니처·크기를 다시 검사하므로 이 검사는 빠른 피드백용이다.
 */
export function editorImageProblem(file: { type: string; size: number }): string | null {
  if (!(EDITOR_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return "PNG·JPEG·WebP·GIF 이미지만 올릴 수 있습니다."
  }
  if (file.size > EDITOR_IMAGE_MAX_BYTES) return "이미지는 5MB 이하만 올릴 수 있습니다."
  if (file.size === 0) return "빈 파일은 올릴 수 없습니다."
  return null
}
