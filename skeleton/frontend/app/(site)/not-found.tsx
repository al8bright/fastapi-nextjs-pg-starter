import Link from "next/link"
import { ui } from "@/components/ui/styles"

// 404 — 사용자 레이아웃 안에서 보여 준다((site)/[...missing] 또는 화면의 notFound()).
export default function SiteNotFound() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-20 text-center sm:px-6">
      <p className="text-sm font-semibold tracking-wider text-primary">404</p>
      <h1 className="mt-2 text-2xl font-semibold">페이지를 찾을 수 없습니다</h1>
      <p className="mt-3 text-on-surface-variant">주소가 바뀌었거나 삭제된 페이지입니다.</p>
      <Link href="/" className={`${ui.btnPrimary} mt-6`}>
        홈으로 이동
      </Link>
    </div>
  )
}
