"use client"

import Link from "next/link"
import { useEffect, useState, useSyncExternalStore } from "react"
import Icon from "@/components/ui/Icon"
import { ui } from "@/components/ui/styles"
import { isInternalLink } from "@/lib/linkUrl"
import type { BannerPublic } from "@/lib/types"

// 홈 배너 캐러셀 (WAI-ARIA APG Carousel 패턴).
// - 자동 넘김 6초. 마우스를 올리거나 안쪽에 포커스가 있으면 멈추고, 일시정지 버튼으로 끌 수 있다(WCAG 2.2.2).
// - prefers-reduced-motion 이면 자동 넘김을 하지 않는다.
// - 내부 링크(/...)는 next/link 로, 외부 링크는 새 창(rel="noopener noreferrer")으로 연다.
// - 배너 목록은 서버(홈 화면)가 조회해 props 로 넘긴다. 이미지 URL 은 같은 오리진의 /uploads(rewrite)다.

const AUTO_ADVANCE_MS = 6000

function subscribeReducedMotion(callback: () => void) {
  const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)")
  mq?.addEventListener?.("change", callback)
  return () => mq?.removeEventListener?.("change", callback)
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
}

function BannerImage({ banner, eager }: { banner: BannerPublic; eager: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 백엔드가 이미 재인코딩·축소한 업로드 이미지(크기 포함)라 next/image 최적화를 거치지 않는다.
    <img
      src={banner.image_url}
      alt={banner.alt_text || banner.title}
      width={banner.width}
      height={banner.height}
      loading={eager ? "eager" : "lazy"}
      className="size-full object-cover"
    />
  )
}

function Slide({ banner, eager }: { banner: BannerPublic; eager: boolean }) {
  const link = banner.link_url
  const linkClass = `block size-full ${ui.focusRing} focus-visible:ring-inset`
  if (!link) return <BannerImage banner={banner} eager={eager} />
  if (isInternalLink(link)) {
    return (
      <Link href={link} className={linkClass}>
        <BannerImage banner={banner} eager={eager} />
      </Link>
    )
  }
  return (
    <a href={link} target="_blank" rel="noopener noreferrer" className={linkClass}>
      <BannerImage banner={banner} eager={eager} />
      <span className="sr-only">(새 창에서 열림)</span>
    </a>
  )
}

export default function BannerCarousel({ banners }: { banners: BannerPublic[] }) {
  const [index, setIndex] = useState(0)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [stopped, setStopped] = useState(false)
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => false)

  const count = banners.length
  const current = count ? index % count : 0
  const autoPlay = count > 1 && !stopped && !reducedMotion
  const rotating = autoPlay && !hovered && !focused

  useEffect(() => {
    if (!rotating) return
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % count), AUTO_ADVANCE_MS)
    return () => window.clearInterval(timer)
  }, [rotating, count])

  if (count === 0) return null
  const go = (next: number) => setIndex((next + count) % count)

  const control = `flex size-11 items-center justify-center rounded-full bg-surface-container-lowest/90 text-on-surface shadow hover:bg-surface-container-lowest ${ui.focusRing}`

  return (
    <section
      aria-roledescription="carousel"
      aria-label="주요 배너"
      className="relative overflow-hidden rounded-xl bg-surface-container"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false)
      }}
    >
      <div className="relative aspect-[16/9] sm:aspect-[3/1]" aria-live={rotating ? "off" : "polite"}>
        {banners.map((banner, i) => (
          <div
            key={banner.id}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} / ${count}: ${banner.title}`}
            hidden={i !== current}
            className="absolute inset-0"
          >
            <Slide banner={banner} eager={i === 0} />
          </div>
        ))}
      </div>

      {count > 1 && (
        <>
          <button type="button" className={`${control} absolute top-1/2 left-3 -translate-y-1/2`} onClick={() => go(current - 1)} aria-label="이전 배너">
            <Icon name="chevronLeft" />
          </button>
          <button type="button" className={`${control} absolute top-1/2 right-3 -translate-y-1/2`} onClick={() => go(current + 1)} aria-label="다음 배너">
            <Icon name="chevronRight" />
          </button>
          <div className="absolute inset-x-0 bottom-1 flex items-center justify-center gap-1">
            {!reducedMotion && (
              <button
                type="button"
                className={`${control} size-9 min-h-9`}
                onClick={() => setStopped((v) => !v)}
                aria-label={stopped ? "자동 넘김 시작" : "자동 넘김 멈춤"}
              >
                <Icon name={stopped ? "play" : "pause"} size={14} />
              </button>
            )}
            {banners.map((banner, i) => (
              <button
                key={banner.id}
                type="button"
                onClick={() => go(i)}
                aria-label={`${i + 1}번째 배너 보기: ${banner.title}`}
                aria-current={i === current ? "true" : undefined}
                className={`flex size-11 items-center justify-center rounded-full ${ui.focusRing}`}
              >
                <span
                  aria-hidden="true"
                  className={`block h-2.5 rounded-full border border-on-surface/40 transition-all ${
                    i === current ? "w-6 bg-primary" : "w-2.5 bg-surface-container-lowest"
                  }`}
                />
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
