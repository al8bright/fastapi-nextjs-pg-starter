"use client"

import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef } from "react"
import { createPortal } from "react-dom"

// 에디터 공용 모달 다이얼로그 — role="dialog" + aria-modal, 포커스 가둠(Tab 순환), Esc 로 닫기,
// 닫히면 열기 전 포커스로 돌아간다.
//
// body 로 portal 한다: 에디터가 <form> 안에 있어도 중첩 form·제출이 생기지 않도록 다이얼로그는
// <form> 을 쓰지 않고 Enter 를 직접 처리한다(React 합성 이벤트는 portal 너머로도 버블되므로
// 다이얼로그 안 keydown 은 여기서 전파를 끊는다).

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  /** 넓은 다이얼로그(자르기). */
  wide?: boolean
}

export default function EditorDialog({ title, onClose, children, wide = false }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const el = ref.current
    const first = el?.querySelector<HTMLElement>("[data-autofocus]") ?? el?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? el)?.focus()
    return () => {
      if (previous?.isConnected) previous.focus()
    }
  }, [])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation()
    if (e.key === "Escape") {
      e.preventDefault()
      onClose()
      return
    }
    if (e.key !== "Tab") return
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
    if (!items.length) {
      e.preventDefault()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (e.shiftKey && (active === first || active === ref.current)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={`max-h-full w-full overflow-auto rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 text-on-surface shadow-xl outline-none ${
          wide ? "max-w-3xl" : "max-w-md"
        }`}
      >
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        {children}
      </div>
    </div>,
    document.body,
  )
}
