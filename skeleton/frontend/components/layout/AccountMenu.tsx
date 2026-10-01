"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useId, useRef, useState, useTransition } from "react"
import Icon from "@/components/ui/Icon"
import { ui } from "@/components/ui/styles"
import { logoutAction } from "@/lib/actions/auth"
import type { User } from "@/lib/types"

// 상단 내비 오른쪽 — 비로그인: 로그인 버튼 / 로그인: 계정 메뉴(내 정보·로그아웃) + 관리자에게만 "관리자 콘솔".
// 사용자 정보는 서버(사용자 레이아웃)가 /auth/me 로 읽어 props 로 내려준다 — 이 컴포넌트는 토큰을 모른다.
// 메뉴는 디스클로저 패턴(button aria-expanded + 링크 목록). Esc·바깥 클릭·페이지 이동으로 닫는다.

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase()
}

export default function AccountMenu({ user }: { user: User | null }) {
  const pathname = usePathname() ?? "/"
  const [open, setOpen] = useState(false)
  const [loggingOut, startLogout] = useTransition()
  const menuId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // 페이지를 옮기면 메뉴를 닫는다(렌더 중 비교 — effect 안 setState 대신).
  const [lastPath, setLastPath] = useState(pathname)
  if (lastPath !== pathname) {
    setLastPath(pathname)
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener("pointerdown", onPointer)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onPointer)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  if (!user) {
    // 로그인 후 지금 보던 화면으로 돌아온다 — 로그인 화면이 next 를 safeRedirect 로 다시 검증한다.
    return (
      <Link href={`/login?next=${encodeURIComponent(pathname)}`} className={ui.btnSecondary}>
        로그인
      </Link>
    )
  }

  const isAdmin = user.role === "admin"
  const onLogout = () => {
    setOpen(false)
    // Server Action 이 refresh 폐기 + 쿠키 삭제 후 홈(/)으로 redirect 한다.
    startLogout(logoutAction)
  }

  return (
    <div className="flex items-center gap-2">
      {isAdmin && (
        <Link href="/admin" className={`${ui.btnSecondary} max-md:hidden`}>
          <Icon name="shield" size={16} />
          관리자 콘솔
        </Link>
      )}
      <div ref={rootRef} className="relative">
        <button
          ref={buttonRef}
          type="button"
          aria-expanded={open}
          aria-controls={menuId}
          aria-label={`내 계정 메뉴 (${user.username})`}
          onClick={() => setOpen((v) => !v)}
          className={`flex min-h-11 items-center gap-2 rounded-full border border-outline-variant bg-surface-container-lowest py-1.5 pr-3 pl-1.5 text-on-surface hover:bg-surface-container-low ${ui.focusRing}`}
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-tertiary text-xs font-semibold text-on-primary">
            {initials(user.username)}
          </span>
          <span className="max-w-28 truncate text-sm font-medium max-sm:hidden">{user.username}</span>
          <Icon name="chevronDown" size={16} className="text-on-surface-variant" />
        </button>
        {open && (
          <div
            id={menuId}
            className="absolute right-0 z-40 mt-2 w-56 rounded-xl border border-outline-variant bg-surface-container-lowest p-2 shadow-[0_12px_40px_rgba(0,0,0,0.1)]"
          >
            <p className="border-b border-surface-container px-3 pt-1 pb-2 text-sm text-on-surface-variant">
              <span className="font-semibold text-on-surface">{user.username}</span> · {isAdmin ? "관리자" : "일반 사용자"}
            </p>
            <ul className="mt-1 flex flex-col">
              {isAdmin && (
                <li>
                  <Link href="/admin" className={`flex min-h-11 items-center rounded px-3 text-sm hover:bg-surface-container-low ${ui.focusRing}`}>
                    관리자 콘솔
                  </Link>
                </li>
              )}
              <li>
                <Link href="/me" className={`flex min-h-11 items-center rounded px-3 text-sm hover:bg-surface-container-low ${ui.focusRing}`}>
                  내 정보
                </Link>
              </li>
              <li>
                <button
                  type="button"
                  onClick={onLogout}
                  disabled={loggingOut}
                  className={`flex min-h-11 w-full items-center rounded px-3 text-left text-sm text-error hover:bg-error-container disabled:opacity-60 ${ui.focusRing}`}
                >
                  {loggingOut ? "로그아웃 중…" : "로그아웃"}
                </button>
              </li>
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
