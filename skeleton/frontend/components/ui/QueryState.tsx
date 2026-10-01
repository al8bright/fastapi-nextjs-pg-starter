import Link from "next/link"
import type { ReactNode } from "react"
import { ui } from "./styles"

// 조회 상태 표시 — 로딩·오류·빈 목록. 오류는 role="alert" 로 즉시 읽히게 한다.
// 훅이 없어 서버 컴포넌트·클라이언트 컴포넌트 양쪽에서 쓴다. 함수 props(onRetry·onClose)는
// 클라이언트 컴포넌트에서만 넘길 수 있다 — 서버 화면은 retryHref(같은 화면 다시 열기)를 쓴다.

export function Loading({ label = "불러오는 중…" }: { label?: string }) {
  return (
    <p role="status" className="py-8 text-center text-sm text-on-surface-variant">
      {label}
    </p>
  )
}

export function ErrorState({
  message,
  onRetry,
  retryHref,
}: {
  message: string
  onRetry?: () => void
  /** 서버 컴포넌트용 — 이 주소로 다시 이동해 서버가 다시 조회하게 한다. */
  retryHref?: string
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-lg bg-error-container px-4 py-6 text-center text-sm text-on-error-container"
    >
      <p>{message}</p>
      {onRetry && (
        <button type="button" className={ui.btnNeutral} onClick={onRetry}>
          다시 시도
        </button>
      )}
      {!onRetry && retryHref && (
        <Link href={retryHref} className={ui.btnNeutral} prefetch={false}>
          다시 시도
        </Link>
      )}
    </div>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-outline-variant px-4 py-10 text-center text-sm text-on-surface-variant">
      {children}
    </div>
  )
}

/** 작업 결과 알림(성공·실패). 성공은 status, 실패는 alert. */
export function Notice({
  tone,
  children,
  onClose,
}: {
  tone: "success" | "error"
  children: ReactNode
  onClose?: () => void
}) {
  const color =
    tone === "success"
      ? "bg-tertiary-container text-on-tertiary-container"
      : "bg-error-container text-on-error-container"
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex items-start justify-between gap-3 rounded-lg px-4 py-3 text-sm ${color}`}
    >
      <p className="pt-0.5">{children}</p>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className={`${ui.btnSmall} -my-2 -mr-2 min-w-11 font-semibold`}
          aria-label="알림 닫기"
        >
          ×
        </button>
      )}
    </div>
  )
}
