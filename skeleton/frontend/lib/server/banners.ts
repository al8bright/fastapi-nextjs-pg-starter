import "server-only"
import { FastapiError, fastapiFetch } from "@/lib/server/fastapi"
import { getSessionToken } from "@/lib/session"
import type { BannerAdmin, BannerPublic, BannerWrite, UploadedImage } from "@/lib/types"

// 배너 데이터 접근 — 서버 전용 (ARCHITECTURE.md §13, backend schemas/banner.py).

/** 공개 배너 — 활성 + 노출 기간 안, sort_order → id 순. */
export async function listPublicBanners(): Promise<BannerPublic[]> {
  return fastapiFetch<BannerPublic[]>({ path: "/banners" })
}

export async function listAdminBanners(): Promise<BannerAdmin[]> {
  const token = await getSessionToken()
  return fastapiFetch<BannerAdmin[]>({ path: "/admin/banners", token })
}

/** 단건. 404 는 null. */
export async function getAdminBanner(id: number): Promise<BannerAdmin | null> {
  const token = await getSessionToken()
  try {
    return await fastapiFetch<BannerAdmin>({ path: `/admin/banners/${id}`, token })
  } catch (error) {
    if (error instanceof FastapiError && error.status === 404) return null
    throw error
  }
}

/** 배너 이미지 업로드 — multipart `file` → `{key,url,width,height}`. 413, 422. */
export async function uploadBannerImage(file: File): Promise<UploadedImage> {
  const token = await getSessionToken()
  const form = new FormData()
  form.append("file", file, file.name)
  return fastapiFetch<UploadedImage>({
    path: "/admin/banners/image",
    method: "POST",
    body: form,
    token,
    timeoutMs: 60_000,
  })
}

export async function createBanner(body: BannerWrite): Promise<BannerAdmin> {
  const token = await getSessionToken()
  return fastapiFetch<BannerAdmin>({ path: "/admin/banners", method: "POST", body, token })
}

/** 전체 교체(PUT) — sort_order 를 생략하면 유지. 교체된 이미지 파일은 서버가 지운다. */
export async function updateBanner(id: number, body: BannerWrite): Promise<BannerAdmin> {
  const token = await getSessionToken()
  return fastapiFetch<BannerAdmin>({ path: `/admin/banners/${id}`, method: "PUT", body, token })
}

export async function deleteBanner(id: number): Promise<void> {
  const token = await getSessionToken()
  await fastapiFetch<void>({ path: `/admin/banners/${id}`, method: "DELETE", token })
}

/** 노출 순서 변경 — 나열한 순서대로 0..n-1, 빠진 배너는 기존 순서대로 뒤. */
export async function reorderBanners(ids: number[]): Promise<BannerAdmin[]> {
  const token = await getSessionToken()
  return fastapiFetch<BannerAdmin[]>({ path: "/admin/banners/order", method: "PATCH", body: { ids }, token })
}

/** 기존 배너를 PUT 전체 교체 본문으로 바꾼다(활성 토글 등 일부만 바꿀 때). */
export function bannerToWrite(banner: BannerAdmin): BannerWrite {
  return {
    title: banner.title,
    image_key: banner.image_key,
    link_url: banner.link_url,
    alt_text: banner.alt_text,
    starts_at: banner.starts_at,
    ends_at: banner.ends_at,
    sort_order: banner.sort_order,
    is_active: banner.is_active,
  }
}
