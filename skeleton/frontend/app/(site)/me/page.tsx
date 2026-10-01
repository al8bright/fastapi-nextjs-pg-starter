import Link from "next/link"
import LogoutButton from "@/components/LogoutButton"
import { ui } from "@/components/ui/styles"
import { getSessionUser } from "@/lib/session"

// 내 정보 화면 (ARCHITECTURE.md §14) — 사용자 레이아웃 안의 **보호** 화면(proxy 가 비로그인을 막는다).
// 토큰이 없거나 만료됐으면 getSessionUser 가 /login?next=/me 로 보낸다(여기까지 오지 않는다).
// user 가 null 이면 세션 문제가 아니라 백엔드 장애다 — 원인을 구분해서 보여준다.

export const metadata = { title: "내 정보" }

export default async function MePage() {
  const user = await getSessionUser("/me")

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <section className={`${ui.card} rounded-xl p-8`}>
        <h1 className="text-2xl font-semibold text-on-surface">내 정보</h1>

        {user ? (
          <dl className="mt-4 space-y-3">
            <div className="flex justify-between border-b border-outline-variant pb-2">
              <dt className="text-on-surface-variant">아이디</dt>
              <dd className="font-medium text-on-surface">{user.username}</dd>
            </div>
            <div className="flex justify-between border-b border-outline-variant pb-2">
              <dt className="text-on-surface-variant">권한</dt>
              <dd className="font-medium text-on-surface">{user.role === "admin" ? "관리자" : "일반 사용자"}</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-4 rounded-lg bg-error-container px-3 py-2 text-sm text-on-error-container">
            내 정보를 불러올 수 없습니다. 백엔드가 실행 중인지 확인하세요.
          </p>
        )}

        <div className="mt-6 flex flex-col gap-3">
          {user?.role === "admin" && (
            <Link href="/admin" className={ui.btnSecondary}>
              관리자 콘솔로 이동
            </Link>
          )}
          <LogoutButton />
        </div>
      </section>
    </div>
  )
}
