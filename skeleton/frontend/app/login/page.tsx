import { redirect } from "next/navigation"
import LoginForm from "@/components/LoginForm"
import { safeRedirect } from "@/lib/safe-redirect"
import { getSessionToken } from "@/lib/session"

// 로그인 화면 (architecture.md §14).
// 서버 컴포넌트(껍데기) + LoginForm(클라이언트) 조합이다. 폼만 클라이언트인 이유는
// useActionState 로 오류 문구·대기 상태를 다뤄야 하기 때문이다.
//
// ⚠️ middleware 의 matcher 가 /login 을 제외하고 있어야 이 화면에 도달할 수 있다.

// searchParams 는 Next 15+ 에서 **Promise** 다 — await 없이 프로퍼티를 읽으면 undefined 가 나온다.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const raw = params.next
  // 배열로 올 수 있다 (?next=/a&next=/b). 첫 값만 쓰고, 반드시 내부 경로인지 검증한다.
  const next = safeRedirect(Array.isArray(raw) ? raw[0] : raw)

  // 이미 세션이 있으면 목적지로 (React 판의 `if (isAuthenticated) return <Navigate to={from} />`).
  if (await getSessionToken()) redirect(next)

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4">
      <LoginForm next={next} />
    </main>
  )
}
