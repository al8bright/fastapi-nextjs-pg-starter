"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import Chip from "@/components/ui/Chip"
import ConfirmDialog from "@/components/ui/ConfirmDialog"
import { EmptyState, Notice } from "@/components/ui/QueryState"
import { ui } from "@/components/ui/styles"
import { revokeUserSessionsAction, updateUserAction } from "@/lib/actions/admin"
import { formatDate } from "@/lib/format"
import type { AdminUser, AdminUserUpdate, UserRole } from "@/lib/types"

// 사용자 표 — 권한·활성 변경(확인 후 PATCH), 세션 모두 종료. 목록은 서버(page.tsx)가 조회해 넘긴다.
// 자기 자신 변경(409 self_modification)·마지막 관리자 보호(409 last_admin)는 서버가 거부하고 문구로 안내한다.
// 권한 select 는 확인을 받기 전까지 값을 바꾸지 않는다(제어 컴포넌트 — 표시값은 서버 데이터 그대로).

const ROLE_LABEL: Record<UserRole, string> = { admin: "관리자", user: "일반 사용자" }

type Pending =
  | { kind: "update"; user: AdminUser; body: AdminUserUpdate; title: string; description: string }
  | { kind: "revoke"; user: AdminUser }

export default function UsersTable({ users, meId }: { users: AdminUser[]; meId: number | null }) {
  const [pending, setPending] = useState<Pending | null>(null)
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null)
  const [busy, startTransition] = useTransition()

  const askRole = (user: AdminUser, next: UserRole) =>
    setPending({
      kind: "update",
      user,
      body: { role: next },
      title: `${user.username} 의 권한을 바꿀까요?`,
      description: `${ROLE_LABEL[user.role]} → ${ROLE_LABEL[next]}. ${
        next === "admin" ? "관리자 콘솔의 모든 기능을 쓸 수 있게 됩니다." : "관리자 콘솔에 더 이상 들어올 수 없습니다."
      }`,
    })

  const askActive = (user: AdminUser) =>
    setPending({
      kind: "update",
      user,
      body: { is_active: !user.is_active },
      title: user.is_active ? `${user.username} 을(를) 비활성화할까요?` : `${user.username} 을(를) 다시 활성화할까요?`,
      description: user.is_active ? "로그인할 수 없게 되고 살아 있는 세션이 모두 종료됩니다." : "다시 로그인할 수 있게 됩니다.",
    })

  const confirm = () => {
    if (!pending) return
    const p = pending
    startTransition(async () => {
      if (p.kind === "update") {
        const result = await updateUserAction(p.user.id, p.body)
        setMessage(
          result.ok ? { tone: "success", text: `${p.user.username} 의 정보를 바꿨습니다.` } : { tone: "error", text: result.error },
        )
      } else {
        const result = await revokeUserSessionsAction(p.user.id)
        setMessage(
          result.ok
            ? { tone: "success", text: `${p.user.username} 의 세션 ${result.data.revoked}개를 종료했습니다.` }
            : { tone: "error", text: result.error },
        )
      }
      setPending(null)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {message && (
        <Notice tone={message.tone} onClose={() => setMessage(null)}>
          {message.text}
        </Notice>
      )}
      {users.length === 0 ? (
        <EmptyState>조건에 맞는 사용자가 없습니다.</EmptyState>
      ) : (
        <div className={`${ui.card} overflow-x-auto`}>
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr>
                <th scope="col" className={ui.th}>
                  아이디
                </th>
                <th scope="col" className={ui.th}>
                  권한
                </th>
                <th scope="col" className={ui.th}>
                  상태
                </th>
                <th scope="col" className={ui.th}>
                  가입일
                </th>
                <th scope="col" className={ui.th}>
                  활성 세션
                </th>
                <th scope="col" className={ui.th}>
                  <span className="sr-only">작업</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isMe = meId === u.id
                return (
                  <tr key={u.id}>
                    <th scope="row" className={`${ui.td} text-left font-medium`}>
                      {u.username}
                      {isMe && <span className="ml-1 text-xs text-on-surface-variant">(나)</span>}
                    </th>
                    <td className={ui.td}>
                      <label className="sr-only" htmlFor={`role-${u.id}`}>
                        {u.username} 권한
                      </label>
                      <select
                        id={`role-${u.id}`}
                        value={u.role}
                        onChange={(e) => askRole(u, e.target.value as UserRole)}
                        className={`${ui.input} mt-0 w-36`}
                      >
                        <option value="user">일반 사용자</option>
                        <option value="admin">관리자</option>
                      </select>
                    </td>
                    <td className={ui.td}>{u.is_active ? <Chip tone="success">활성</Chip> : <Chip tone="danger">비활성</Chip>}</td>
                    <td className={`${ui.td} text-on-surface-variant`}>{formatDate(u.created_at)}</td>
                    <td className={ui.td}>
                      <Link href={`/admin/sessions?user_id=${u.id}`} className={ui.link}>
                        {u.active_session_count}개<span className="sr-only"> ({u.username} 세션 보기)</span>
                      </Link>
                    </td>
                    <td className={`${ui.td} text-right whitespace-nowrap`}>
                      <button
                        type="button"
                        className={`${ui.btnSmall} ${u.is_active ? "text-error hover:bg-error-container" : "text-primary hover:bg-primary-fixed"}`}
                        onClick={() => askActive(u)}
                      >
                        {u.is_active ? "비활성화" : "활성화"}
                        <span className="sr-only"> ({u.username})</span>
                      </button>
                      <button
                        type="button"
                        className={`${ui.btnSmall} text-error hover:bg-error-container`}
                        onClick={() => setPending({ kind: "revoke", user: u })}
                        disabled={u.active_session_count === 0}
                      >
                        세션 모두 종료<span className="sr-only"> ({u.username})</span>
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {pending?.kind === "update" && (
        <ConfirmDialog
          title={pending.title}
          confirmLabel="변경"
          danger={pending.body.is_active === false || pending.body.role === "user"}
          pending={busy}
          onConfirm={confirm}
          onCancel={() => setPending(null)}
        >
          {pending.description}
        </ConfirmDialog>
      )}
      {pending?.kind === "revoke" && (
        <ConfirmDialog
          title={`${pending.user.username} 의 세션을 모두 종료할까요?`}
          confirmLabel="모두 종료"
          danger
          pending={busy}
          onConfirm={confirm}
          onCancel={() => setPending(null)}
        >
          모든 기기에서 즉시 로그아웃됩니다. 계정은 그대로이며 다시 로그인할 수 있습니다.
        </ConfirmDialog>
      )}
    </div>
  )
}
