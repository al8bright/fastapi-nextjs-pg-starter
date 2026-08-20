import Link from "next/link"
import LogoutButton from "@/components/LogoutButton"
import { getSessionUser } from "@/lib/session"

// My 화면 (architecture.md §14). 로그인 사용자 정보 + 로그아웃.
// 토큰이 없거나 만료됐으면 getSessionUser 가 /login?next=/my 로 보낸다(여기까지 오지 않는다).
// user 가 null 이면 세션 문제가 아니라 백엔드 장애다 — 원인을 구분해서 보여준다.
export default async function MyPage() {
  const user = await getSessionUser("/my")

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm rounded-2xl border border-outline-variant bg-surface-container-lowest p-8">
        <h1 className="text-2xl font-bold text-on-surface">내 정보</h1>

        {user ? (
          <dl className="mt-4 space-y-3">
            <div className="flex justify-between border-b border-outline-variant pb-2">
              <dt className="text-on-surface-variant">아이디</dt>
              <dd className="font-medium text-on-surface">{user.username}</dd>
            </div>
            <div className="flex justify-between border-b border-outline-variant pb-2">
              <dt className="text-on-surface-variant">권한</dt>
              <dd className="font-medium text-on-surface">
                {user.role === "admin" ? "관리자" : "일반 사용자"}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-4 rounded-lg bg-error-container px-3 py-2 text-sm text-on-error-container">
            내 정보를 불러올 수 없습니다. 백엔드가 실행 중인지 확인하세요.
          </p>
        )}

        <LogoutButton />
        <Link
          href="/"
          className="mt-3 block text-center text-sm text-on-surface-variant hover:text-on-surface"
        >
          ← 메인으로
        </Link>
      </div>
    </main>
  )
}
