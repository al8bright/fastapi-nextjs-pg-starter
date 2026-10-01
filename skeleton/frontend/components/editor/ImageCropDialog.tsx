"use client"

import { type KeyboardEvent, type PointerEvent, useEffect, useMemo, useRef, useState } from "react"
import {
  centeredCrop,
  clampCrop,
  CROP_RATIOS,
  type CropHandle,
  displayToSource,
  dragCrop,
  normalizeRotation,
  previewScale,
  type Rect,
  type Rotation,
  rotatedSize,
} from "@/lib/editor/imageTransform"
import EditorDialog from "./EditorDialog"
import EditorIcon from "./EditorIcon"
import { type DecodedImage, decodeImage, drawPreview, releaseImage, sizeOf } from "./imageCanvas"

// 자르기·회전 다이얼로그 (editor-spec §4).
// - 미리보기 위에서 드래그로 선택 영역을 만들고, 모서리·변 핸들로 크기를, 내부 드래그로 위치를 바꾼다.
// - 회전은 자르기보다 먼저 적용된다(선택 영역은 회전한 이미지 좌표계). 회전하면 선택을 초기화한다.
// - 표시 좌표 → 원본 좌표로 환산한 뒤 clampCrop 으로 정수·경계를 맞춰 onApply 에 넘긴다.

export interface CropResult {
  /** 회전한 이미지 기준 원본 px 사각형. null 이면 전체. */
  crop: Rect | null
  rotate: Rotation
}

interface Props {
  file: File
  /** insert: 새 이미지 삽입("그대로 넣기" 제공) / recrop: 이미 넣은 이미지 다시 자르기. */
  mode: "insert" | "recrop"
  onApply: (result: CropResult) => void
  onSkip?: () => void
  onCancel: () => void
}

const HANDLES: CropHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"]
const HANDLE_POS: Record<CropHandle, string> = {
  nw: "left-0 top-0 cursor-nwse-resize",
  n: "left-1/2 top-0 cursor-ns-resize",
  ne: "left-full top-0 cursor-nesw-resize",
  e: "left-full top-1/2 cursor-ew-resize",
  se: "left-full top-full cursor-nwse-resize",
  s: "left-1/2 top-full cursor-ns-resize",
  sw: "left-0 top-full cursor-nesw-resize",
  w: "left-0 top-1/2 cursor-ew-resize",
}

interface Drag {
  mode: CropHandle | "move"
  start: Rect
  originX: number
  originY: number
  pointerId: number
}

export default function ImageCropDialog({ file, mode, onApply, onSkip, onCancel }: Props) {
  const [image, setImage] = useState<DecodedImage | null>(null)
  const [failed, setFailed] = useState(false)
  const [rotate, setRotate] = useState<Rotation>(0)
  const [ratio, setRatio] = useState<number | null>(null)
  const [selection, setSelection] = useState<Rect | null>(null)
  // 미리보기 상자 — 다이얼로그를 여는 시점의 화면 크기 기준.
  const [box] = useState(() => ({
    width: Math.max(200, Math.min(720, window.innerWidth - 80)),
    height: Math.max(160, Math.min(440, window.innerHeight - 300)),
  }))
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<Drag | null>(null)

  useEffect(() => {
    let cancelled = false
    let decoded: DecodedImage | null = null
    decodeImage(file).then(
      (img) => {
        decoded = img
        if (cancelled) releaseImage(img)
        else setImage(img)
      },
      () => {
        if (!cancelled) setFailed(true)
      },
    )
    return () => {
      cancelled = true
      releaseImage(decoded)
    }
  }, [file])

  // 회전한 원본 크기와 표시 크기.
  const geometry = useMemo(() => {
    if (!image) return null
    const natural = rotatedSize(sizeOf(image), rotate)
    const scale = previewScale(natural, box.width, box.height)
    return {
      natural,
      scale,
      display: { width: Math.round(natural.width * scale), height: Math.round(natural.height * scale) },
    }
  }, [image, rotate, box])

  useEffect(() => {
    if (image && geometry && canvasRef.current) drawPreview(canvasRef.current, image, rotate, geometry.display)
  }, [image, rotate, geometry])

  const pointFrom = (e: PointerEvent) => {
    const rect = stageRef.current?.getBoundingClientRect()
    return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) }
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!geometry || e.button !== 0) return
    const target = e.target as HTMLElement
    const handle = target.dataset.handle as CropHandle | undefined
    const p = pointFrom(e)
    let drag: Drag
    if (handle && selection) {
      drag = { mode: handle, start: selection, originX: e.clientX, originY: e.clientY, pointerId: e.pointerId }
    } else if (target.dataset.cropBox !== undefined && selection) {
      drag = { mode: "move", start: selection, originX: e.clientX, originY: e.clientY, pointerId: e.pointerId }
    } else {
      // 빈 곳에서 새로 그린다 — 0 크기 사각형의 se 핸들을 끄는 것과 같다.
      const start = { x: p.x, y: p.y, width: 0, height: 0 }
      drag = { mode: "se", start, originX: e.clientX, originY: e.clientY, pointerId: e.pointerId }
      setSelection(dragCrop(start, "se", 0, 0, geometry.display, ratio, 0))
    }
    e.preventDefault()
    dragRef.current = drag
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId || !geometry) return
    const next = dragCrop(
      drag.start,
      drag.mode,
      e.clientX - drag.originX,
      e.clientY - drag.originY,
      geometry.display,
      ratio,
      drag.start.width === 0 ? 0 : 8,
    )
    setSelection(next)
  }

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || dragRef.current.pointerId !== e.pointerId) return
    dragRef.current = null
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    // 클릭만 한 경우(아주 작은 영역)는 선택 해제 = 전체.
    setSelection((sel) => (sel && (sel.width < 4 || sel.height < 4) ? null : sel))
  }

  // 키보드: 화살표 이동, Shift+화살표 크기 조절.
  const onBoxKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!selection || !geometry) return
    const step = 10
    const deltas: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }
    const d = deltas[e.key]
    if (!d) return
    e.preventDefault()
    setSelection(dragCrop(selection, e.shiftKey ? "se" : "move", d[0], d[1], geometry.display, ratio))
  }

  const chooseRatio = (value: number | null) => {
    setRatio(value)
    if (value && geometry) setSelection(centeredCrop(geometry.display, value))
  }

  const rotateBy = (deg: number) => {
    setRotate((r) => normalizeRotation(r + deg))
    // 회전하면 좌표계가 바뀐다 — 선택을 지운다(비율이 있으면 적용 시 가운데 영역을 쓴다).
    setSelection(null)
  }

  const apply = () => {
    if (!geometry) {
      onApply({ crop: null, rotate })
      return
    }
    const sel = selection ?? (ratio ? centeredCrop(geometry.display, ratio) : null)
    const crop = sel ? clampCrop(displayToSource(sel, geometry.scale), geometry.natural, ratio) : null
    const isFull = crop && crop.x === 0 && crop.y === 0 && crop.width === geometry.natural.width && crop.height === geometry.natural.height
    onApply({ crop: isFull ? null : crop, rotate })
  }

  const btn =
    "inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border border-outline-variant px-3 text-sm font-medium text-on-surface hover:bg-surface-container disabled:opacity-50"

  return (
    <EditorDialog title={mode === "insert" ? "이미지 자르기" : "이미지 다시 자르기"} onClose={onCancel} wide>
      <p className="mt-1 text-sm text-on-surface-variant">
        드래그해서 남길 영역을 고르세요. 고르지 않으면 이미지 전체를 씁니다.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div role="group" aria-label="자르기 비율" className="flex flex-wrap gap-1">
          {CROP_RATIOS.map((r) => (
            <button
              key={r.label}
              type="button"
              aria-pressed={ratio === r.value}
              onClick={() => chooseRatio(r.value)}
              className={`${btn} ${ratio === r.value ? "border-primary bg-primary text-on-primary hover:bg-primary" : ""}`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-1">
          <button type="button" className={btn} aria-label="왼쪽으로 90° 회전" onClick={() => rotateBy(-90)} disabled={!image}>
            <EditorIcon name="rotateLeft" />
          </button>
          <button type="button" className={btn} aria-label="오른쪽으로 90° 회전" onClick={() => rotateBy(90)} disabled={!image}>
            <EditorIcon name="rotateRight" />
          </button>
        </div>
      </div>

      <div className="mt-3 flex min-h-40 items-center justify-center rounded-xl bg-surface-container p-2">
        {failed ? (
          <p role="alert" className="text-sm text-on-error-container">
            이미지를 읽을 수 없습니다.{mode === "insert" ? " 그대로 넣기를 눌러 원본을 올릴 수 있습니다." : ""}
          </p>
        ) : !geometry ? (
          <p role="status" className="text-sm text-on-surface-variant">
            이미지를 불러오는 중…
          </p>
        ) : (
          <div
            ref={stageRef}
            className="relative touch-none select-none overflow-hidden"
            style={{ width: geometry.display.width, height: geometry.display.height }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            data-testid="crop-stage"
          >
            <canvas ref={canvasRef} className="block h-full w-full" aria-label="자르기 미리보기" role="img" />
            {selection && (
              <div
                data-crop-box=""
                tabIndex={0}
                role="group"
                aria-label={`자르기 영역 ${Math.round(selection.width / geometry.scale)}×${Math.round(
                  selection.height / geometry.scale,
                )}px — 화살표로 이동, Shift+화살표로 크기 조절`}
                onKeyDown={onBoxKeyDown}
                className="absolute cursor-move border-2 border-white outline-none focus-visible:border-primary"
                style={{
                  left: selection.x,
                  top: selection.y,
                  width: selection.width,
                  height: selection.height,
                  boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.5)",
                }}
              >
                {HANDLES.map((h) => (
                  <span
                    key={h}
                    data-handle={h}
                    aria-hidden="true"
                    className={`absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 after:absolute after:inset-[7px] after:rounded-sm after:border after:border-primary after:bg-white ${HANDLE_POS[h]}`}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCancel} className={btn}>
          취소
        </button>
        {mode === "insert" && onSkip && (
          <button type="button" onClick={onSkip} className={btn}>
            그대로 넣기
          </button>
        )}
        <button
          type="button"
          onClick={apply}
          disabled={!image}
          className="min-h-11 rounded-lg bg-primary px-4 font-semibold text-on-primary hover:opacity-90 disabled:opacity-50"
        >
          적용
        </button>
      </div>
    </EditorDialog>
  )
}
