import Link from "next/link"
import { ui } from "@/components/ui/styles"

// 루트 404 — 사용자 레이아웃 밖(로그인 등)에서 일치하는 라우트가 없을 때. 사용자 화면은 (site)/not-found.tsx 가 맡는다.
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className={`${ui.card} w-full max-w-md p-8 text-center`}>
        <p className="text-sm font-semibold tracking-wider text-primary">404</p>
        <h1 className="mt-2 text-2xl font-semibold text-on-surface">페이지를 찾을 수 없습니다</h1>
        <p className="mt-3 text-on-surface-variant">주소가 바뀌었거나 삭제된 페이지입니다.</p>
        <Link href="/" className={`${ui.btnPrimary} mt-6`}>
          홈으로 이동
        </Link>
      </div>
    </main>
  )
}
