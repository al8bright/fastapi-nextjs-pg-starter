"use client"

import { useId, useState } from "react"
import EditorDialog from "./EditorDialog"

// 한 줄 입력 다이얼로그 — 링크 걸기·유튜브 링크·대체 텍스트에 쓴다.
// validate 가 문구를 돌려주면 닫지 않고 오류를 보여 준다.

interface Props {
  title: string
  label: string
  initialValue?: string
  placeholder?: string
  hint?: string
  submitLabel?: string
  inputType?: "text" | "url"
  /** 문제가 있으면 오류 문구, 없으면 null. */
  validate?: (value: string) => string | null
  onSubmit: (value: string) => void
  onClose: () => void
}

export default function TextPromptDialog({
  title,
  label,
  initialValue = "",
  placeholder,
  hint,
  submitLabel = "적용",
  inputType = "text",
  validate,
  onSubmit,
  onClose,
}: Props) {
  const [value, setValue] = useState(initialValue)
  const [error, setError] = useState<string | null>(null)
  const inputId = useId()
  const errorId = useId()
  const hintId = useId()

  const submit = () => {
    const problem = validate?.(value) ?? null
    if (problem) {
      setError(problem)
      return
    }
    onSubmit(value)
  }

  return (
    <EditorDialog title={title} onClose={onClose}>
      <label htmlFor={inputId} className="mt-4 block text-sm font-medium">
        {label}
      </label>
      <input
        id={inputId}
        data-autofocus
        type={inputType}
        value={value}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hint ? hintId : "", error ? errorId : ""].filter(Boolean).join(" ") || undefined}
        onChange={(e) => {
          setValue(e.target.value)
          setError(null)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault()
            submit()
          }
        }}
        className="mt-1 min-h-11 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-on-surface outline-none focus:border-primary"
      />
      {hint && (
        <p id={hintId} className="mt-1 text-xs text-on-surface-variant">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="mt-2 rounded-lg bg-error-container px-3 py-2 text-sm text-on-error-container">
          {error}
        </p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-lg border border-outline-variant px-4 font-medium text-on-surface hover:bg-surface-container"
        >
          취소
        </button>
        <button
          type="button"
          onClick={submit}
          className="min-h-11 rounded-lg bg-primary px-4 font-semibold text-on-primary hover:opacity-90"
        >
          {submitLabel}
        </button>
      </div>
    </EditorDialog>
  )
}
