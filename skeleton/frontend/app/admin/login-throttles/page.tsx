import RefreshButton from "@/components/admin/RefreshButton"
import ThrottlesTable from "@/components/admin/ThrottlesTable"
import PageHeader from "@/components/layout/PageHeader"
import { ErrorState } from "@/components/ui/QueryState"
import { listLoginThrottles } from "@/lib/server/admin"
import { loadForPage } from "@/lib/server/load"

// 로그인 잠금 — 잠긴 계정 우선, 최근 24시간 실패 기록(최대 200). 잠금 해제는 실패 기록을 지운다(멱등).
// 존재하지 않는 아이디도 기록된다(계정 존재 비노출 정책).

export const metadata = { title: "로그인 잠금" }

export default async function LoginThrottlesPage() {
  const result = await loadForPage("/admin/login-throttles", listLoginThrottles, "잠금 목록을 불러오지 못했습니다.")
  const lockedCount = result.ok ? result.data.filter((t) => t.is_locked).length : 0

  return (
    <>
      <PageHeader
        title="로그인 잠금"
        description={result.ok ? `잠김 ${lockedCount}건 · 최근 24시간 실패 기록 ${result.data.length}건` : "연속 로그인 실패 기록"}
        actions={<RefreshButton />}
      />
      {result.ok ? (
        <ThrottlesTable throttles={result.data} />
      ) : (
        <ErrorState message={result.error} retryHref="/admin/login-throttles" />
      )}
    </>
  )
}
