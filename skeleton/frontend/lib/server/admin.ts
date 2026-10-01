import "server-only"
import { fastapiFetch } from "@/lib/server/fastapi"
import { getSessionToken } from "@/lib/session"
import type {
  AdminSession,
  AdminUser,
  AdminUserUpdate,
  Dashboard,
  DbHealth,
  Health,
  LoginThrottle,
  Page,
  UploadedImage,
  UserRole,
} from "@/lib/types"

// 관리자 콘솔 데이터 접근 — 대시보드·사용자·세션·로그인 잠금·헬스·에디터 이미지 (backend schemas/admin.py).
// 권한 판정은 백엔드(require_admin)가 한다 — 비관리자 토큰이면 403 이 FastapiError 로 온다.

export async function getDashboard(): Promise<Dashboard> {
  const token = await getSessionToken()
  return fastapiFetch<Dashboard>({ path: "/admin/dashboard", token })
}

export interface AdminUserParams {
  page?: number
  size?: number
  q?: string
  role?: UserRole
}

export async function listUsers(params: AdminUserParams = {}): Promise<Page<AdminUser>> {
  const token = await getSessionToken()
  return fastapiFetch<Page<AdminUser>>({ path: "/admin/users", query: { ...params }, token })
}

/** 부분 수정 — 409 self_modification·last_admin. 비활성화하면 서버가 세션을 전부 폐기한다. */
export async function updateUser(id: number, body: AdminUserUpdate): Promise<AdminUser> {
  const token = await getSessionToken()
  return fastapiFetch<AdminUser>({ path: `/admin/users/${id}`, method: "PATCH", body, token })
}

export async function revokeUserSessions(id: number): Promise<{ revoked: number }> {
  const token = await getSessionToken()
  return fastapiFetch<{ revoked: number }>({ path: `/admin/users/${id}/sessions`, method: "DELETE", token })
}

export interface AdminSessionParams {
  user_id?: number
  page?: number
  size?: number
}

export async function listSessions(params: AdminSessionParams = {}): Promise<Page<AdminSession>> {
  const token = await getSessionToken()
  return fastapiFetch<Page<AdminSession>>({ path: "/admin/sessions", query: { ...params }, token })
}

/** 강제 종료 — 멱등 204. */
export async function revokeSession(id: number): Promise<void> {
  const token = await getSessionToken()
  await fastapiFetch<void>({ path: `/admin/sessions/${id}`, method: "DELETE", token })
}

export async function listLoginThrottles(): Promise<LoginThrottle[]> {
  const token = await getSessionToken()
  return fastapiFetch<LoginThrottle[]>({ path: "/admin/login-throttles", token })
}

/** 잠금 해제(실패 기록 삭제) — 멱등 204. */
export async function unlockLoginThrottle(username: string): Promise<void> {
  const token = await getSessionToken()
  await fastapiFetch<void>({
    path: `/admin/login-throttles/${encodeURIComponent(username)}`,
    method: "DELETE",
    token,
  })
}

/** 에디터 본문 이미지 — multipart `file` → `{key,url,width,height}`(public/editor, 긴 변 ≤2000). */
export async function uploadEditorImage(file: Blob, filename: string): Promise<UploadedImage> {
  const token = await getSessionToken()
  const form = new FormData()
  form.append("file", file, filename)
  return fastapiFetch<UploadedImage>({
    path: "/admin/editor/images",
    method: "POST",
    body: form,
    token,
    timeoutMs: 60_000,
  })
}

// ---------- 헬스 (인증 불요) ----------

export async function getHealth(): Promise<Health> {
  return fastapiFetch<Health>({ path: "/health" })
}

export async function getDbHealth(): Promise<DbHealth> {
  return fastapiFetch<DbHealth>({ path: "/health/db" })
}
