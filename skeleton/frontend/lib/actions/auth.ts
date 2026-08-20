"use server"

import { redirect } from "next/navigation"
import { safeRedirect } from "@/lib/safe-redirect"
import { fastapiErrorMessage, fastapiFetch } from "@/lib/server/fastapi"
import { clearSessionToken, setSessionToken } from "@/lib/session"
import type { TokenResponse } from "@/lib/types"

// 인증 Server Action (architecture.md §14).
// React SPA 판의 useLogin()/useLogout() mutation 에 대응한다.
// 차이: 요청은 브라우저가 아니라 **Next 서버**가 보내고, 토큰은 응답 본문에 실려 나가지 않고
// httpOnly 쿠키로만 남는다. 클라이언트가 돌려받는 것은 오류 문구뿐이다.
//
// ⛔ `"use server"` 파일은 **async 함수만** export 할 수 있다.
//    폼 초기 상태 같은 상수를 여기서 export 하면 빌드가 깨진다 → components/LoginForm.tsx 에 둔다.
//    (타입 export 는 컴파일 시 지워지므로 허용된다.)

/** useActionState 가 주고받는 폼 상태. 성공하면 redirect 하므로 error 만 있으면 된다. */
export interface LoginState {
  error: string | null
}

/**
 * 로그인. 성공 시 세션 쿠키를 굽고 `next`(검증된 내부 경로)로 리다이렉트한다.
 *
 * ⚠️ `redirect()` 는 NEXT_REDIRECT 예외를 던져서 동작한다 — try 블록 안에서 호출하면
 *    catch 가 그 예외를 삼켜 "로그인은 됐는데 화면이 안 넘어가는" 버그가 된다.
 *    반드시 try/catch **밖에서** 호출한다.
 */
export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "")
  const password = String(formData.get("password") ?? "")
  // 사용자가 조작할 수 있는 값이다 — 반드시 safeRedirect 를 거친다 (오픈 리다이렉트 방지).
  const next = safeRedirect(formData.get("next"))

  try {
    const token = await fastapiFetch<TokenResponse>({
      path: "/auth/login",
      method: "POST",
      body: { username, password },
    })
    await setSessionToken(token.access_token)
  } catch (error) {
    return { error: fastapiErrorMessage(error) }
  }

  redirect(next)
}

/**
 * 로그아웃. 쿠키만 지우면 끝이다 — 서버 상태 캐시가 없으므로
 * React 판의 endSession(queryClient) 같은 "이전 사용자 데이터 잔존" 문제가 원천적으로 없다.
 */
export async function logoutAction(): Promise<void> {
  await clearSessionToken()
  redirect("/login")
}
