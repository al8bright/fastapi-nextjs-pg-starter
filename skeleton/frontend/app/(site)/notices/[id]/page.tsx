import { NoticeBackLink } from "@/components/NoticeListReturn"
import RichContent from "@/components/RichContent"
import Chip from "@/components/ui/Chip"
import Icon from "@/components/ui/Icon"
import { ErrorState } from "@/components/ui/QueryState"
import { ui } from "@/components/ui/styles"
import { formatBytes, formatDate, formatNumber } from "@/lib/format"
import { getPublicNotice } from "@/lib/server/notices"
import type { NoticeDetail } from "@/lib/types"

// 공개 공지 상세 — 제목·게시일·조회수, 서버가 정화한 본문(RichContent), 첨부 다운로드, 목록으로.
// 서버가 상세를 조회할 때마다 조회수가 오른다 — 목록·홈의 링크는 prefetch={false} 다.
//
// 본문의 이미지(/uploads/...)와 첨부 다운로드 URL(/api/v1/notices/<id>/attachments/<aid>)은 루트 상대 경로다.
// next.config.ts 의 rewrite 가 같은 오리진에서 백엔드로 넘긴다 — 브라우저는 백엔드 주소를 모른다.
// 본문의 유튜브 iframe 은 CSP frame-src(youtube-nocookie·youtube)로 허용된다.

function NotFoundNotice() {
  return (
    <div className="mx-auto max-w-[960px] px-4 py-16 text-center sm:px-6">
      <h1 className="text-2xl font-semibold">공지사항을 찾을 수 없습니다</h1>
      <p className="mt-3 text-on-surface-variant">삭제되었거나 게시가 중단된 공지입니다.</p>
      <div className="mt-6">
        <NoticeBackLink />
      </div>
    </div>
  )
}

export default async function NoticeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const noticeId = Number(id)
  if (!Number.isInteger(noticeId) || noticeId <= 0) return <NotFoundNotice />

  let notice: NoticeDetail | null
  try {
    notice = await getPublicNotice(noticeId)
  } catch {
    return (
      <div className="mx-auto max-w-[960px] px-4 py-10 sm:px-6">
        <ErrorState message="공지사항을 불러오지 못했습니다." retryHref={`/notices/${noticeId}`} />
        <div className="mt-6">
          <NoticeBackLink />
        </div>
      </div>
    )
  }
  if (!notice) return <NotFoundNotice />

  return (
    <div className="mx-auto max-w-[960px] px-4 py-10 sm:px-6">
      <article className={`${ui.card} rounded-xl`}>
        <header className="border-b border-surface-container px-5 py-6 sm:px-8">
          {notice.is_pinned && (
            <div className="mb-2">
              <Chip tone="primary">고정</Chip>
            </div>
          )}
          <h1 className="text-2xl leading-8 font-semibold tracking-tight break-words">{notice.title}</h1>
          <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-on-surface-variant">
            <div className="flex gap-1.5">
              <dt>게시일</dt>
              <dd className="text-on-surface">{formatDate(notice.published_at)}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt>조회수</dt>
              <dd className="text-on-surface">{formatNumber(notice.view_count)}</dd>
            </div>
          </dl>
        </header>

        <RichContent html={notice.body_html} className="px-5 py-8 sm:px-8" />

        {notice.attachments.length > 0 && (
          <section aria-labelledby="notice-attachments" className="border-t border-surface-container px-5 py-6 sm:px-8">
            <h2 id="notice-attachments" className="text-base font-semibold">
              첨부 파일 <span className="text-on-surface-variant">({notice.attachments.length})</span>
            </h2>
            <ul className="mt-3 flex flex-col gap-2">
              {notice.attachments.map((a) => (
                <li key={a.id}>
                  {/* 일반 <a> — 파일 다운로드라 클라이언트 라우팅(next/link)을 타면 안 된다. */}
                  <a
                    href={a.download_url}
                    download={a.original_name}
                    className={`flex min-h-11 items-center gap-3 rounded-lg border border-outline-variant px-3 py-2 text-sm hover:bg-surface-container-low ${ui.focusRing}`}
                  >
                    <Icon name="download" size={16} className="text-primary" />
                    <span className="min-w-0 flex-1 truncate font-medium">{a.original_name}</span>
                    <span className="shrink-0 text-on-surface-variant">{formatBytes(a.size_bytes)}</span>
                    <span className="sr-only">다운로드</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
      <div className="mt-6">
        <NoticeBackLink />
      </div>
    </div>
  )
}
