import Link from "next/link"
import { type ReactNode, Suspense } from "react"
import BannerCarousel from "@/components/BannerCarousel"
import HomeHero from "@/components/HomeHero"
import Icon from "@/components/ui/Icon"
import { ui } from "@/components/ui/styles"
import { formatDate } from "@/lib/format"
import { listPublicBanners } from "@/lib/server/banners"
import { listPublicNotices } from "@/lib/server/notices"
import { getOptionalUser } from "@/lib/session"
import { SITE_NAME } from "@/lib/site"
import type { BannerPublic, NoticeListItem, Page } from "@/lib/types"

// 공개 첫 화면 (디자인 A). 배너(없으면 히어로) → 주요 서비스 → 최신 공지 5건 + 내 계정.
// 서버 컴포넌트다 — 배너·공지·사용자를 서버가 FastAPI 에서 읽어 완성된 HTML 로 내려보낸다.
// 공지·계정 상자는 <Suspense> 로 떼어 배너·서비스 영역부터 스트리밍된다(클라이언트 로딩 상태 없음).
// 로그인 없이 열린다 — proxy.ts 의 isPublicPath 가 통과시킨다.

// 자리표시 서비스 카드 — 프로젝트에 맞게 바꾼다.
const SERVICES = [
  { title: "[서비스 1]", body: "[서비스 1 설명 — 한두 문장]" },
  { title: "[서비스 2]", body: "[서비스 2 설명 — 한두 문장]" },
  { title: "[서비스 3]", body: "[서비스 3 설명 — 한두 문장]" },
]

async function Banners() {
  let banners: BannerPublic[] = []
  try {
    banners = await listPublicBanners()
  } catch {
    // 배너 조회 실패는 첫 화면을 막지 않는다 — 기본 히어로로 대신한다.
  }
  if (!banners.length) return <HomeHero />
  return (
    <div className="mx-auto max-w-[1200px] px-4 pt-6 sm:px-6">
      <h1 className="sr-only">{SITE_NAME}</h1>
      <BannerCarousel banners={banners} />
    </div>
  )
}

function NoticesBox({ children }: { children: ReactNode }) {
  return (
    <section aria-labelledby="home-notices" className={`${ui.card} flex flex-col gap-3 rounded-xl p-6`}>
      <div className="flex items-center justify-between">
        <h2 id="home-notices" className="text-lg font-semibold">
          공지사항
        </h2>
        <Link href="/notices" className={`${ui.link} text-sm font-medium`}>
          전체 보기
        </Link>
      </div>
      {children}
    </section>
  )
}

async function LatestNotices() {
  let data: Page<NoticeListItem> | null = null
  try {
    data = await listPublicNotices({ page: 1, size: 5 })
  } catch {
    // 아래에서 안내 문구로 대신한다.
  }
  if (!data) return <p className="py-3 text-sm text-on-surface-variant">공지사항을 불러오지 못했습니다.</p>
  if (data.items.length === 0) return <p className="py-3 text-sm text-on-surface-variant">등록된 공지사항이 없습니다.</p>
  return (
    <ul>
      {data.items.map((n) => (
        <li key={n.id} className="border-t border-surface-container">
          {/* prefetch={false}: 상세 조회는 서버가 조회수를 올린다 — 미리 가져오기가 조회수를 부풀리지 않게 한다. */}
          <Link
            href={`/notices/${n.id}`}
            prefetch={false}
            className={`flex min-h-11 items-center justify-between gap-4 py-3 text-[15px] text-on-surface hover:text-primary ${ui.focusRing}`}
          >
            <span className="flex min-w-0 items-center gap-2">
              {n.is_pinned && <span className="shrink-0 text-xs font-semibold text-primary">[고정]</span>}
              <span className="truncate">{n.title}</span>
            </span>
            <span className="shrink-0 text-sm text-on-surface-variant">{formatDate(n.published_at)}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

async function AccountBox() {
  const user = await getOptionalUser()
  return (
    <section aria-labelledby="home-account" className={`${ui.card} flex flex-col gap-4 rounded-xl p-6`}>
      <h2 id="home-account" className="text-lg font-semibold">
        내 계정
      </h2>
      {user ? (
        <>
          <p className="text-[15px] text-on-surface-variant">
            {user.username} 님으로 로그인되어 있습니다. 권한:{" "}
            <strong className="text-primary">{user.role === "admin" ? "관리자" : "일반 사용자"}</strong>
          </p>
          <div className="flex flex-wrap gap-3">
            {user.role === "admin" && (
              <Link href="/admin" className={ui.btnPrimary}>
                관리자 콘솔로 이동
              </Link>
            )}
            <Link href="/me" className={ui.btnNeutral}>
              내 정보
            </Link>
          </div>
        </>
      ) : (
        <>
          <p className="text-[15px] text-on-surface-variant">로그인하면 내 정보와 계정 기능을 이용할 수 있습니다.</p>
          <div>
            <Link href="/login?next=%2F" className={ui.btnPrimary}>
              로그인
            </Link>
          </div>
        </>
      )}
    </section>
  )
}

export default function HomePage() {
  return (
    <>
      {/* 첫 로딩 동안은 같은 높이의 자리만 잡는다(히어로 → 배너로 번쩍 바뀌지 않게). */}
      <Suspense fallback={<div className="h-[420px] bg-surface-container-low" aria-hidden="true" />}>
        <Banners />
      </Suspense>

      <section
        id="services"
        aria-labelledby="home-services"
        className="mx-auto flex max-w-[1200px] scroll-mt-4 flex-col gap-6 px-4 py-12 sm:px-6"
      >
        <div className="flex items-end justify-between">
          <h2 id="home-services" className="text-2xl font-semibold">
            주요 서비스
          </h2>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {SERVICES.map((card) => (
            <article key={card.title} className={`${ui.card} flex flex-col gap-3 rounded-xl p-6`}>
              <span className="flex size-10 items-center justify-center rounded-[10px] bg-primary-fixed text-primary">
                <Icon name="card" size={20} />
              </span>
              <h3 className="text-lg font-semibold">{card.title}</h3>
              <p className="text-[15px] leading-6 text-on-surface-variant">{card.body}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="mx-auto grid max-w-[1200px] gap-5 px-4 pb-14 sm:px-6 md:grid-cols-2">
        <NoticesBox>
          <Suspense fallback={<p className="py-3 text-sm text-on-surface-variant">불러오는 중…</p>}>
            <LatestNotices />
          </Suspense>
        </NoticesBox>
        <AccountBox />
      </div>
    </>
  )
}
