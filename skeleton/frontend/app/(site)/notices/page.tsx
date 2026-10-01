import Link from "next/link"
import { RememberNoticeList } from "@/components/NoticeListReturn"
import Chip from "@/components/ui/Chip"
import Icon from "@/components/ui/Icon"
import Pagination from "@/components/ui/Pagination"
import { EmptyState, ErrorState } from "@/components/ui/QueryState"
import SearchForm from "@/components/ui/SearchForm"
import { ui } from "@/components/ui/styles"
import { formatDate, formatNumber } from "@/lib/format"
import { listHref, parsePage, parseQuery, type SearchParams } from "@/lib/listParams"
import { listPublicNotices } from "@/lib/server/notices"
import type { NoticeListItem, Page } from "@/lib/types"

// 공개 공지 목록 — 고정 공지 우선, 제목 검색, 페이지 이동(page·q 는 URL 에). 로그인 없이 열린다.
// 서버 컴포넌트 — searchParams(Promise)를 await 해 백엔드를 직접 조회한다.
const PAGE_SIZE = 10

export const metadata = { title: "공지사항" }

export default async function NoticesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const page = parsePage(params)
  const q = parseQuery(params)

  let data: Page<NoticeListItem> | null = null
  try {
    data = await listPublicNotices({ page, size: PAGE_SIZE, q })
  } catch {
    // 아래 ErrorState 로 안내한다.
  }
  const current = listHref("/notices", { q, page })

  return (
    <div className="mx-auto max-w-[960px] px-4 py-10 sm:px-6">
      <RememberNoticeList search={current.slice("/notices".length)} />
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[32px] sm:leading-10">공지사항</h1>
          {data && (
            <p className="mt-1 text-sm text-on-surface-variant" aria-live="polite">
              {q ? `“${q}” 검색 결과 ` : "전체 "}
              {formatNumber(data.total)}건
            </p>
          )}
        </div>
        <SearchForm label="공지 제목 검색" action="/notices" initial={q} />
      </div>

      {!data && <ErrorState message="공지사항을 불러오지 못했습니다." retryHref={current} />}
      {data && data.items.length === 0 && (
        <EmptyState>{q ? "검색 결과가 없습니다." : "등록된 공지사항이 없습니다."}</EmptyState>
      )}
      {data && data.items.length > 0 && (
        <ul className={`${ui.card} divide-y divide-surface-container`}>
          {data.items.map((n) => (
            <li key={n.id} className={n.is_pinned ? "bg-surface-container-low" : undefined}>
              {/* prefetch={false}: 상세 조회는 서버가 조회수를 올린다 — 미리 가져오기로 부풀리지 않는다. */}
              <Link
                href={`/notices/${n.id}`}
                prefetch={false}
                className={`flex min-h-14 flex-col gap-1 px-4 py-3 hover:bg-surface-container-low sm:flex-row sm:items-center sm:gap-4 sm:px-5 ${ui.focusRing} focus-visible:ring-inset`}
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  {n.is_pinned && <Chip tone="primary">고정</Chip>}
                  <span className="truncate font-medium text-on-surface">{n.title}</span>
                  {n.has_attachments && (
                    <span className="text-on-surface-variant" title="첨부 파일 있음">
                      <Icon name="clip" size={16} />
                      <span className="sr-only">(첨부 파일 있음)</span>
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 gap-3 text-sm text-on-surface-variant">
                  <span>{formatDate(n.published_at)}</span>
                  <span>조회 {formatNumber(n.view_count)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {data && (
        <div className="mt-6">
          <Pagination page={page} size={PAGE_SIZE} total={data.total} basePath="/notices" params={{ q }} />
        </div>
      )}
    </div>
  )
}
