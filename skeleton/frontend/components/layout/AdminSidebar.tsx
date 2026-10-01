"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useId } from "react"
import Icon from "@/components/ui/Icon"
import { ui } from "@/components/ui/styles"
import { SITE_MARK } from "@/lib/site"
import { ADMIN_NAV, isAdminNavActive } from "./adminNav"

// 관리자 사이드바 — 그룹 라벨 + 메뉴, 현재 메뉴는 aria-current="page" + 강조 배경.
// 현재 메뉴 판정만 클라이언트(usePathname)에서 한다. "로그인 잠금" 의 잠긴 계정 수 배지와 사용자 이름은
// 관리자 레이아웃(서버)이 읽어 props 로 넘긴다.
export default function AdminSidebar({ username, lockedCount }: { username: string; lockedCount: number }) {
  const pathname = usePathname() ?? "/admin"
  // 넓은 화면 사이드바와 좁은 화면 서랍이 동시에 그려질 수 있어 id 가 겹치지 않게 접두사를 둔다.
  const idPrefix = useId()

  return (
    <div className="flex h-full flex-col gap-6 px-4 py-5">
      <Link href="/admin" className={`flex min-h-11 items-center gap-2.5 rounded px-2 text-base font-bold text-on-surface ${ui.focusRing}`}>
        <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm text-on-primary">
          {SITE_MARK}
        </span>
        관리자 콘솔
      </Link>

      <nav aria-label="관리자 메뉴" className="flex flex-col gap-4">
        {ADMIN_NAV.map((group, gi) => {
          const groupId = `${idPrefix}-group-${gi}`
          return (
            <div key={group.label} className="flex flex-col gap-0.5">
              <p id={groupId} className="px-3 pb-1.5 text-xs font-semibold tracking-wider text-outline">
                {group.label}
              </p>
              <ul aria-labelledby={groupId} className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const active = isAdminNavActive(pathname, item)
                  return (
                    <li key={item.to}>
                      <Link
                        href={item.to}
                        aria-current={active ? "page" : undefined}
                        className={`flex min-h-11 items-center gap-3 rounded-lg border-l-[3px] px-3 text-[15px] ${ui.focusRing} ${
                          active
                            ? "border-primary bg-primary-fixed font-semibold text-primary"
                            : "border-transparent text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
                        }`}
                      >
                        <Icon name={item.icon} />
                        <span className="flex-1">{item.label}</span>
                        {item.badge === "locked" && lockedCount > 0 && (
                          <span className="rounded-full bg-error-container px-2 py-0.5 text-xs font-semibold text-on-error-container">
                            {lockedCount}
                            <span className="sr-only">개 계정 잠김</span>
                          </span>
                        )}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-2 border-t border-surface-container-highest pt-4">
        <Link
          href="/"
          className={`flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-sm text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface ${ui.focusRing}`}
        >
          <Icon name="back" />
          사용자 화면으로
        </Link>
        <p className="px-3 py-2 text-[13px] text-on-surface-variant">{username} · 관리자</p>
      </div>
    </div>
  )
}
