import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import RichContent from "./RichContent"

describe("RichContent", () => {
  it(".rich-text 래퍼 안에 (서버가 정화한) HTML 을 그대로 렌더한다", () => {
    const { container } = render(<RichContent html={`<h2 class="align-center">제목</h2><ul><li>항목</li></ul>`} className="mt-4" />)
    const root = container.firstElementChild!
    expect(root).toHaveClass("rich-text", "mt-4")
    expect(root.querySelector("h2.align-center")).toHaveTextContent("제목")
    expect(root.querySelector("ul > li")).toHaveTextContent("항목")
  })
})
