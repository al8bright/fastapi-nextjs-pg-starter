import Link from "next/link"
import type { ReactNode } from "react"
import AccountMenu from "@/components/layout/AccountMenu"
import MainNav from "@/components/layout/MainNav"
import SkipLink from "@/components/layout/SkipLink"
import { ui } from "@/components/ui/styles"
import { getOptionalUser } from "@/lib/session"
import { SITE_MARK, SITE_NAME } from "@/lib/site"

// 사용자 화면 레이아웃 (디자인 A — 상단 내비 포털). 로그인 없이 볼 수 있는 공개 화면의 틀이다.
// `(site)` 는 라우트 그룹이라 URL 에 나타나지 않는다 — 홈·공지·내 정보가 이 틀을 공유하고,
// 로그인(/login)과 관리자 콘솔(/admin)은 각자의 레이아웃을 쓴다.
//
// 헤더의 계정 메뉴에 쓸 사용자는 **서버가** /auth/me 로 읽는다(getOptionalUser — 비로그인·무효 토큰·
// 백엔드 장애는 모두 null = "로그인" 버튼). 브라우저는 토큰을 모른다(§14).
// 레이아웃은 클라이언트 이동 때 다시 렌더되지 않지만, 로그인·로그아웃은 쿠키를 바꾸는 Server Action 이라
// Next 가 레이아웃까지 다시 그린다.

export default async function SiteLayout({ children }: { children: ReactNode }) {
  const user = await getOptionalUser()

  return (
    <div className="flex min-h-screen flex-col bg-surface text-on-surface">
      <SkipLink target="main" />
      <header className="border-b border-surface-container-highest bg-surface-container-lowest">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-8 gap-y-1 px-4 py-2 sm:px-6 md:h-16 md:flex-nowrap md:py-0">
          <Link href="/" className={`flex min-h-11 items-center gap-2.5 rounded text-lg font-bold text-on-surface ${ui.focusRing}`}>
            <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm text-on-primary">
              {SITE_MARK}
            </span>
            {SITE_NAME}
          </Link>
          <MainNav />
          <div className="ml-auto md:ml-0">
            <AccountMenu user={user} />
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>

      <footer id="support" className="border-t border-surface-container-highest bg-surface-container-lowest">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-2 px-4 py-6 text-[13px] text-on-surface-variant sm:flex-row sm:justify-between sm:px-6">
          <span>© {SITE_NAME}</span>
          <span>이용약관 · 개인정보처리방침</span>
        </div>
      </footer>
    </div>
  )
}
