import Link from "next/link"
import PageHeader from "@/components/layout/PageHeader"
import Chip from "@/components/ui/Chip"
import Icon from "@/components/ui/Icon"
import Pagination from "@/components/ui/Pagination"
import { EmptyState, ErrorState } from "@/components/ui/QueryState"
import SearchForm from "@/components/ui/SearchForm"
import { ui } from "@/components/ui/styles"
import { formatDate, formatDateTime, formatNumber } from "@/lib/format"
import { listHref, parsePage, parseQuery, type SearchParams } from "@/lib/listParams"
import { loadForPage } from "@/lib/server/load"
import { listAdminNotices } from "@/lib/server/notices"

// 관리자 공지 목록 — 임시저장 포함, 제목 검색·페이지(URL), 게시 상태·고정·첨부 표시. 서버 컴포넌트.
const PAGE_SIZE = 20

export const metadata = { title: "공지사항" }

export default async function NoticesAdminPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const page = parsePage(params)
  const q = parseQuery(params)
  const current = listHref("/admin/notices", { q, page })
  const result = await loadForPage(current, () => listAdminNotices({ page, size: PAGE_SIZE, q }), "공지 목록을 불러오지 못했습니다.")
  const data = result.ok ? result.data : null

  return (
    <>
      <PageHeader
        title="공지사항"
        description={data ? `${q ? `“${q}” 검색 결과 ` : "전체 "}${formatNumber(data.total)}건` : "공지 작성·게시 관리"}
        actions={
          <Link href="/admin/notices/new" className={ui.btnPrimary}>
            새 공지
          </Link>
        }
      />
      <div className="mb-4">
        <SearchForm label="공지 제목 검색" action="/admin/notices" initial={q} />
      </div>

      {!result.ok && <ErrorState message={result.error} retryHref={current} />}
      {data && data.items.length === 0 && (
        <EmptyState>{q ? "검색 결과가 없습니다." : "아직 작성한 공지가 없습니다. ‘새 공지’로 시작하세요."}</EmptyState>
      )}
      {data && data.items.length > 0 && (
        <div className={`${ui.card} overflow-x-auto`}>
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr>
                <th scope="col" className={ui.th}>
                  제목
                </th>
                <th scope="col" className={ui.th}>
                  상태
                </th>
                <th scope="col" className={ui.th}>
                  게시일
                </th>
                <th scope="col" className={`${ui.th} text-right`}>
                  조회
                </th>
                <th scope="col" className={ui.th}>
                  작성자
                </th>
                <th scope="col" className={ui.th}>
                  수정
                </th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((n) => (
                <tr key={n.id} className="hover:bg-surface-container-low">
                  <td className={ui.td}>
                    <span className="flex items-center gap-2">
                      {n.is_pinned && <Chip tone="primary">고정</Chip>}
                      <Link href={`/admin/notices/${n.id}/edit`} className={`${ui.link} font-medium text-on-surface`}>
                        {n.title}
                      </Link>
                      {n.has_attachments && (
                        <span className="text-on-surface-variant" title="첨부 파일 있음">
                          <Icon name="clip" size={16} />
                          <span className="sr-only">(첨부 파일 있음)</span>
                        </span>
                      )}
                    </span>
                  </td>
                  <td className={ui.td}>{n.is_published ? <Chip tone="success">게시</Chip> : <Chip>임시저장</Chip>}</td>
                  <td className={`${ui.td} text-on-surface-variant`}>{formatDate(n.published_at)}</td>
                  <td className={`${ui.td} text-right text-on-surface-variant`}>{formatNumber(n.view_count)}</td>
                  <td className={`${ui.td} text-on-surface-variant`}>{n.author_username ?? "-"}</td>
                  <td className={`${ui.td} whitespace-nowrap text-on-surface-variant`}>{formatDateTime(n.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && (
        <div className="mt-6">
          <Pagination page={page} size={PAGE_SIZE} total={data.total} basePath="/admin/notices" params={{ q }} />
        </div>
      )}
    </>
  )
}
