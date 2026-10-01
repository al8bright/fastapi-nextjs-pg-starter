import type { IconName } from "@/components/ui/Icon"

// 관리자 콘솔 사이드바 메뉴 (디자인 A — 그룹형 사이드바). 메뉴를 추가하면 여기와 app/admin/<경로>/page.tsx 를 함께 만든다.
// 순수 모듈 — 활성 판정(isAdminNavActive)은 Vitest 로 고정한다.
export interface AdminNavItem {
  to: string
  label: string
  icon: IconName
  /** 하위 경로(/admin/notices/3/edit)에서도 활성으로 볼지. 대시보드(/admin)만 false. */
  end?: boolean
  /** 배지 종류 — 잠긴 계정 수. */
  badge?: "locked"
}

export interface AdminNavGroup {
  label: string
  items: AdminNavItem[]
}

export const ADMIN_NAV: AdminNavGroup[] = [
  { label: "개요", items: [{ to: "/admin", label: "대시보드", icon: "dashboard", end: true }] },
  {
    label: "콘텐츠",
    items: [
      { to: "/admin/notices", label: "공지사항", icon: "notice" },
      { to: "/admin/banners", label: "배너", icon: "banner" },
    ],
  },
  {
    label: "회원·보안",
    items: [
      { to: "/admin/users", label: "사용자", icon: "users" },
      { to: "/admin/sessions", label: "세션", icon: "session" },
      { to: "/admin/login-throttles", label: "로그인 잠금", icon: "lock", badge: "locked" },
    ],
  },
  { label: "시스템", items: [{ to: "/admin/system", label: "시스템 상태", icon: "system" }] },
]

/**
 * 메뉴 활성 여부 — end 면 정확히 같은 경로만(대시보드 /admin), 아니면 하위 경로까지
 * (/admin/notices/3/edit 에서도 "공지사항" 이 활성). `/admin/notices-x` 같은 접두사 겹침은 활성이 아니다.
 */
export function isAdminNavActive(pathname: string, item: Pick<AdminNavItem, "to" | "end">): boolean {
  if (item.end) return pathname === item.to
  return pathname === item.to || pathname.startsWith(`${item.to}/`)
}
