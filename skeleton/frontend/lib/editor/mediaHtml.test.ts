import { describe, expect, it } from "vitest"
import {
  extractYoutubeId,
  imageHtml,
  serializeEditorHtml,
  youtubeEmbedHtml,
  youtubeEmbedSrc,
  youtubeIdFromEmbedSrc,
} from "./mediaHtml"

const ID = "dQw4w9WgXcQ"

describe("imageHtml", () => {
  it("src·alt·width·height 를 만든다", () => {
    expect(imageHtml({ src: "/uploads/public/editor/a.webp", alt: "고양이", width: 640, height: 360 })).toBe(
      `<img src="/uploads/public/editor/a.webp" alt="고양이" width="640" height="360">`,
    )
  })
  it("속성값을 이스케이프한다(속성 탈출 차단)", () => {
    const html = imageHtml({ src: `/a.png" onerror="alert(1)`, alt: `"><script>` })
    expect(html).toBe(`<img src="/a.png&quot; onerror=&quot;alert(1)" alt="&quot;&gt;&lt;script&gt;">`)
    const t = document.createElement("template")
    t.innerHTML = html
    const img = t.content.querySelector("img")!
    expect(img.getAttribute("onerror")).toBeNull()
    expect(img.getAttribute("alt")).toBe(`"><script>`)
  })
  it("width/height 가 없거나 비정상이면 생략한다", () => {
    expect(imageHtml({ src: "/a.png" })).toBe(`<img src="/a.png" alt="">`)
    expect(imageHtml({ src: "/a.png", width: Number.NaN, height: 0 })).toBe(`<img src="/a.png" alt="">`)
    expect(imageHtml({ src: "/a.png", width: 640.6, height: 360.2 })).toBe(`<img src="/a.png" alt="" width="641" height="360">`)
  })
})

describe("youtubeEmbedHtml", () => {
  it("명세의 저장 마크업과 같다(쿼리 없음, nocookie)", () => {
    expect(youtubeEmbedHtml(ID, 640)).toBe(
      `<div class="video" data-youtube-video><iframe src="https://www.youtube-nocookie.com/embed/${ID}" width="640" height="360" title="YouTube 영상" allowfullscreen></iframe></div>`,
    )
  })
  it("편집 중에는 래퍼에 contenteditable=false", () => {
    expect(youtubeEmbedHtml(ID, 640, true)).toContain(`<div class="video" data-youtube-video contenteditable="false">`)
  })
  it("폭은 [200,1280] 으로 맞추고 16:9", () => {
    expect(youtubeEmbedHtml(ID, 5000)).toContain(`width="1280" height="720"`)
    expect(youtubeEmbedHtml(ID, 10)).toContain(`width="200" height="113"`)
    expect(youtubeEmbedHtml(ID)).toContain(`width="640" height="360"`)
  })
  it("잘못된 ID 는 예외", () => {
    expect(() => youtubeEmbedSrc(`"><x`)).toThrow()
    expect(() => youtubeEmbedHtml("short")).toThrow()
  })
})

describe("extractYoutubeId", () => {
  it.each([
    [`https://www.youtube.com/watch?v=${ID}`],
    [`https://youtube.com/watch?v=${ID}&t=42s&list=PL1`],
    [`https://m.youtube.com/watch?feature=share&v=${ID}`],
    [`http://www.youtube.com/watch?v=${ID}`],
    [`www.youtube.com/watch?v=${ID}`],
    [`https://youtu.be/${ID}`],
    [`https://youtu.be/${ID}?si=abc&t=10`],
    [`youtu.be/${ID}`],
    [`https://www.youtube.com/shorts/${ID}`],
    [`https://youtube.com/shorts/${ID}?feature=share`],
    [`https://www.youtube.com/embed/${ID}`],
    [`https://www.youtube-nocookie.com/embed/${ID}?autoplay=1`],
    [`https://www.youtube.com/live/${ID}`],
    [`  https://youtu.be/${ID}  `],
  ])("%s", (url) => {
    expect(extractYoutubeId(url)).toBe(ID)
  })

  it.each([
    [""],
    ["유튜브"],
    ["https://vimeo.com/123456"],
    [`https://example.com/watch?v=${ID}`],
    [`https://youtube.com.evil.com/watch?v=${ID}`],
    ["https://www.youtube.com/watch?v=short"],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ123"],
    [`https://www.youtube.com/channel/${ID}`],
    ["https://youtu.be/"],
    [`javascript:alert('${ID}')`],
    [`ftp://youtu.be/${ID}`],
  ])("거절: %j", (url) => {
    expect(extractYoutubeId(url)).toBeNull()
  })
})

describe("youtubeIdFromEmbedSrc", () => {
  it("임베드 src 에서만 ID 를 읽는다", () => {
    expect(youtubeIdFromEmbedSrc(`https://www.youtube-nocookie.com/embed/${ID}`)).toBe(ID)
    expect(youtubeIdFromEmbedSrc(`https://www.youtube.com/embed/${ID}`)).toBe(ID)
    expect(youtubeIdFromEmbedSrc(`https://www.youtube.com/embed/${ID}?x=1`)).toBeNull()
    expect(youtubeIdFromEmbedSrc(null)).toBeNull()
  })
})

describe("serializeEditorHtml", () => {
  it("편집 전용 속성을 지운다", () => {
    const html =
      `<p style="text-align:center">a</p>` +
      `<p><img src="/a.png" alt="" width="640" height="360" draggable="false" data-selected="true" style="width:300px"></p>` +
      `<div class="video" data-youtube-video="" contenteditable="false" data-selected="true"><iframe src="https://www.youtube-nocookie.com/embed/${ID}" width="640" height="360" title="YouTube 영상" allowfullscreen=""></iframe></div>`
    const out = serializeEditorHtml(html)
    expect(out).not.toMatch(/style=|draggable|data-selected|contenteditable/)
    expect(out).toContain(`<img src="/a.png" alt="" width="640" height="360">`)
    expect(out).toContain(`<div class="video" data-youtube-video="">`)
  })

  it("업로드 중 자리표시(blob: 미리보기)를 통째로 제거한다", () => {
    const out = serializeEditorHtml(`<p>a<img data-uploading="u1" src="blob:http://x/1" alt="업로드 중">b</p>`)
    expect(out).toBe("<p>ab</p>")
  })

  it("b·i·strike 를 strong·em·s 로, 속성 없는 span·font 는 벗긴다", () => {
    expect(serializeEditorHtml(`<p><b>a<i>b</i></b><strike>c</strike><span>d</span><font color="red">e</font></p>`)).toBe(
      "<p><strong>a<em>b</em></strong><s>c</s>de</p>",
    )
  })

  it("style 만 있던 span 도 속성이 지워진 뒤 벗겨진다", () => {
    expect(serializeEditorHtml(`<p><span style="font-weight:700">x</span></p>`)).toBe("<p>x</p>")
  })

  it("빈 문서(빈 문단만)는 빈 문자열", () => {
    expect(serializeEditorHtml("<p><br></p>")).toBe("")
    expect(serializeEditorHtml("<p></p><p><br></p>")).toBe("")
    expect(serializeEditorHtml("<br>")).toBe("")
    expect(serializeEditorHtml("")).toBe("")
  })

  it("정렬 class 와 일반 내용은 그대로", () => {
    expect(serializeEditorHtml(`<h2 class="align-center">제목</h2><ul><li>a</li></ul>`)).toBe(
      `<h2 class="align-center">제목</h2><ul><li>a</li></ul>`,
    )
  })
})
