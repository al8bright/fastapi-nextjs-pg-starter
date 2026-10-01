import type { BannerAdmin } from "@/lib/types"
import { toDateTimeLocal } from "@/lib/format"
import { linkUrlProblem } from "@/lib/linkUrl"

// 배너 폼 값·검증 — 클라이언트 폼(BannerForm)과 Server Action(saveBannerAction)이 같은 규칙을 쓴다.
// 순수 모듈이라 양쪽에서 import 할 수 있다. 검증 규칙은 백엔드 BannerWrite 와 같다.

export interface BannerValues {
  title: string
  alt: string
  link: string
  startsAt: string
  endsAt: string
  active: boolean
  image: { key: string; url: string; width: number; height: number } | null
}

export type BannerErrors = Partial<Record<"title" | "alt" | "link" | "period" | "image", string>>

export function bannerValuesOf(b: BannerAdmin | null): BannerValues {
  return {
    title: b?.title ?? "",
    alt: b?.alt_text ?? "",
    link: b?.link_url ?? "",
    startsAt: toDateTimeLocal(b?.starts_at),
    endsAt: toDateTimeLocal(b?.ends_at),
    active: b?.is_active ?? true,
    image: b ? { key: b.image_key, url: b.image_url, width: b.image_width, height: b.image_height } : null,
  }
}

/** 폼 검증 — 백엔드 BannerWrite 규칙과 같다(대체 텍스트는 접근성을 위해 화면에서 필수로 받는다). */
export function validateBanner(v: BannerValues): BannerErrors {
  const errors: BannerErrors = {}
  if (!v.image) errors.image = "배너 이미지를 올리세요."
  if (!v.title.trim()) errors.title = "제목을 입력하세요."
  if (!v.alt.trim()) errors.alt = "대체 텍스트를 입력하세요. 이미지 속 문구나 배너의 목적을 적습니다."
  const link = linkUrlProblem(v.link)
  if (link) errors.link = link
  if (v.startsAt && v.endsAt && v.endsAt <= v.startsAt) errors.period = "종료 시각은 시작 시각보다 뒤여야 합니다."
  return errors
}
