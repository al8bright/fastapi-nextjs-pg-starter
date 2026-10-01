"use client"

import { useState, useTransition } from "react"
import Chip from "@/components/ui/Chip"
import { EmptyState, Notice } from "@/components/ui/QueryState"
import { ui } from "@/components/ui/styles"
import { unlockThrottleAction } from "@/lib/actions/admin"
import { formatDateTime } from "@/lib/format"
import type { LoginThrottle } from "@/lib/types"

// 로그인 잠금 — 잠긴 계정만 카드 목록(대시보드, variant="locked") 또는 전체 표(로그인 잠금 화면, "table").
// 잠금 해제는 실패 기록을 지운다(멱등 Server Action). 존재하지 않는 아이디도 기록된다(계정 존재 비노출 정책).
export default function ThrottlesTable({
  throttles,
  variant = "table",
}: {
  throttles: LoginThrottle[]
  variant?: "table" | "locked"
}) {
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const onUnlock = (username: string, locked: boolean) => {
    setBusy(username)
    startTransition(async () => {
      const result = await unlockThrottleAction(username)
      setMessage(
        result.ok
          ? { tone: "success", text: locked ? `${username} 의 잠금을 해제했습니다.` : `${username} 의 실패 기록을 지웠습니다.` }
          : { tone: "error", text: result.error },
      )
      setBusy(null)
    })
  }

  const notice = message && (
    <Notice tone={message.tone} onClose={() => setMessage(null)}>
      {message.text}
    </Notice>
  )

  if (variant === "locked") {
    const locked = throttles.filter((t) => t.is_locked)
    return (
      <div className="flex flex-col gap-3">
        {notice}
        {locked.length === 0 ? (
          <EmptyState>잠긴 계정이 없습니다.</EmptyState>
        ) : (
          <ul className="flex flex-col gap-2">
            {locked.map((t) => (
              <li key={t.username} className="flex items-center gap-3 rounded-[10px] bg-error-container p-3 text-on-error-container">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-semibold">{t.username}</span>
                  <span className="text-xs">
                    실패 {t.failed_count}회 · {formatDateTime(t.locked_until)}까지
                  </span>
                </div>
                <button
                  type="button"
                  className={`${ui.btnSmall} bg-surface-container-lowest font-semibold text-on-error-container`}
                  disabled={busy === t.username}
                  onClick={() => onUnlock(t.username, true)}
                >
                  잠금 해제<span className="sr-only"> ({t.username})</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {notice}
      {throttles.length === 0 ? (
        <EmptyState>최근 로그인 실패 기록이 없습니다.</EmptyState>
      ) : (
        <div className={`${ui.card} overflow-x-auto`}>
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr>
                <th scope="col" className={ui.th}>
                  아이디
                </th>
                <th scope="col" className={ui.th}>
                  상태
                </th>
                <th scope="col" className={ui.th}>
                  실패 횟수
                </th>
                <th scope="col" className={ui.th}>
                  마지막 실패
                </th>
                <th scope="col" className={ui.th}>
                  잠금 해제 예정
                </th>
                <th scope="col" className={ui.th}>
                  <span className="sr-only">작업</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {throttles.map((t) => (
                <tr key={t.username} className={t.is_locked ? "bg-error-container/60" : undefined}>
                  <th scope="row" className={`${ui.td} text-left font-medium`}>
                    {t.username}
                  </th>
                  <td className={ui.td}>{t.is_locked ? <Chip tone="danger">잠김</Chip> : <Chip>기록만</Chip>}</td>
                  <td className={ui.td}>{t.failed_count}회</td>
                  <td className={`${ui.td} text-on-surface-variant`}>{formatDateTime(t.last_failed_at)}</td>
                  <td className={`${ui.td} text-on-surface-variant`}>{t.is_locked ? formatDateTime(t.locked_until) : "-"}</td>
                  <td className={`${ui.td} text-right`}>
                    <button
                      type="button"
                      className={`${ui.btnSmall} ${
                        t.is_locked
                          ? "border border-error bg-surface-container-lowest font-semibold text-on-error-container"
                          : "text-on-surface-variant hover:bg-surface-container-low"
                      }`}
                      disabled={busy === t.username}
                      onClick={() => onUnlock(t.username, t.is_locked)}
                    >
                      {t.is_locked ? "잠금 해제" : "기록 지우기"}
                      <span className="sr-only"> ({t.username})</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
