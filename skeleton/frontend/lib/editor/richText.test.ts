import { describe, expect, it } from "vitest"
import {
  cleanPastedHtml,
  EDITOR_IMAGE_MAX_BYTES,
  editorImageProblem,
  escapeAttr,
  escapeHtml,
  isRichTextEmpty,
  normalizeLinkUrl,
  plainTextToHtml,
} from "./richText"

const ch = (code: number) => String.fromCharCode(code)

describe("escapeHtml / escapeAttr", () => {
  it("텍스트의 & < > 를 이스케이프한다", () => {
    expect(escapeHtml(`<a href="x">&</a>`)).toBe(`&lt;a href="x"&gt;&amp;&lt;/a&gt;`)
  })
  it("속성값은 따옴표까지 이스케이프한다", () => {
    expect(escapeAttr(`"><script>'`)).toBe("&quot;&gt;&lt;script&gt;&#39;")
  })
})

describe("cleanPastedHtml", () => {
  it("허용 태그만 남기고 style·class·id·on* 속성을 지운다", () => {
    const out = cleanPastedHtml(
      `<p style="color:red" class="MsoNormal" id="x" onclick="alert(1)">안녕 <strong style="font-size:30px">굵게</strong></p>`,
    )
    expect(out).toBe("<p>안녕 <strong>굵게</strong></p>")
  })

  it("script·style·iframe 은 내용째 제거한다", () => {
    const out = cleanPastedHtml(
      `<p>a</p><script>alert(1)</script><style>p{}</style><iframe src="https://www.youtube.com/embed/abcdefghijk">x</iframe><p>b</p>`,
    )
    expect(out).toBe("<p>a</p><p>b</p>")
  })

  it("b·i·strike·del·h1·h4 를 저장 표준 태그로 바꾼다", () => {
    expect(cleanPastedHtml("<b>b</b><i>i</i><strike>s</strike><del>d</del>")).toBe(
      "<strong>b</strong><em>i</em><s>s</s><s>d</s>",
    )
    expect(cleanPastedHtml("<h1>t</h1><h4>u</h4>")).toBe("<h2>t</h2><h3>u</h3>")
  })

  it("span·font 등 허용 밖 인라인 태그는 껍데기만 벗긴다", () => {
    expect(cleanPastedHtml(`<p><span style="x"><font color="red">글</font>자</span></p>`)).toBe("<p>글자</p>")
  })

  it("블록 자식이 없는 div 는 문단으로, 블록을 감싼 div 는 벗긴다", () => {
    expect(cleanPastedHtml("<div>한 줄</div>")).toBe("<p>한 줄</p>")
    expect(cleanPastedHtml("<div><p>a</p><p>b</p></div>")).toBe("<p>a</p><p>b</p>")
  })

  it("img 의 정수 width/height 는 유지하고 % 값은 지운다", () => {
    expect(cleanPastedHtml(`<img src="https://a.com/x.png" alt="x" width="640" height="360" style="x">`)).toBe(
      `<img src="https://a.com/x.png" alt="x" width="640" height="360">`,
    )
    expect(cleanPastedHtml(`<img src="/u/x.png" width="100%" height="calc(1px)">`)).toBe(`<img src="/u/x.png">`)
  })

  it("data:·javascript: 이미지는 통째로 버린다", () => {
    expect(cleanPastedHtml(`<p>a<img src="data:image/png;base64,AAAA">b</p>`)).toBe("<p>ab</p>")
    expect(cleanPastedHtml(`<img src="javascript:alert(1)">`)).toBe("")
  })

  it("javascript: href 는 지우고(제어문자 우회 포함) 허용 스킴은 남긴다", () => {
    expect(cleanPastedHtml(`<a href="javascript:alert(1)">x</a>`)).toBe("<a>x</a>")
    expect(cleanPastedHtml(`<a href="java${ch(9)}script:alert(1)">x</a>`)).toBe("<a>x</a>")
    expect(cleanPastedHtml(`<a href="https://a.com" target="_blank" rel="x">x</a>`)).toBe(`<a href="https://a.com">x</a>`)
    expect(cleanPastedHtml(`<a href="mailto:a@b.com">m</a>`)).toBe(`<a href="mailto:a@b.com">m</a>`)
    expect(cleanPastedHtml(`<a href="/notice/1">r</a>`)).toBe(`<a href="/notice/1">r</a>`)
  })

  it("class 는 정렬 값만 남긴다", () => {
    expect(cleanPastedHtml(`<p class="align-center ql-align-center">x</p>`)).toBe(`<p class="align-center">x</p>`)
    expect(cleanPastedHtml(`<p class="ql-align-center">x</p>`)).toBe("<p>x</p>")
  })

  it("표는 붙여넣기로 받는다(colspan 유지)", () => {
    const out = cleanPastedHtml(`<table border="1"><tbody><tr><td colspan="2" style="x">a</td></tr></tbody></table>`)
    expect(out).toBe(`<table><tbody><tr><td colspan="2">a</td></tr></tbody></table>`)
  })

  it("클립보드 문서 형태(<html><body>)와 주석, 구글 문서 래퍼를 처리한다", () => {
    const html = `<html><head><style>x</style></head><body><!--StartFragment--><b style="font-weight:normal;" id="docs-internal-guid-123"><p>문서</p></b><!--EndFragment--></body></html>`
    expect(cleanPastedHtml(html)).toBe("<p>문서</p>")
  })
})

describe("isRichTextEmpty", () => {
  it.each([
    ["", true],
    [null, true],
    ["<p><br></p>", true],
    [`<p> ${ch(0xa0)} ${ch(0x200b)}</p>`, true],
    ["<p>&nbsp;</p><hr>", true],
    ["<p>a</p>", false],
    [`<p><img src="/x.png"></p>`, false],
    [`<div class="video"><iframe src="x"></iframe></div>`, false],
  ])("%j → %s", (html, expected) => {
    expect(isRichTextEmpty(html)).toBe(expected)
  })
})

describe("plainTextToHtml", () => {
  it("줄마다 문단, 빈 줄은 <p><br></p>, 특수문자는 이스케이프", () => {
    expect(plainTextToHtml("a<b>\r\n\r\nc")).toBe("<p>a&lt;b&gt;</p><p><br></p><p>c</p>")
  })
  it("끝의 개행 하나는 빈 문단을 만들지 않는다", () => {
    expect(plainTextToHtml("a\n")).toBe("<p>a</p>")
  })
})

describe("editorImageProblem", () => {
  const f = (type: string, size: number) => ({ type, size })
  it("허용 형식·크기면 null", () => {
    for (const t of ["image/png", "image/jpeg", "image/webp", "image/gif"]) {
      expect(editorImageProblem(f(t, 1000))).toBeNull()
    }
    expect(editorImageProblem(f("image/png", EDITOR_IMAGE_MAX_BYTES))).toBeNull()
  })
  it("형식이 아니면 형식 안내", () => {
    expect(editorImageProblem(f("image/svg+xml", 10))).toMatch(/PNG·JPEG·WebP·GIF/)
    expect(editorImageProblem(f("application/pdf", 10))).toMatch(/PNG/)
  })
  it("5MB 를 1바이트라도 넘으면 크기 안내", () => {
    expect(editorImageProblem(f("image/png", EDITOR_IMAGE_MAX_BYTES + 1))).toMatch(/5MB/)
  })
  it("빈 파일은 거절", () => {
    expect(editorImageProblem(f("image/png", 0))).toMatch(/빈 파일/)
  })
})

describe("normalizeLinkUrl", () => {
  it.each([
    ["https://example.com/a?b=1", "https://example.com/a?b=1"],
    ["  http://a.co  ", "http://a.co"],
    ["example.com/path", "https://example.com/path"],
    ["mailto:a@b.com", "mailto:a@b.com"],
    ["tel:010-1234-5678", "tel:010-1234-5678"],
    ["http://localhost:8000/x", "http://localhost:8000/x"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeLinkUrl(input)).toBe(expected)
  })
  it.each(["", "javascript:alert(1)", "data:text/html,x", "ftp://a.com", "not a url", "foo"])("거절: %j", (input) => {
    expect(normalizeLinkUrl(input)).toBeNull()
  })
})
