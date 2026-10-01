"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ui } from "@/components/ui/styles"

// 사용자 화면 주 메뉴 — 현재 메뉴 강조(aria-current)만 클라이언트에서 판정한다(usePathname).
// 좁은 화면(<768px)에서는 헤더의 두 번째 줄로 내려가 가로로 스크롤된다.

const NAV = [
  { href: "/", label: "홈", end: true },
  { href: "/notices", label: "공지사항", end: false },
  // 자리표시 메뉴 — 프로젝트에 맞게 실제 화면으로 바꾼다.
  { href: "/#services", label: "서비스", placeholder: true },
  { href: "/#support", label: "고객지원", placeholder: true },
] as const

function navClass(active: boolean) {
  return `flex min-h-11 shrink-0 items-center rounded-lg px-3.5 text-[15px] whitespace-nowrap ${ui.focusRing} ${
    active ? "bg-primary-fixed font-semibold text-primary" : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
  }`
}

/** end=true 면 정확히 같은 경로만, 아니면 하위 경로(/notices/3)까지 활성으로 본다. */
export function isActivePath(pathname: string, href: string, end: boolean): boolean {
  if (end) return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}

export default function MainNav() {
  const pathname = usePathname() ?? "/"
  return (
    <nav
      aria-label="주 메뉴"
      className="order-last -mx-1 flex w-full gap-1 overflow-x-auto px-1 pb-1 md:order-none md:w-auto md:flex-1 md:pb-0"
    >
      {NAV.map((item) => {
        const active = !("placeholder" in item) && isActivePath(pathname, item.href, item.end)
        return (
          <Link key={item.label} href={item.href} className={navClass(active)} aria-current={active ? "page" : undefined}>
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
