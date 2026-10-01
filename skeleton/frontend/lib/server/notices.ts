import "server-only"
import { FastapiError, fastapiFetch, fastapiStream } from "@/lib/server/fastapi"
import { getSessionToken } from "@/lib/session"
import type {
  AdminNoticeDetail,
  AdminNoticeListItem,
  Attachment,
  NoticeDetail,
  NoticeListItem,
  NoticeWrite,
  Page,
} from "@/lib/types"

// 공지사항 데이터 접근 — 서버 전용 (ARCHITECTURE.md §13, backend schemas/notice.py).
// 공개 조회는 토큰 없이, 관리자 API 는 세션의 access 토큰(Bearer)으로 부른다.
// 실패는 FastapiError 로 던진다 — 화면(서버 컴포넌트)·Server Action 이 원인별로 처리한다.

export interface ListParams {
  page?: number
  size?: number
  q?: string
}

/** 첨부는 서버↔서버라도 20MB 까지 오가므로 기본 대기 상한(10초)보다 길게 잡는다. */
const FILE_TIMEOUT_MS = 120_000

// ---------- 공개 ----------

export async function listPublicNotices(params: ListParams = {}): Promise<Page<NoticeListItem>> {
  return fastapiFetch<Page<NoticeListItem>>({ path: "/notices", query: { ...params } })
}

/** 상세 — 서버가 조회수를 올린 뒤의 값을 준다. 임시저장·미존재(404)는 null. */
export async function getPublicNotice(id: number): Promise<NoticeDetail | null> {
  try {
    return await fastapiFetch<NoticeDetail>({ path: `/notices/${id}` })
  } catch (error) {
    if (error instanceof FastapiError && error.status === 404) return null
    throw error
  }
}

// ---------- 관리자 ----------

export async function listAdminNotices(params: ListParams = {}): Promise<Page<AdminNoticeListItem>> {
  const token = await getSessionToken()
  return fastapiFetch<Page<AdminNoticeListItem>>({ path: "/admin/notices", query: { ...params }, token })
}

/** 관리자 상세(임시저장 포함). 404 는 null. */
export async function getAdminNotice(id: number): Promise<AdminNoticeDetail | null> {
  const token = await getSessionToken()
  try {
    return await fastapiFetch<AdminNoticeDetail>({ path: `/admin/notices/${id}`, token })
  } catch (error) {
    if (error instanceof FastapiError && error.status === 404) return null
    throw error
  }
}

export async function createNotice(body: NoticeWrite): Promise<AdminNoticeDetail> {
  const token = await getSessionToken()
  return fastapiFetch<AdminNoticeDetail>({ path: "/admin/notices", method: "POST", body, token })
}

/** 전체 교체(PUT). published_at 은 최초 게시 때 서버가 기록한다. */
export async function updateNotice(id: number, body: NoticeWrite): Promise<AdminNoticeDetail> {
  const token = await getSessionToken()
  return fastapiFetch<AdminNoticeDetail>({ path: `/admin/notices/${id}`, method: "PUT", body, token })
}

export async function deleteNotice(id: number): Promise<void> {
  const token = await getSessionToken()
  await fastapiFetch<void>({ path: `/admin/notices/${id}`, method: "DELETE", token })
}

/** 첨부 업로드 — multipart `file`. 413 용량, 422 형식, 409 10개 초과, 404. */
export async function uploadAttachment(noticeId: number, file: File): Promise<Attachment> {
  const token = await getSessionToken()
  const form = new FormData()
  form.append("file", file, file.name)
  return fastapiFetch<Attachment>({
    path: `/admin/notices/${noticeId}/attachments`,
    method: "POST",
    body: form,
    token,
    timeoutMs: FILE_TIMEOUT_MS,
  })
}

export async function deleteAttachment(noticeId: number, attachmentId: number): Promise<void> {
  const token = await getSessionToken()
  await fastapiFetch<void>({ path: `/admin/notices/${noticeId}/attachments/${attachmentId}`, method: "DELETE", token })
}

/**
 * 관리자 첨부 다운로드(임시저장 공지 포함) — 응답을 해석하지 않고 그대로 돌려준다.
 * Route Handler(app/admin/notices/[id]/attachments/[attachmentId]/route.ts)가 본문을 스트리밍으로 넘긴다.
 */
export async function streamAdminAttachment(noticeId: number, attachmentId: number): Promise<Response> {
  const token = await getSessionToken()
  return fastapiStream({
    path: `/admin/notices/${noticeId}/attachments/${attachmentId}`,
    token,
    timeoutMs: FILE_TIMEOUT_MS,
  })
}
