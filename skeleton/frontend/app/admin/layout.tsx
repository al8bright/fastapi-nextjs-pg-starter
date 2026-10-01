import Link from "next/link"
import type { ReactNode } from "react"
import AdminShell from "@/components/layout/AdminShell"
import { ErrorState } from "@/components/ui/QueryState"
import { ui } from "@/components/ui/styles"
import { getDashboard } from "@/lib/server/admin"
import { checkAdmin } from "@/lib/server/load"

// 관리자 콘솔 레이아웃 + 관리자 가드 (ARCHITECTURE.md §14). 서버 컴포넌트다.
//
//   비로그인        → proxy.ts 가 요청 단계에서 /login?next=<원래 경로> 로 보낸다(여기까지 오지 않는다).
//   무효 토큰(401)  → checkAdmin(getSessionUser)이 /login?next=/admin 으로 보낸다.
//   role ≠ admin    → 403 화면(아래 Forbidden). 콘솔 틀·메뉴를 그리지 않는다.
//   백엔드 장애     → 오류 화면(세션 문제가 아니므로 로그인으로 보내지 않는다).
//
// ⚠️ 이 가드는 화면 노출을 정하는 UX 장치다. 권한 경계는 백엔드 `/admin/*` 의 require_admin 이다 —
//    레이아웃은 클라이언트 이동 때 다시 렌더되지 않을 수 있으므로, 각 화면도 조회 실패(403)를 문구로 보여 준다.
// "관리자 콘솔" 진입 링크는 role=admin 에게만 보인다(사용자 헤더의 AccountMenu).

export const metadata = { title: { default: "관리자 콘솔", template: "%s | 관리자 콘솔" } }

function Forbidden() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className={`${ui.card} w-full max-w-md p-8 text-center`}>
        <p className="text-sm font-semibold tracking-wider text-error">403</p>
        <h1 className="mt-2 text-2xl font-semibold text-on-surface">접근 권한이 없습니다</h1>
        <p className="mt-3 text-on-surface-variant">
          관리자 콘솔은 관리자 계정만 이용할 수 있습니다. 권한이 필요하면 관리자에게 문의하세요.
        </p>
        <Link href="/" className={`${ui.btnPrimary} mt-6`}>
          홈으로 이동
        </Link>
      </div>
    </main>
  )
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const gate = await checkAdmin("/admin")

  if (gate.status === "forbidden") return <Forbidden />
  if (gate.status === "unavailable") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface px-4">
        <div className="w-full max-w-md">
          <ErrorState message="사용자 정보를 불러오지 못했습니다. 백엔드가 실행 중인지 확인하세요." retryHref="/admin" />
        </div>
      </main>
    )
  }

  // 사이드바의 "로그인 잠금" 배지 — 집계 실패는 배지만 숨긴다(콘솔은 연다).
  let lockedCount = 0
  try {
    lockedCount = (await getDashboard()).locked_accounts
  } catch {
    // 대시보드 화면이 같은 실패를 문구로 보여 준다.
  }

  return (
    <AdminShell username={gate.user.username} lockedCount={lockedCount}>
      {children}
    </AdminShell>
  )
}
