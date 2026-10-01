import { redirect } from "next/navigation"

// 관리자 콘솔 안의 없는 주소 → 대시보드로 (React 템플릿의 `/admin/*` → `/admin` 과 같은 동작).
export default function AdminFallback() {
  redirect("/admin")
}
