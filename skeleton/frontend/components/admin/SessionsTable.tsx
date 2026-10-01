"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import ConfirmDialog from "@/components/ui/ConfirmDialog"
import { EmptyState, Notice } from "@/components/ui/QueryState"
import { ui } from "@/components/ui/styles"
import { revokeSessionAction } from "@/lib/actions/admin"
import { formatDateTime } from "@/lib/format"
import type { AdminSession } from "@/lib/types"

// 활성 세션 표 + 강제 종료(확인 후 Server Action). 대시보드(최근 5건, compact)와 세션 화면(전체)이 같이 쓴다.
// 목록은 서버가 조회해 props 로 넘기고, 종료 후에는 액션의 revalidatePath 가 화면을 다시 그린다.
export default function SessionsTable({ sessions, compact = false }: { sessions: AdminSession[]; compact?: boolean }) {
  const [target, setTarget] = useState<AdminSession | null>(null)
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const confirm = () => {
    if (!target) return
    const t = target
    startTransition(async () => {
      const result = await revokeSessionAction(t.id)
      setMessage(
        result.ok
          ? { tone: "success", text: compact ? `${t.username} 의 세션을 종료했습니다.` : `${t.username} 의 세션 #${t.id} 을(를) 종료했습니다.` }
          : { tone: "error", text: result.error },
      )
      setTarget(null)
    })
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {message && (
        <Notice tone={message.tone} onClose={() => setMessage(null)}>
          {message.text}
        </Notice>
      )}
      {sessions.length === 0 ? (
        <EmptyState>활성 세션이 없습니다.</EmptyState>
      ) : (
        <div className={compact ? "overflow-x-auto" : `${ui.card} overflow-x-auto`}>
          <table className={`w-full border-collapse ${compact ? "min-w-[520px]" : "min-w-[680px]"}`}>
            <thead>
              <tr>
                {!compact && (
                  <th scope="col" className={ui.th}>
                    세션
                  </th>
                )}
                <th scope="col" className={ui.th}>
                  사용자
                </th>
                <th scope="col" className={ui.th}>
                  로그인
                </th>
                <th scope="col" className={ui.th}>
                  마지막 사용
                </th>
                <th scope="col" className={ui.th}>
                  만료
                </th>
                <th scope="col" className={ui.th}>
                  <span className="sr-only">작업</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  {!compact && <td className={`${ui.td} text-on-surface-variant`}>#{s.id}</td>}
                  <td className={`${ui.td} font-medium`}>
                    {compact ? (
                      s.username
                    ) : (
                      <Link href={`/admin/sessions?user_id=${s.user_id}`} className={`${ui.link} font-medium text-on-surface`}>
                        {s.username}
                        <span className="sr-only"> 의 세션만 보기</span>
                      </Link>
                    )}
                  </td>
                  <td className={`${ui.td} text-on-surface-variant`}>{formatDateTime(s.created_at)}</td>
                  <td className={`${ui.td} text-on-surface-variant`}>{formatDateTime(s.last_used_at)}</td>
                  <td className={`${ui.td} text-on-surface-variant`}>{formatDateTime(s.expires_at)}</td>
                  <td className={`${ui.td} text-right`}>
                    <button
                      type="button"
                      className={`${ui.btnSmall} border border-error text-error hover:bg-error-container`}
                      onClick={() => setTarget(s)}
                    >
                      강제 종료
                      <span className="sr-only">{compact ? ` (${s.username})` : ` (세션 #${s.id}, ${s.username})`}</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {target && (
        <ConfirmDialog
          title="세션을 강제 종료할까요?"
          confirmLabel="강제 종료"
          danger
          pending={pending}
          onConfirm={confirm}
          onCancel={() => setTarget(null)}
        >
          {target.username} 의 세션 #{target.id} 이(가) 즉시 끊기고 다시 로그인해야 합니다. 내 세션이면 나도 로그아웃됩니다.
        </ConfirmDialog>
      )}
    </div>
  )
}
