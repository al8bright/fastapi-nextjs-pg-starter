"use server"

import { revalidatePath } from "next/cache"
import { INVALID_TARGET, toId, type ActionResult } from "@/lib/actions/result"
import { apiErrorMessage } from "@/lib/api-error"
import { revokeSession, revokeUserSessions, unlockLoginThrottle, updateUser } from "@/lib/server/admin"
import type { AdminUserUpdate } from "@/lib/types"

// 관리자 콘솔 Server Action — 사용자·세션·로그인 잠금 (ARCHITECTURE.md §13).
// 자기 자신 변경(409 self_modification)·마지막 관리자 보호(409 last_admin)는 백엔드가 거부하고
// apiErrorMessage 가 문구로 바꾼다. 사용자·세션 변경은 집계(세션 수·대시보드·사이드바 배지)가 얽혀
// 관리자 콘솔 전체를 무효화한다.

async function revalidateAdmin(): Promise<void> {
  revalidatePath("/admin", "layout")
}

/** 권한·활성 상태 변경 — 보낸 필드만 바꾼다. */
export async function updateUserAction(userId: number, change: AdminUserUpdate): Promise<ActionResult> {
  const id = toId(userId)
  const body: AdminUserUpdate = {}
  if (change?.role === "admin" || change?.role === "user") body.role = change.role
  if (typeof change?.is_active === "boolean") body.is_active = change.is_active
  if (id === null || Object.keys(body).length === 0) return { ok: false, error: INVALID_TARGET }
  try {
    await updateUser(id, body)
  } catch (error) {
    return { ok: false, error: apiErrorMessage(error) }
  }
  await revalidateAdmin()
  return { ok: true, data: undefined }
}

/** 사용자의 세션 모두 종료 — 종료한 개수를 돌려준다. */
export async function revokeUserSessionsAction(userId: number): Promise<ActionResult<{ revoked: number }>> {
  const id = toId(userId)
  if (id === null) return { ok: false, error: INVALID_TARGET }
  let revoked: number
  try {
    revoked = (await revokeUserSessions(id)).revoked
  } catch (error) {
    return { ok: false, error: apiErrorMessage(error) }
  }
  await revalidateAdmin()
  return { ok: true, data: { revoked } }
}

/** 세션 강제 종료 — 멱등. */
export async function revokeSessionAction(sessionId: number): Promise<ActionResult> {
  const id = toId(sessionId)
  if (id === null) return { ok: false, error: INVALID_TARGET }
  try {
    await revokeSession(id)
  } catch (error) {
    return { ok: false, error: apiErrorMessage(error) }
  }
  await revalidateAdmin()
  return { ok: true, data: undefined }
}

/** 로그인 잠금 해제(실패 기록 삭제) — 멱등. */
export async function unlockThrottleAction(username: string): Promise<ActionResult> {
  if (typeof username !== "string" || !username || username.length > 200) return { ok: false, error: INVALID_TARGET }
  try {
    await unlockLoginThrottle(username)
  } catch (error) {
    return { ok: false, error: apiErrorMessage(error) }
  }
  await revalidateAdmin()
  return { ok: true, data: undefined }
}
