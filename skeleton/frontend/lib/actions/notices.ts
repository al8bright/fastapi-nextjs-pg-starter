"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { INVALID_TARGET, toId, type ActionResult } from "@/lib/actions/result"
import { apiErrorMessage } from "@/lib/api-error"
import { createNotice, deleteAttachment, deleteNotice, updateNotice, uploadAttachment } from "@/lib/server/notices"
import type { AdminNoticeDetail } from "@/lib/types"
import { MAX_ATTACHMENT_MB } from "@/lib/uploadRules"

// 공지사항 Server Action (ARCHITECTURE.md §13·§14). 브라우저 → Next(이 액션) → FastAPI(Bearer).
// ⛔ "use server" 파일은 async 함수만 export 한다 — 폼 초기 상태는 components/admin/NoticeForm.tsx 에 둔다.
// ⚠️ redirect() 는 try/catch 밖에서 부른다(NEXT_REDIRECT 예외).

const TITLE_MAX = 200

/** 공지 폼 상태 (useActionState). 성공하면 message 가 차고, 처음 저장(POST)은 수정 화면으로 redirect 한다. */
export interface NoticeFormState {
  error: string | null
  message: string | null
}

/**
 * 공지·첨부·배너 변경은 공개 화면(홈·공지)과 관리자 화면(목록·대시보드 집계·사이드바 배지)에 함께 걸린다.
 * 화면이 모두 동적 렌더(no-store)라 서버 캐시는 없고, 이 호출은 **클라이언트 라우터 캐시**를 비워
 * 액션 응답에 현재 화면의 새 데이터를 실어 보내게 한다. 범위를 좁히는 것보다 빠뜨리지 않는 쪽을 택했다.
 */
async function revalidateContent(): Promise<void> {
  revalidatePath("/", "layout")
}

/** 저장 — id 가 없으면 생성(POST) 후 수정 화면으로, 있으면 전체 교체(PUT). */
export async function saveNoticeAction(_prev: NoticeFormState, formData: FormData): Promise<NoticeFormState> {
  const rawId = formData.get("id")
  const id = rawId ? toId(rawId) : null
  if (rawId && id === null) return { error: INVALID_TARGET, message: null }

  const title = String(formData.get("title") ?? "").trim()
  const body = {
    title,
    body_html: String(formData.get("body_html") ?? ""),
    is_pinned: formData.get("is_pinned") === "on",
    is_published: formData.get("is_published") === "on",
  }
  // 클라이언트가 먼저 검사하지만, 폼 값은 언제든 조작될 수 있으므로 여기서 다시 본다(본문 비어 있음은 서버가 422).
  if (!title) return { error: "제목을 입력하세요.", message: null }
  if (title.length > TITLE_MAX) return { error: `제목은 ${TITLE_MAX}자 이하로 입력하세요.`, message: null }

  let saved: AdminNoticeDetail
  try {
    saved = id === null ? await createNotice(body) : await updateNotice(id, body)
  } catch (error) {
    return { error: apiErrorMessage(error), message: null }
  }
  await revalidateContent()

  // 처음 저장하면 첨부를 올릴 수 있는 수정 화면으로 — 안내 문구는 쿼리로 넘긴다(화면이 한 번 보여 준다).
  if (id === null) redirect(`/admin/notices/${saved.id}/edit?created=1`)
  return {
    error: null,
    message: saved.is_published ? "저장했습니다. 사용자 화면에 게시 중입니다." : "임시저장했습니다.",
  }
}

/** 공지 삭제(첨부 파일 포함) — 성공하면 목록으로 이동한다. */
export async function deleteNoticeAction(noticeId: number): Promise<ActionResult> {
  const id = toId(noticeId)
  if (id === null) return { ok: false, error: INVALID_TARGET }
  try {
    await deleteNotice(id)
  } catch (error) {
    return { ok: false, error: apiErrorMessage(error) }
  }
  await revalidateContent()
  redirect("/admin/notices")
}

/**
 * 첨부 한 개 업로드 — 클라이언트(AttachmentsPanel)가 파일마다 순서대로 부른다.
 * formData 의 `file` 필드. 본문 상한은 next.config.ts 의 serverActions.bodySizeLimit 이다.
 */
export async function uploadAttachmentAction(noticeId: number, formData: FormData): Promise<ActionResult> {
  const id = toId(noticeId)
  const file = formData.get("file")
  if (id === null || !(file instanceof File)) return { ok: false, error: INVALID_TARGET }
  try {
    await uploadAttachment(id, file)
  } catch (error) {
    return { ok: false, error: apiErrorMessage(error, { maxMb: MAX_ATTACHMENT_MB }) }
  }
  await revalidateContent()
  return { ok: true, data: undefined }
}

export async function deleteAttachmentAction(noticeId: number, attachmentId: number): Promise<ActionResult> {
  const id = toId(noticeId)
  const aid = toId(attachmentId)
  if (id === null || aid === null) return { ok: false, error: INVALID_TARGET }
  try {
    await deleteAttachment(id, aid)
  } catch (error) {
    return { ok: false, error: apiErrorMessage(error) }
  }
  await revalidateContent()
  return { ok: true, data: undefined }
}
