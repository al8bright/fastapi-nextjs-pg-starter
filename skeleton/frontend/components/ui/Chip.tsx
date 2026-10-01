import type { ReactNode } from "react"

// 상태 칩 (DESIGN.md Status Chips) — 배경과 글자 대비가 큰 토큰 쌍만 쓴다.
export type ChipTone = "primary" | "success" | "danger" | "neutral"

const TONES: Record<ChipTone, string> = {
  primary: "bg-primary-fixed text-on-primary-fixed",
  success: "bg-tertiary-container text-on-tertiary-container",
  danger: "bg-error-container text-on-error-container",
  neutral: "bg-surface-container-high text-on-surface-variant",
}

export default function Chip({ tone = "neutral", children }: { tone?: ChipTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${TONES[tone]}`}
    >
      {children}
    </span>
  )
}
