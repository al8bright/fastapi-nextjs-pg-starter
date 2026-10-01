"use client"

import { type KeyboardEvent, useRef, useState } from "react"
import type { ActiveState } from "./editorDom"
import EditorIcon, { type EditorIconName } from "./EditorIcon"

// 에디터 툴바 — role="toolbar" + 화살표 키 이동(roving tabindex), 토글은 aria-pressed.
// 버튼은 mousedown 기본 동작을 막아 편집 영역의 선택·포커스를 유지한다.

export type ToolbarCommand =
  | "undo" | "redo" | "p" | "h2" | "h3" | "bold" | "italic" | "underline" | "strike" | "mark"
  | "clear" | "align-left" | "align-center" | "align-right" | "ul" | "ol" | "blockquote" | "hr"
  | "link" | "unlink" | "image" | "video"

interface Item {
  command: ToolbarCommand
  label: string
  icon: EditorIconName
  /** 토글 버튼이면 활성 여부. 일반 버튼이면 undefined(aria-pressed 미표시). */
  pressed?: (s: ActiveState) => boolean
}

const GROUPS: Item[][] = [
  [
    { command: "undo", label: "실행 취소 (Ctrl+Z)", icon: "undo" },
    { command: "redo", label: "다시 실행 (Ctrl+Shift+Z)", icon: "redo" },
  ],
  [
    { command: "p", label: "본문", icon: "paragraph", pressed: (s) => s.block === "p" },
    { command: "h2", label: "제목 2", icon: "h2", pressed: (s) => s.block === "h2" },
    { command: "h3", label: "제목 3", icon: "h3", pressed: (s) => s.block === "h3" },
  ],
  [
    { command: "bold", label: "굵게 (Ctrl+B)", icon: "bold", pressed: (s) => s.bold },
    { command: "italic", label: "기울임 (Ctrl+I)", icon: "italic", pressed: (s) => s.italic },
    { command: "underline", label: "밑줄 (Ctrl+U)", icon: "underline", pressed: (s) => s.underline },
    { command: "strike", label: "취소선", icon: "strike", pressed: (s) => s.strike },
    { command: "mark", label: "형광펜", icon: "highlight", pressed: (s) => s.mark },
    { command: "clear", label: "서식 지우기", icon: "clear" },
  ],
  [
    { command: "align-left", label: "왼쪽 정렬", icon: "alignLeft", pressed: (s) => s.align === "left" },
    { command: "align-center", label: "가운데 정렬", icon: "alignCenter", pressed: (s) => s.align === "center" },
    { command: "align-right", label: "오른쪽 정렬", icon: "alignRight", pressed: (s) => s.align === "right" },
  ],
  [
    { command: "ul", label: "글머리 목록", icon: "ul", pressed: (s) => s.ul },
    { command: "ol", label: "번호 목록", icon: "ol", pressed: (s) => s.ol },
    { command: "blockquote", label: "인용", icon: "quote", pressed: (s) => s.block === "blockquote" },
    { command: "hr", label: "구분선", icon: "hr" },
  ],
  [
    { command: "link", label: "링크 걸기", icon: "link", pressed: (s) => s.link },
    { command: "unlink", label: "링크 풀기", icon: "unlink" },
    { command: "image", label: "이미지", icon: "image" },
    { command: "video", label: "영상", icon: "video" },
  ],
]

// 그룹을 펼친 순번(roving tabindex 용) — 렌더 중 변수 재할당 없이 쓰도록 미리 계산한다.
const INDEXED: Array<Array<Item & { index: number }>> = (() => {
  let n = 0
  return GROUPS.map((group) => group.map((item) => ({ ...item, index: n++ })))
})()

interface Props {
  active: ActiveState
  controlsId: string
  onCommand: (command: ToolbarCommand) => void
}

export default function EditorToolbar({ active, controlsId, onCommand }: Props) {
  const [focusIndex, setFocusIndex] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("button[data-index]") ?? [])
    if (!buttons.length) return
    let next: number | null = null
    if (e.key === "ArrowRight") next = (focusIndex + 1) % buttons.length
    else if (e.key === "ArrowLeft") next = (focusIndex - 1 + buttons.length) % buttons.length
    else if (e.key === "Home") next = 0
    else if (e.key === "End") next = buttons.length - 1
    if (next === null) return
    e.preventDefault()
    setFocusIndex(next)
    buttons[next].focus()
  }

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label="서식 도구"
      aria-controls={controlsId}
      onKeyDown={onKeyDown}
      className="flex flex-wrap items-center gap-0.5 border-b border-outline-variant bg-surface-container-lowest p-1"
    >
      {INDEXED.map((group, gi) => (
        <div key={gi} className="flex items-center gap-0.5">
          {gi > 0 && <span role="separator" aria-orientation="vertical" className="mx-1 h-6 w-px bg-outline-variant" />}
          {group.map((item) => {
            const i = item.index
            const pressed = item.pressed?.(active)
            return (
              <button
                key={item.command}
                type="button"
                data-index={i}
                tabIndex={i === focusIndex ? 0 : -1}
                aria-label={item.label}
                title={item.label}
                aria-pressed={item.pressed ? Boolean(pressed) : undefined}
                onMouseDown={(e) => e.preventDefault()}
                onFocus={() => setFocusIndex(i)}
                onClick={() => onCommand(item.command)}
                className={`inline-flex h-11 w-11 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface focus-visible:outline-2 focus-visible:outline-primary ${
                  pressed ? "bg-primary text-on-primary hover:bg-primary hover:text-on-primary" : ""
                }`}
              >
                <EditorIcon name={item.icon} />
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
