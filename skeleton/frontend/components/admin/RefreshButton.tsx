"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { ui } from "@/components/ui/styles"

// "새로고침" — 서버 컴포넌트 화면을 다시 조회한다(router.refresh: 현재 라우트를 서버에서 다시 렌더,
// 클라이언트 상태는 유지). 클라이언트 쪽 데이터 캐시가 없으므로 이것이 유일한 갱신 경로다.
export default function RefreshButton({ label = "새로고침" }: { label?: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <button type="button" className={ui.btnNeutral} onClick={() => startTransition(() => router.refresh())} disabled={pending}>
      {pending ? "새로고침 중…" : label}
    </button>
  )
}
