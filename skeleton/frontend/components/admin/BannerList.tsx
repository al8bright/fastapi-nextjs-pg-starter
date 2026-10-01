"use client"

import Link from "next/link"
import { useOptimistic, useState, useTransition } from "react"
import ConfirmDialog from "@/components/ui/ConfirmDialog"
import Icon from "@/components/ui/Icon"
import { EmptyState, Notice } from "@/components/ui/QueryState"
import { ui } from "@/components/ui/styles"
import { deleteBannerAction, reorderBannersAction, toggleBannerAction } from "@/lib/actions/banners"
import { formatDateTime } from "@/lib/format"
import type { BannerAdmin } from "@/lib/types"

// 배너 목록 — 썸네일·제목·노출 기간·활성 토글(PUT 전체 본문)·순서 이동(PATCH order)·삭제.
// 목록은 서버(page.tsx)가 조회해 넘긴다. 토글·순서는 useOptimistic 으로 바로 반영하고,
// 액션이 끝나면 revalidatePath 로 받은 서버 데이터가 그 자리를 대신한다(실패하면 자연히 원래 값으로 돌아간다).

function period(b: BannerAdmin): string {
  if (!b.starts_at && !b.ends_at) return "기간 제한 없음"
  return `${b.starts_at ? formatDateTime(b.starts_at) : "처음부터"} ~ ${b.ends_at ? formatDateTime(b.ends_at) : "계속"}`
}

type OptimisticChange = { type: "toggle"; id: number } | { type: "order"; ids: number[] }

function applyChange(list: BannerAdmin[], change: OptimisticChange): BannerAdmin[] {
  if (change.type === "toggle") return list.map((b) => (b.id === change.id ? { ...b, is_active: !b.is_active } : b))
  const byId = new Map(list.map((b) => [b.id, b]))
  return change.ids.map((id) => byId.get(id)).filter((b): b is BannerAdmin => Boolean(b))
}

export default function BannerList({ banners }: { banners: BannerAdmin[] }) {
  const [list, applyOptimistic] = useOptimistic(banners, applyChange)
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null)
  const [deleting, setDeleting] = useState<BannerAdmin | null>(null)
  const [pending, startTransition] = useTransition()

  const toggle = (b: BannerAdmin) =>
    startTransition(async () => {
      applyOptimistic({ type: "toggle", id: b.id })
      const result = await toggleBannerAction(b.id)
      if (!result.ok) setMessage({ tone: "error", text: result.error })
    })

  const move = (index: number, delta: -1 | 1) => {
    const ids = list.map((b) => b.id)
    const target = index + delta
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    const title = list[index].title
    startTransition(async () => {
      applyOptimistic({ type: "order", ids })
      const result = await reorderBannersAction(ids)
      setMessage(result.ok ? { tone: "success", text: `“${title}” 의 순서를 바꿨습니다.` } : { tone: "error", text: result.error })
    })
  }

  const confirmDelete = () => {
    if (!deleting) return
    const d = deleting
    startTransition(async () => {
      const result = await deleteBannerAction(d.id)
      setMessage(result.ok ? { tone: "success", text: `“${d.title}” 배너를 삭제했습니다.` } : { tone: "error", text: result.error })
      setDeleting(null)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {message && (
        <Notice tone={message.tone} onClose={() => setMessage(null)}>
          {message.text}
        </Notice>
      )}
      {list.length === 0 ? (
        <EmptyState>등록된 배너가 없습니다. 배너가 없으면 홈 화면에 기본 히어로가 보입니다.</EmptyState>
      ) : (
        <ol className="flex flex-col gap-3" aria-label="배너 노출 순서">
          {list.map((b, i) => (
            <li key={b.id} className={`${ui.card} flex flex-col gap-3 p-3 sm:flex-row sm:items-center`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- 백엔드가 재인코딩한 업로드 이미지(/uploads, rewrite) — next/image 최적화 대상이 아니다. */}
              <img
                src={b.image_url}
                alt=""
                width={b.image_width}
                height={b.image_height}
                loading="lazy"
                className="aspect-[3/1] w-full rounded bg-surface object-cover sm:w-40"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-on-surface-variant">{i + 1}</span>
                  <Link href={`/admin/banners/${b.id}/edit`} className={`${ui.link} truncate font-medium text-on-surface`}>
                    {b.title}
                  </Link>
                </span>
                <span className="text-sm text-on-surface-variant">{period(b)}</span>
                {b.link_url && <span className="truncate text-sm text-on-surface-variant">링크: {b.link_url}</span>}
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  role="switch"
                  aria-checked={b.is_active}
                  aria-label={`${b.title} 활성`}
                  onClick={() => toggle(b)}
                  className={`${ui.btnSmall} gap-2 text-on-surface hover:bg-surface-container-low`}
                >
                  <span
                    aria-hidden="true"
                    className={`relative inline-block h-6 w-10 rounded-full transition-colors ${b.is_active ? "bg-primary" : "bg-outline"}`}
                  >
                    <span
                      className={`absolute top-0.5 size-5 rounded-full bg-surface-container-lowest transition-all ${b.is_active ? "left-[18px]" : "left-0.5"}`}
                    />
                  </span>
                  {b.is_active ? "활성" : "비활성"}
                </button>
                <button
                  type="button"
                  className={`${ui.btnSmall} min-w-11 text-on-surface-variant hover:bg-surface-container-low`}
                  onClick={() => move(i, -1)}
                  disabled={i === 0 || pending}
                  aria-label={`${b.title} 위로 이동`}
                >
                  <Icon name="up" />
                </button>
                <button
                  type="button"
                  className={`${ui.btnSmall} min-w-11 text-on-surface-variant hover:bg-surface-container-low`}
                  onClick={() => move(i, 1)}
                  disabled={i === list.length - 1 || pending}
                  aria-label={`${b.title} 아래로 이동`}
                >
                  <Icon name="down" />
                </button>
                <Link href={`/admin/banners/${b.id}/edit`} className={`${ui.btnSmall} text-primary hover:bg-primary-fixed`}>
                  수정<span className="sr-only"> ({b.title})</span>
                </Link>
                <button type="button" className={`${ui.btnSmall} text-error hover:bg-error-container`} onClick={() => setDeleting(b)}>
                  삭제<span className="sr-only"> ({b.title})</span>
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}

      {deleting && (
        <ConfirmDialog
          title="배너를 삭제할까요?"
          confirmLabel="삭제"
          danger
          pending={pending}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        >
          “{deleting.title}” 배너와 이미지가 삭제되며 되돌릴 수 없습니다.
        </ConfirmDialog>
      )}
    </div>
  )
}
