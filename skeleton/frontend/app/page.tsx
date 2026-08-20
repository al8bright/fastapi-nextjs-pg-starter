import Link from "next/link"
import { getSessionUser } from "@/lib/session"

// 메인 화면 (로그인 후 홈). 랜딩(시스템 상태) / My 로 이동.
// 서버 컴포넌트다 — 훅도, 로딩 상태도 없다. 사용자 정보를 await 한 뒤 완성된 HTML 을 내려보낸다.
export default async function MainPage() {
  const user = await getSessionUser("/")

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-surface px-4">
      <div className="w-full max-w-md text-center">
        <span className="inline-block rounded-full bg-primary px-4 py-1 text-sm font-semibold text-on-primary">
          __PROJECT_NAME__
        </span>
        <h1 className="mt-4 text-3xl font-bold text-on-surface">
          {user ? `${user.username} 님, 환영합니다 👋` : "환영합니다 👋"}
        </h1>
        <p className="mt-2 text-on-surface-variant">메인 화면입니다. 아래에서 이동하세요.</p>

        <div className="mt-8 grid gap-3">
          <Link
            href="/landing"
            className="rounded-lg border border-outline-variant bg-surface-container-lowest px-5 py-4 text-left font-semibold text-on-surface hover:border-primary"
          >
            시스템 상태(랜딩) →
            <span className="block text-sm font-normal text-on-surface-variant">
              백엔드 / DB 연결 상태 확인
            </span>
          </Link>
          <Link
            href="/my"
            className="rounded-lg border border-outline-variant bg-surface-container-lowest px-5 py-4 text-left font-semibold text-on-surface hover:border-primary"
          >
            My →
            <span className="block text-sm font-normal text-on-surface-variant">
              내 정보 / 로그아웃
            </span>
          </Link>
        </div>
      </div>
    </main>
  )
}
