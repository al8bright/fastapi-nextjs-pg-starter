"use client"

import type { ReactNode } from "react"
import EditorDialog from "@/components/editor/EditorDialog"
import { ui } from "./styles"

// 확인 다이얼로그 — 삭제·강제 종료 같은 되돌리기 어려운 작업 전에 띄운다.
// 포커스 가둠·Esc 닫기·포커스 복귀는 공용 모달(EditorDialog)이 맡는다.
interface Props {
  title: string
  children?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** 파괴적 작업이면 확인 버튼을 오류 색으로. */
  danger?: boolean
  pending?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  title,
  children,
  confirmLabel = "확인",
  cancelLabel = "취소",
  danger = false,
  pending = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <EditorDialog title={title} onClose={onCancel}>
      {children && <div className="mt-3 text-sm leading-6 text-on-surface-variant">{children}</div>}
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className={ui.btnNeutral} onClick={onCancel} data-autofocus>
          {cancelLabel}
        </button>
        <button
          type="button"
          className={danger ? ui.btnDangerSolid : ui.btnPrimary}
          onClick={onConfirm}
          disabled={pending}
        >
          {pending ? "처리 중…" : confirmLabel}
        </button>
      </div>
    </EditorDialog>
  )
}
