"use client"

import { type ChangeEvent, useId, useState, useTransition } from "react"
import ConfirmDialog from "@/components/ui/ConfirmDialog"
import Icon from "@/components/ui/Icon"
import { Notice } from "@/components/ui/QueryState"
import { ui } from "@/components/ui/styles"
import { deleteAttachmentAction, uploadAttachmentAction } from "@/lib/actions/notices"
import { formatBytes } from "@/lib/format"
import type { Attachment } from "@/lib/types"
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_EXTENSIONS,
  attachmentProblem,
  MAX_ATTACHMENT_MB,
  MAX_ATTACHMENTS_PER_NOTICE,
} from "@/lib/uploadRules"

// 공지 첨부 패널 — 공지가 저장된 뒤에만 쓴다(첨부는 공지 id 에 붙는다).
// 여러 파일을 고르면 사전 검사(확장자·용량·개수) 후 **하나씩 순서대로** Server Action(uploadAttachmentAction)으로
// 올리고 파일별 상태·오류를 보여 준다. 첨부 목록은 서버가 읽어 props 로 넘기고, 액션의 revalidatePath 가 갱신한다.
// ⚠️ Server Action 은 업로드 진행률을 알려 주지 않는다 — 파일별 "올리는 중" 상태만 보인다.
// 관리자 다운로드(임시저장 공지 포함)는 Route Handler(/admin/notices/<id>/attachments/<aid>)가
// 세션 토큰으로 백엔드에서 받아 스트리밍한다 — 그래서 일반 <a download> 로 받을 수 있다.

type UploadStatus = "waiting" | "uploading" | "done" | "error"

interface UploadItem {
  key: string
  file: File
  status: UploadStatus
  error: string | null
}

const STATUS_LABEL: Record<UploadStatus, string> = {
  waiting: "대기",
  uploading: "올리는 중…",
  done: "완료",
  error: "실패",
}

/** 업로드 사전 검사 + 남은 자리 계산 — 문제 있는 파일은 바로 "실패" 로 표시한다. */
export function planUploads(files: File[], existingCount: number, now = Date.now()): UploadItem[] {
  let slots = MAX_ATTACHMENTS_PER_NOTICE - existingCount
  return files.map((file, i) => {
    let problem = attachmentProblem(file)
    if (!problem) {
      if (slots <= 0) problem = `첨부 파일은 공지당 ${MAX_ATTACHMENTS_PER_NOTICE}개까지 올릴 수 있습니다.`
      else slots -= 1
    }
    return { key: `${now}-${i}-${file.name}`, file, status: problem ? "error" : "waiting", error: problem }
  })
}

export default function AttachmentsPanel({ noticeId, attachments }: { noticeId: number; attachments: Attachment[] }) {
  const [queue, setQueue] = useState<UploadItem[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null)
  const [deleting, setDeleting] = useState<Attachment | null>(null)
  const [removing, startRemove] = useTransition()
  const inputId = useId()
  const helpId = useId()

  const patch = (key: string, changes: Partial<UploadItem>) =>
    setQueue((items) => items.map((it) => (it.key === key ? { ...it, ...changes } : it)))

  const onSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ""
    if (!files.length) return
    const items = planUploads(files, attachments.length)
    setQueue(items)
    setMessage(null)
    setBusy(true)
    for (const item of items) {
      if (item.status === "error") continue
      patch(item.key, { status: "uploading" })
      const form = new FormData()
      form.append("file", item.file, item.file.name)
      try {
        const result = await uploadAttachmentAction(noticeId, form)
        patch(item.key, result.ok ? { status: "done" } : { status: "error", error: result.error })
      } catch {
        // 액션 자체가 실패 — 대개 본문 상한(next.config.ts serverActions.bodySizeLimit) 초과나 연결 끊김이다.
        patch(item.key, {
          status: "error",
          error: `파일을 올리지 못했습니다. ${MAX_ATTACHMENT_MB}MB 이하인지, 연결 상태를 확인하세요.`,
        })
      }
    }
    setBusy(false)
  }

  const confirmDelete = () => {
    if (!deleting) return
    const d = deleting
    startRemove(async () => {
      const result = await deleteAttachmentAction(noticeId, d.id)
      setMessage(
        result.ok ? { tone: "success", text: `${d.original_name} 을(를) 삭제했습니다.` } : { tone: "error", text: result.error },
      )
      setDeleting(null)
    })
  }

  return (
    <section aria-labelledby="attachments-title" className={`${ui.card} flex flex-col gap-4 rounded-xl p-5`}>
      <div>
        <h2 id="attachments-title" className="text-lg font-semibold">
          첨부 파일{" "}
          <span className="text-on-surface-variant">
            ({attachments.length}/{MAX_ATTACHMENTS_PER_NOTICE})
          </span>
        </h2>
      </div>

      {message && (
        <Notice tone={message.tone} onClose={() => setMessage(null)}>
          {message.text}
        </Notice>
      )}

      {attachments.length === 0 ? (
        <p className="text-sm text-on-surface-variant">첨부 파일이 없습니다.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {attachments.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-outline-variant px-3 py-1.5">
              <Icon name="clip" size={16} className="text-on-surface-variant" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{a.original_name}</span>
              <span className="text-sm text-on-surface-variant">{formatBytes(a.size_bytes)}</span>
              {/* Route Handler 가 Content-Disposition 을 그대로 넘긴다 — 원래 파일명으로 저장된다. */}
              <a
                href={`/admin/notices/${noticeId}/attachments/${a.id}`}
                download={a.original_name}
                className={`${ui.btnSmall} text-primary hover:bg-primary-fixed`}
              >
                내려받기<span className="sr-only"> ({a.original_name})</span>
              </a>
              <button type="button" className={`${ui.btnSmall} text-error hover:bg-error-container`} onClick={() => setDeleting(a)}>
                삭제<span className="sr-only"> ({a.original_name})</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div>
        <label htmlFor={inputId} className={ui.label}>
          파일 올리기
        </label>
        <input
          id={inputId}
          type="file"
          multiple
          accept={ATTACHMENT_ACCEPT}
          disabled={busy || attachments.length >= MAX_ATTACHMENTS_PER_NOTICE}
          onChange={(e) => void onSelect(e)}
          aria-describedby={helpId}
          className={`mt-2 block w-full rounded text-sm text-on-surface-variant file:mr-3 file:min-h-11 file:cursor-pointer file:rounded file:border-0 file:bg-primary file:px-4 file:font-semibold file:text-on-primary disabled:opacity-60 ${ui.focusRing}`}
        />
        <p id={helpId} className={ui.help}>
          {ATTACHMENT_EXTENSIONS.join(", ")} · 파일당 {MAX_ATTACHMENT_MB}MB 이하 · 공지당 {MAX_ATTACHMENTS_PER_NOTICE}개까지
        </p>
      </div>

      {queue.length > 0 && (
        <ul aria-label="업로드 진행 상황" aria-live="polite" className="flex flex-col gap-2">
          {queue.map((it) => (
            <li key={it.key} className="rounded-lg bg-surface-container-low px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{it.file.name}</span>
                <span className={it.status === "error" ? "font-semibold text-error" : "text-on-surface-variant"}>
                  {STATUS_LABEL[it.status]}
                </span>
              </div>
              {it.status === "uploading" && (
                <progress className="mt-1 h-1.5 w-full accent-primary" aria-label={`${it.file.name} 업로드 중`} />
              )}
              {it.error && <p className="mt-1 text-error">{it.error}</p>}
            </li>
          ))}
        </ul>
      )}

      {deleting && (
        <ConfirmDialog
          title="첨부 파일을 삭제할까요?"
          confirmLabel="삭제"
          danger
          pending={removing}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        >
          {deleting.original_name} 이(가) 바로 삭제되며 되돌릴 수 없습니다.
        </ConfirmDialog>
      )}
    </section>
  )
}
