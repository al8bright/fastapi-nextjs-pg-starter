import "server-only"
import { redirect } from "next/navigation"
import { apiErrorMessage } from "@/lib/api-error"
import { FastapiError } from "@/lib/server/fastapi"
import { getSessionUser } from "@/lib/session"
import type { User } from "@/lib/types"

// 서버 컴포넌트(관리자 화면)용 조회 도우미 (ARCHITECTURE.md §13·§14).

/** 조회 결과 — 실패는 던지지 않고 화면이 그릴 수 있는 문구로 돌려준다. */
export type Loaded<T> = { ok: true; data: T } | { ok: false; error: string }

/**
 * 조회 한 건을 실행한다. 401(세션 만료·무효)은 `/login?next=<currentPath>` 로 보내고,
 * 그 밖의 실패(403·404·5xx·네트워크)는 `{ ok: false, error }` 로 돌려준다.
 *
 * ⚠️ redirect() 는 NEXT_REDIRECT 예외로 동작한다 — try 블록 **밖에서** 부른다.
 */
export async function loadForPage<T>(currentPath: string, load: () => Promise<T>, fallback?: string): Promise<Loaded<T>> {
  try {
    return { ok: true, data: await load() }
  } catch (error) {
    if (!(error instanceof FastapiError && error.kind === "unauthorized")) {
      return { ok: false, error: apiErrorMessage(error, { fallback }) }
    }
  }
  redirect(`/login?next=${encodeURIComponent(currentPath)}`)
}

/** 관리자 콘솔 진입 판정 결과. */
export type AdminGate =
  | { status: "ok"; user: User }
  /** 로그인했지만 role 이 admin 이 아니다 → 403 화면. */
  | { status: "forbidden"; user: User }
  /** 백엔드 장애로 사용자 정보를 못 읽었다 → 오류 화면(세션 문제가 아니므로 로그인으로 보내지 않는다). */
  | { status: "unavailable" }

/**
 * 관리자 가드 (ARCHITECTURE.md §14) — `app/admin/layout.tsx` 가 부른다.
 * 비로그인(쿠키 없음)·무효 토큰(401)은 getSessionUser 가 `/login?next=` 로 보낸다
 * (보통은 그보다 먼저 proxy 가 원래 경로를 담아 보낸다). 역할 판정은 `/auth/me` 응답으로 한다.
 *
 * 이 가드는 **화면 노출을 정하는 UX 장치**다. 권한 경계는 백엔드(`/admin/*` 의 require_admin)이고,
 * 레이아웃은 클라이언트 이동 때 다시 렌더되지 않을 수 있으므로 각 화면의 조회 실패(403)도 문구로 처리한다.
 */
export async function checkAdmin(currentPath: string): Promise<AdminGate> {
  const user = await getSessionUser(currentPath)
  if (!user) return { status: "unavailable" }
  if (user.role !== "admin") return { status: "forbidden", user }
  return { status: "ok", user }
}
