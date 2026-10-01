"use client"

import { usePathname } from "next/navigation"
import { type ReactNode, useEffect, useRef, useState } from "react"
import Icon from "@/components/ui/Icon"
import { ui } from "@/components/ui/styles"
import AdminSidebar from "./AdminSidebar"
import SkipLink from "./SkipLink"

// 관리자 콘솔 틀 (디자인 A — 그룹형 사이드바 콘솔). 클라이언트인 이유는 좁은 화면의 서랍 상태뿐이다 —
// 화면 본문(children)은 서버 컴포넌트 그대로 들어온다.
// ≥1024px: 248px 고정 사이드바 + 본문. 그보다 좁으면 상단 바의 "메뉴" 버튼이 사이드바를 위에서 펼친다.
export default function AdminShell({
  username,
  lockedCount,
  children,
}: {
  username: string
  lockedCount: number
  children: ReactNode
}) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const pathname = usePathname()
  const drawerRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)

  // 이동하면 서랍을 닫는다(렌더 중 비교 — effect 안 setState 대신).
  const [lastPath, setLastPath] = useState(pathname)
  if (lastPath !== pathname) {
    setLastPath(pathname)
    setDrawerOpen(false)
  }

  useEffect(() => {
    if (!drawerOpen) return
    drawerRef.current?.querySelector<HTMLElement>("a, button")?.focus()
    const toggle = toggleRef.current
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false)
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("keydown", onKey)
      toggle?.focus({ preventScroll: true })
    }
  }, [drawerOpen])

  return (
    <div className="min-h-screen bg-surface text-on-surface lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <SkipLink target="admin-main" />

      {/* 넓은 화면 — 고정 사이드바 */}
      <aside className="border-r border-surface-container-highest bg-surface-container-lowest max-lg:hidden">
        <div className="sticky top-0 h-screen overflow-y-auto">
          <AdminSidebar username={username} lockedCount={lockedCount} />
        </div>
      </aside>

      {/* 좁은 화면 — 상단 바 + 서랍 */}
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-surface-container-highest bg-surface-container-lowest px-2 lg:hidden">
        <button
          ref={toggleRef}
          type="button"
          aria-expanded={drawerOpen}
          aria-controls="admin-drawer"
          onClick={() => setDrawerOpen((v) => !v)}
          className={`${ui.btnSmall} gap-2 text-on-surface hover:bg-surface-container-low`}
        >
          <Icon name={drawerOpen ? "close" : "menu"} />
          {drawerOpen ? "메뉴 닫기" : "메뉴"}
        </button>
        <span className="pr-3 text-sm font-semibold">관리자 콘솔</span>
      </div>
      {drawerOpen && (
        <>
          <div className="fixed inset-0 top-14 z-20 bg-black/30 lg:hidden" aria-hidden="true" onClick={() => setDrawerOpen(false)} />
          <div
            id="admin-drawer"
            ref={drawerRef}
            className="fixed inset-x-0 top-14 z-30 max-h-[calc(100vh-3.5rem)] overflow-y-auto border-b border-surface-container-highest bg-surface-container-lowest shadow-[0_12px_40px_rgba(0,0,0,0.1)] lg:hidden"
          >
            <AdminSidebar username={username} lockedCount={lockedCount} />
          </div>
        </>
      )}

      <main id="admin-main" tabIndex={-1} className="min-w-0 px-4 py-6 outline-none sm:px-6 lg:px-10 lg:py-8">
        {children}
      </main>
    </div>
  )
}
