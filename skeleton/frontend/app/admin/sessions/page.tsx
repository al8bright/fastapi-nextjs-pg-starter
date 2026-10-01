import Link from "next/link"
import SessionsTable from "@/components/admin/SessionsTable"
import PageHeader from "@/components/layout/PageHeader"
import Pagination from "@/components/ui/Pagination"
import { ErrorState } from "@/components/ui/QueryState"
import { ui } from "@/components/ui/styles"
import { formatNumber } from "@/lib/format"
import { listHref, parseIdParam, parsePage, type SearchParams } from "@/lib/listParams"
import { listSessions } from "@/lib/server/admin"
import { loadForPage } from "@/lib/server/load"

// 활성 세션 — 최근 사용순, 페이지, 사용자 필터(?user_id= — 사용자 화면의 세션 수 링크), 강제 종료.
const PAGE_SIZE = 20

export const metadata = { title: "세션" }

export default async function SessionsAdminPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const page = parsePage(params)
  const userId = parseIdParam(params, "user_id")
  const current = listHref("/admin/sessions", { user_id: userId, page })
  const result = await loadForPage(
    current,
    () => listSessions({ page, size: PAGE_SIZE, user_id: userId }),
    "세션 목록을 불러오지 못했습니다.",
  )
  const filteredName = userId ? (result.ok && result.data.items[0]?.username) || `#${userId}` : null

  return (
    <>
      <PageHeader
        title="세션"
        description={result.ok ? `활성 세션 ${formatNumber(result.data.total)}개 · 최근 사용순` : "만료·폐기 전 로그인 세션"}
      />
      <div className="flex flex-col gap-4">
        {userId && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg bg-primary-fixed px-4 py-2 text-sm text-on-primary-fixed">
            <span>
              사용자 <strong>{filteredName}</strong> 의 세션만 보는 중
            </span>
            <Link href="/admin/sessions" className={`${ui.btnSmall} font-semibold underline`}>
              필터 해제
            </Link>
          </div>
        )}
        {result.ok ? (
          <>
            <SessionsTable sessions={result.data.items} />
            <Pagination
              page={page}
              size={PAGE_SIZE}
              total={result.data.total}
              basePath="/admin/sessions"
              params={{ user_id: userId }}
            />
          </>
        ) : (
          <ErrorState message={result.error} retryHref={current} />
        )}
      </div>
    </>
  )
}
