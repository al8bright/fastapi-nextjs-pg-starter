"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { validateBanner } from "@/lib/bannerForm"
import { INVALID_TARGET, toId, type ActionResult } from "@/lib/actions/result"
import { apiErrorMessage } from "@/lib/api-error"
import {
  bannerToWrite,
  createBanner,
  deleteBanner,
  getAdminBanner,
  reorderBanners,
  updateBanner,
  uploadBannerImage,
} from "@/lib/server/banners"
import { fromDateTimeLocal } from "@/lib/format"
import type { UploadedImage } from "@/lib/types"
import { MAX_IMAGE_MB } from "@/lib/uploadRules"

// 배너 Server Action (ARCHITECTURE.md §13). 이미지를 먼저 올려(uploadBannerImageAction) key 를 받고,
// 저장 때 image_key 로 참조한다. ⛔ 상수 export 금지("use server") — 초기 상태는 BannerForm.tsx 에.

export interface BannerFormState {
  error: string | null
}

/** 배너 변경은 홈 캐러셀·대시보드 집계와 엮여 있어 전체를 무효화한다(lib/actions/notices.ts 와 같은 이유). */
async function revalidateBanners(): Promise<void> {
  revalidatePath("/", "layout")
}

/** 배너 이미지 업로드 — formData 의 `file`. 결과의 key 를 폼이 hidden 으로 들고 있다가 저장 때 보낸다. */
export async function uploadBannerImageAction(formData: FormData): Promise<ActionResult<UploadedImage>> {
  const file = formData.get("file")
  if (!(file instanceof File)) return { ok: false, error: INVALID_TARGET }
  try {
    return { ok: true, data: await uploadBannerImage(file) }
  } catch (error) {
    return { ok: false, error: apiErrorMessage(error, { maxMb: MAX_IMAGE_MB }) }
  }
}

/** 저장 — id 가 없으면 생성, 있으면 전체 교체(sort_order 생략 → 유지). 성공하면 목록으로. */
export async function saveBannerAction(_prev: BannerFormState, formData: FormData): Promise<BannerFormState> {
  const rawId = formData.get("id")
  const id = rawId ? toId(rawId) : null
  if (rawId && id === null) return { error: INVALID_TARGET }

  const field = (name: string) => String(formData.get(name) ?? "")
  const imageKey = field("image_key")
  const values = {
    title: field("title"),
    alt: field("alt_text"),
    link: field("link_url"),
    startsAt: field("starts_at"),
    endsAt: field("ends_at"),
    active: formData.get("is_active") === "on",
    // 검증은 key 존재만 본다 — 미리보기용 url·크기는 저장에 쓰지 않는다.
    image: imageKey ? { key: imageKey, url: "", width: 0, height: 0 } : null,
  }
  // 클라이언트와 같은 규칙으로 다시 검사한다(폼 값은 조작될 수 있다). 최종 판정은 백엔드 BannerWrite.
  const problems = validateBanner(values)
  const first = Object.values(problems).find(Boolean)
  if (first) return { error: first }

  const body = {
    title: values.title.trim(),
    image_key: imageKey,
    link_url: values.link.trim() || null,
    alt_text: values.alt.trim(),
    starts_at: fromDateTimeLocal(values.startsAt),
    ends_at: fromDateTimeLocal(values.endsAt),
    is_active: values.active,
  }
  try {
    if (id === null) await createBanner(body)
    else await updateBanner(id, body)
  } catch (error) {
    return { error: apiErrorMessage(error) }
  }
  await revalidateBanners()
  redirect("/admin/banners")
}

/** 활성 토글 — 최신 배너를 읽어 PUT 전체 본문으로 보낸다(클라이언트가 보낸 값을 믿지 않는다). */
export async function toggleBannerAction(bannerId: number): Promise<ActionResult<{ isActive: boolean }>> {
  const id = toId(bannerId)
  if (id === null) return { ok: false, error: INVALID_TARGET }
  let isActive: boolean
  try {
    const banner = await getAdminBanner(id)
    if (!banner) return { ok: false, error: "대상을 찾을 수 없습니다. 이미 삭제되었을 수 있습니다." }
    const saved = await updateBanner(id, { ...bannerToWrite(banner), is_active: !banner.is_active })
    isActive = saved.is_active
  } catch (error) {
    return { ok: false, error: apiErrorMessage(error) }
  }
  await revalidateBanners()
  return { ok: true, data: { isActive } }
}

/** 노출 순서 변경 — ids 를 나열한 순서대로 0..n-1. */
export async function reorderBannersAction(ids: number[]): Promise<ActionResult> {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500) return { ok: false, error: INVALID_TARGET }
  const clean = ids.map(toId)
  if (clean.some((v) => v === null)) return { ok: false, error: INVALID_TARGET }
  try {
    await reorderBanners(clean as number[])
  } catch (error) {
    return { ok: false, error: apiErrorMessage(error) }
  }
  await revalidateBanners()
  return { ok: true, data: undefined }
}

export async function deleteBannerAction(bannerId: number): Promise<ActionResult> {
  const id = toId(bannerId)
  if (id === null) return { ok: false, error: INVALID_TARGET }
  try {
    await deleteBanner(id)
  } catch (error) {
    return { ok: false, error: apiErrorMessage(error) }
  }
  await revalidateBanners()
  return { ok: true, data: undefined }
}
