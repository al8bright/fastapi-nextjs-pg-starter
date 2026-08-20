"use client"

import { useTransition } from "react"
import { logoutAction } from "@/lib/actions/auth"

// 로그아웃 버튼 (architecture.md §14).
// Server Action 이 쿠키를 지우고 /login 으로 redirect 한다 — 클라이언트가 할 일은 대기 표시뿐이다.
// startTransition 으로 감싸야 Action 이 도는 동안 UI 가 멈추지 않고 isPending 이 잡힌다.
export default function LogoutButton() {
  const [isPending, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(logoutAction)}
      className="mt-6 w-full rounded-lg bg-error-container py-2.5 font-semibold text-on-error-container disabled:opacity-60"
    >
      {isPending ? "로그아웃 중…" : "로그아웃"}
    </button>
  )
}
