"use client"

import { ui } from "@/components/ui/styles"

// 렌더 실패 시 화면 (오류 경계, ARCHITECTURE.md §13). 서버 컴포넌트가 예상하지 못한 예외를 던졌거나
// 배포 직후 옛 청크를 못 찾는 경우 등. 오류 내용은 화면에 그대로 찍지 않는다(digest 만 — 서버 로그와 대조용).
// ⚠️ 오류 경계는 클라이언트 컴포넌트여야 한다("use client").
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div role="alert" className={`${ui.card} w-full max-w-md p-8 text-center`}>
        <h1 className="text-2xl font-semibold text-on-surface">화면을 표시하지 못했습니다</h1>
        <p className="mt-3 text-on-surface-variant">
          일시적인 문제일 수 있습니다. 새로고침한 뒤에도 같으면 관리자에게 알려 주세요.
          {error.digest && <span className="mt-1 block text-sm">(오류 코드 {error.digest})</span>}
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <button type="button" className={ui.btnPrimary} onClick={() => reset()}>
            다시 시도
          </button>
          {/* 오류 경계 안에서는 클라이언트 라우터 상태를 믿을 수 없어 문서 이동으로 홈에 간다. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" className={ui.btnNeutral}>
            홈으로
          </a>
        </div>
      </div>
    </main>
  )
}
