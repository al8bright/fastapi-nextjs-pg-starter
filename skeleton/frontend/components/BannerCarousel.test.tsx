import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { BannerPublic } from "@/lib/types"
import BannerCarousel from "./BannerCarousel"

// 홈 배너 캐러셀(클라이언트 컴포넌트) — 렌더, 이전/다음·점 이동, 자동 넘김과 일시정지, 링크 처리.
// "배너가 없으면 히어로" 분기는 서버 컴포넌트(app/(site)/page.tsx)라 여기서 다루지 않는다 — next build + 수동 확인.

const banners: BannerPublic[] = [
  { id: 1, title: "첫 배너", image_url: "/uploads/public/banners/a.webp", width: 1440, height: 480, link_url: "/notices/1", alt_text: "첫 배너 설명" },
  { id: 2, title: "둘째 배너", image_url: "/uploads/public/banners/b.webp", width: 1440, height: 480, link_url: "https://example.com", alt_text: "둘째 배너 설명" },
  { id: 3, title: "셋째 배너", image_url: "/uploads/public/banners/c.webp", width: 1440, height: 480, link_url: null, alt_text: "셋째 배너 설명" },
]

function visibleSlide() {
  return screen.getAllByRole("group", { hidden: true }).find((g) => !g.hidden)!
}

function renderCarousel(list = banners) {
  return render(<BannerCarousel banners={list} />)
}

describe("BannerCarousel", () => {
  afterEach(() => vi.useRealTimers())

  it("배너를 슬라이드로 그리고 이전/다음·점 버튼으로 이동한다", () => {
    renderCarousel()
    expect(screen.getByRole("region", { name: "주요 배너" })).toHaveAttribute("aria-roledescription", "carousel")
    expect(visibleSlide()).toHaveAccessibleName("1 / 3: 첫 배너")

    fireEvent.click(screen.getByRole("button", { name: "다음 배너" }))
    expect(visibleSlide()).toHaveAccessibleName("2 / 3: 둘째 배너")

    fireEvent.click(screen.getByRole("button", { name: "이전 배너" }))
    fireEvent.click(screen.getByRole("button", { name: "이전 배너" }))
    expect(visibleSlide()).toHaveAccessibleName("3 / 3: 셋째 배너")

    const dot = screen.getByRole("button", { name: "2번째 배너 보기: 둘째 배너" })
    fireEvent.click(dot)
    expect(dot).toHaveAttribute("aria-current", "true")
    expect(visibleSlide()).toHaveAccessibleName("2 / 3: 둘째 배너")
  })

  it("내부 링크는 next/link, 외부 링크는 새 창 + noopener, 링크 없으면 이미지만", () => {
    renderCarousel()
    const internal = screen.getByRole("img", { name: "첫 배너 설명" }).closest("a")!
    expect(internal).toHaveAttribute("href", "/notices/1")
    expect(internal).not.toHaveAttribute("target")

    const external = screen.getByRole("img", { name: "둘째 배너 설명", hidden: true }).closest("a")!
    expect(external).toHaveAttribute("href", "https://example.com")
    expect(external).toHaveAttribute("target", "_blank")
    expect(external).toHaveAttribute("rel", "noopener noreferrer")

    expect(screen.getByRole("img", { name: "셋째 배너 설명", hidden: true }).closest("a")).toBeNull()
  })

  it("6초마다 자동으로 넘기고, 마우스를 올리거나 일시정지하면 멈춘다", () => {
    vi.useFakeTimers()
    renderCarousel()
    act(() => vi.advanceTimersByTime(6000))
    expect(visibleSlide()).toHaveAccessibleName("2 / 3: 둘째 배너")

    const region = screen.getByRole("region", { name: "주요 배너" })
    fireEvent.mouseEnter(region)
    act(() => vi.advanceTimersByTime(12000))
    expect(visibleSlide()).toHaveAccessibleName("2 / 3: 둘째 배너")
    fireEvent.mouseLeave(region)

    fireEvent.click(screen.getByRole("button", { name: "자동 넘김 멈춤" }))
    act(() => vi.advanceTimersByTime(12000))
    expect(visibleSlide()).toHaveAccessibleName("2 / 3: 둘째 배너")
    expect(screen.getByRole("button", { name: "자동 넘김 시작" })).toBeInTheDocument()
  })

  it("prefers-reduced-motion 이면 자동으로 넘기지 않는다", () => {
    vi.useFakeTimers()
    const original = window.matchMedia
    window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })
    try {
      renderCarousel()
      act(() => vi.advanceTimersByTime(20000))
      expect(visibleSlide()).toHaveAccessibleName("1 / 3: 첫 배너")
      expect(screen.queryByRole("button", { name: /자동 넘김/ })).toBeNull()
    } finally {
      window.matchMedia = original
    }
  })

  it("배너가 하나면 이동 버튼을 그리지 않는다", () => {
    renderCarousel([banners[0]])
    expect(screen.queryByRole("button", { name: "다음 배너" })).toBeNull()
  })
})
