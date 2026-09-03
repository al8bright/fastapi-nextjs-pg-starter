"use server"

import { redirect } from "next/navigation"
import { safeRedirect } from "@/lib/safe-redirect"
import { fastapiErrorMessage, fastapiFetch } from "@/lib/server/fastapi"
import { clearSessionTokens, getRefreshToken, setSessionTokens } from "@/lib/session"
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
 * 로그인. 성공 시 access·refresh 세션 쿠키를 굽고 `next`(검증된 내부 경로)로 리다이렉트한다.
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
    const tokens = await fastapiFetch<TokenResponse>({
      path: "/auth/login",
      method: "POST",
      body: { username, password },
    })
    await setSessionTokens(tokens)
  } catch (error) {
    // 429(시도 제한)도 여기로 온다 — fastapiErrorMessage 가 자격증명 오류와 구분해 문구를 만든다.
    return { error: fastapiErrorMessage(error) }
  }

  redirect(next)
}

/**
 * 로그아웃. 백엔드의 refresh 토큰을 폐기(revoke)한 뒤 두 쿠키를 지운다.
 *
 * 백엔드 호출은 **best-effort** 다 — 미기동·네트워크 오류로 로그아웃이 막히면 사용자는
 * 세션을 끊을 방법이 없어진다. 로그아웃의 본체는 쿠키 삭제이고, 폐기에 실패한 refresh
 * 토큰은 만료(기본 14일)로 소멸한다. `/auth/logout` 은 멱등(204·인증 불요)이라
 * 이미 폐기된 토큰을 다시 보내도 안전하다.
 */
export async function logoutAction(): Promise<void> {
  const refreshToken = await getRefreshToken()
  if (refreshToken) {
    try {
      await fastapiFetch<void>({
        path: "/auth/logout",
        method: "POST",
        body: { refresh_token: refreshToken },
      })
    } catch {
      // best-effort — 실패해도 쿠키 삭제와 리다이렉트는 진행한다.
    }
  }
  await clearSessionTokens()
  redirect("/login")
}
