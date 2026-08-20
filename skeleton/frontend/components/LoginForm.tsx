"use client"

import { useActionState } from "react"
import { loginAction, type LoginState } from "@/lib/actions/auth"

// 로그인 폼 (architecture.md §14). React SPA 판 LoginPage 의 <form> 부분과 마크업이 동일하다.
// 달라진 것은 제출 경로뿐이다:
//   React : useState 로 값 보관 → axios.post → localStorage 저장 → navigate
//   Next  : 브라우저가 FormData 를 Server Action 으로 보냄 → 서버가 FastAPI 호출 → httpOnly 쿠키 → redirect
//
// 그래서 입력값을 useState 로 붙들 이유가 없다(비제어 입력 + name 속성).
// JS 가 아직 로드되지 않았어도 폼이 그대로 제출된다.

const INITIAL_STATE: LoginState = { error: null }

export default function LoginForm({ next }: { next: string }) {
  // useActionState 는 [상태, action, 대기중] 을 준다 — React 판의 mutation.isError/isPending 대응.
  const [state, formAction, isPending] = useActionState(loginAction, INITIAL_STATE)

  return (
    <form
      action={formAction}
      className="w-full max-w-sm rounded-2xl border border-outline-variant bg-surface-container-lowest p-8 shadow-sm"
    >
      {/* 복귀 목적지. 서버에서 이미 safeRedirect 로 걸렀지만, Action 쪽에서 한 번 더 검증한다
          (hidden 필드는 브라우저에서 얼마든지 바꿀 수 있다). */}
      <input type="hidden" name="next" value={next} />

      <span className="inline-block rounded-full bg-primary px-4 py-1 text-sm font-semibold text-on-primary">
        __PROJECT_NAME__
      </span>
      <h1 className="mt-4 text-2xl font-bold text-on-surface">로그인</h1>
      <p className="mt-1 text-sm text-on-surface-variant">계정으로 로그인하세요.</p>

      <label className="mt-6 block text-sm font-medium text-on-surface" htmlFor="username">
        아이디
      </label>
      <input
        id="username"
        name="username"
        className="mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-on-surface outline-none focus:border-primary"
        autoComplete="username"
        autoFocus
      />

      <label className="mt-4 block text-sm font-medium text-on-surface" htmlFor="password">
        비밀번호
      </label>
      <input
        id="password"
        name="password"
        type="password"
        className="mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-on-surface outline-none focus:border-primary"
        autoComplete="current-password"
      />

      {state.error && (
        <p
          role="alert"
          className="mt-3 rounded-lg bg-error-container px-3 py-2 text-sm text-on-error-container"
        >
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="mt-6 w-full rounded-lg bg-primary py-2.5 font-semibold text-on-primary disabled:opacity-60"
      >
        {isPending ? "로그인 중…" : "로그인"}
      </button>

      <p className="mt-4 text-center text-xs text-on-surface-variant">
        기본 관리자 계정: <code className="font-mono">admin / admin123</code>
      </p>
    </form>
  )
}
