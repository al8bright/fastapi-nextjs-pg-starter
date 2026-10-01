// 이미지 변환·자르기·크기 조절의 순수 계산 (editor-spec §3·§4). canvas 는 components/editor/imageCanvas.ts 에서만 쓴다.

export interface Size {
  width: number
  height: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** 회전 각도 — 90° 단위만 지원한다(자유 회전 없음). */
export type Rotation = 0 | 90 | 180 | 270

/** 자르기 핸들 — 모서리 4개 + 변 4개. "move" 는 선택 영역 내부 드래그(이동). */
export type CropHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw"

/** 업로드 전 긴 변 상한(px). 서버는 2000 초과를 다시 줄인다. */
export const EDITOR_IMAGE_MAX_EDGE = 1600
/** canvas.toBlob 품질(WebP·JPEG). */
export const EDITOR_IMAGE_QUALITY = 0.85
/** 이미지 크기 프리셋(폭 px): 소·중·대. "원본"은 natural 폭. */
export const IMAGE_WIDTH_PRESETS = [320, 640, 960] as const
/** 이미지 최소 폭(px). */
export const IMAGE_MIN_WIDTH = 80
/** 영상 크기 프리셋 [폭, 높이] — 16:9 고정. "전체 폭"은 VIDEO_MAX_WIDTH. */
export const VIDEO_SIZE_PRESETS = [
  [320, 180],
  [640, 360],
  [960, 540],
] as const
export const VIDEO_MIN_WIDTH = 200
export const VIDEO_MAX_WIDTH = 1280
export const VIDEO_DEFAULT_WIDTH = 640
/** 자르기 비율 프리셋 (null = 자유). */
export const CROP_RATIOS: ReadonlyArray<{ label: string; value: number | null }> = [
  { label: "자유", value: null },
  { label: "16:9", value: 16 / 9 },
  { label: "4:3", value: 4 / 3 },
  { label: "1:1", value: 1 },
]

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** 긴 변이 maxEdge 이하가 되도록 비율을 유지해 줄인다. 이미 작으면 그대로(키우지 않음). */
export function fitWithin(width: number, height: number, maxEdge: number): Size {
  const w = Math.max(1, Math.round(width))
  const h = Math.max(1, Math.round(height))
  const longest = Math.max(w, h)
  if (longest <= maxEdge) return { width: w, height: h }
  const scale = maxEdge / longest
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) }
}

/** 각도를 0·90·180·270 으로 정규화한다(음수·360 이상 허용). */
export function normalizeRotation(deg: number): Rotation {
  const r = (((Math.round(deg / 90) * 90) % 360) + 360) % 360
  return r as Rotation
}

/** 회전 후 크기 — 90°·270° 면 가로·세로가 바뀐다. */
export function rotatedSize(size: Size, rotate: number): Size {
  const r = normalizeRotation(rotate)
  return r === 90 || r === 270 ? { width: size.height, height: size.width } : { ...size }
}

/**
 * 자르기 사각형을 이미지 경계 안으로 맞춘다(정수 px).
 * - 가장자리 좌표를 반올림한다(폭이 아니라 변을 정수로).
 * - 음수 폭·높이(왼쪽·위로 드래그)는 정규화한다.
 * - 경계 밖은 잘라 내고, 최소 1px 을 보장한다.
 * - ratio(폭/높이)가 있으면 좌상단을 고정한 채 긴 쪽을 줄여 비율을 맞춘다.
 */
export function clampCrop(rect: Rect, bounds: Size, ratio?: number | null): Rect {
  const bw = Math.max(1, Math.round(bounds.width))
  const bh = Math.max(1, Math.round(bounds.height))
  let x = Math.round(Math.min(rect.x, rect.x + rect.width))
  let y = Math.round(Math.min(rect.y, rect.y + rect.height))
  let right = Math.round(Math.max(rect.x, rect.x + rect.width))
  let bottom = Math.round(Math.max(rect.y, rect.y + rect.height))
  x = clamp(x, 0, bw - 1)
  y = clamp(y, 0, bh - 1)
  right = clamp(right, x + 1, bw)
  bottom = clamp(bottom, y + 1, bh)
  let width = right - x
  let height = bottom - y
  if (ratio && ratio > 0 && Number.isFinite(ratio)) {
    if (width / height > ratio) width = Math.max(1, Math.round(height * ratio))
    else height = Math.max(1, Math.round(width / ratio))
  }
  return { x, y, width, height }
}

/** 경계 안에서 비율을 지키는 가장 큰 가운데 사각형(비율 없으면 전체). */
export function centeredCrop(bounds: Size, ratio?: number | null): Rect {
  let width = bounds.width
  let height = bounds.height
  if (ratio && ratio > 0) {
    if (width / height > ratio) width = height * ratio
    else height = width / ratio
  }
  return { x: (bounds.width - width) / 2, y: (bounds.height - height) / 2, width, height }
}

/** 표시 좌표(미리보기)의 사각형을 원본 좌표로 환산한다. scale = 표시 / 원본. */
export function displayToSource(rect: Rect, scale: number): Rect {
  const s = scale > 0 ? scale : 1
  return { x: rect.x / s, y: rect.y / s, width: rect.width / s, height: rect.height / s }
}

/** 미리보기 표시 배율 — 원본을 maxWidth×maxHeight 상자 안에 맞춘다(확대하지 않음). */
export function previewScale(size: Size, maxWidth: number, maxHeight: number): number {
  return Math.min(1, maxWidth / size.width, maxHeight / size.height)
}

/**
 * 자르기 선택 영역 드래그 계산(표시 좌표, 실수). start 는 드래그 시작 시점의 사각형.
 * - "move": 크기를 유지한 채 경계 안에서 이동.
 * - 핸들: 반대편 변을 고정하고 늘리거나 줄인다. 교차하면 뒤집힌다. 비율이 있으면 고정 변을 기준으로 맞춘다.
 */
export function dragCrop(
  start: Rect,
  mode: CropHandle | "move",
  dx: number,
  dy: number,
  bounds: Size,
  ratio?: number | null,
  minSize = 8,
): Rect {
  if (mode === "move") {
    return {
      x: clamp(start.x + dx, 0, Math.max(0, bounds.width - start.width)),
      y: clamp(start.y + dy, 0, Math.max(0, bounds.height - start.height)),
      width: start.width,
      height: start.height,
    }
  }
  let left = start.x
  let top = start.y
  let right = start.x + start.width
  let bottom = start.y + start.height
  if (mode.includes("w")) left += dx
  if (mode.includes("e")) right += dx
  if (mode.includes("n")) top += dy
  if (mode.includes("s")) bottom += dy
  // 핸들이 반대편을 넘어가면 뒤집는다. 뒤집힌 축에서는 고정 변이 반대로 바뀐다.
  let flipX = false
  let flipY = false
  if (right < left) {
    ;[left, right] = [right, left]
    flipX = true
  }
  if (bottom < top) {
    ;[top, bottom] = [bottom, top]
    flipY = true
  }
  left = clamp(left, 0, bounds.width)
  right = clamp(right, 0, bounds.width)
  top = clamp(top, 0, bounds.height)
  bottom = clamp(bottom, 0, bounds.height)
  let width = Math.max(minSize, right - left)
  let height = Math.max(minSize, bottom - top)

  // 움직인 쪽(커서가 있는 쪽): 뒤집히지 않았으면 핸들 방향, 뒤집혔으면 반대.
  const movesWest = mode.includes("w") !== flipX
  const movesNorth = mode.includes("n") !== flipY
  const horizontal = mode.includes("e") || mode.includes("w")
  const vertical = mode.includes("n") || mode.includes("s")

  if (ratio && ratio > 0) {
    if (horizontal && !vertical) height = width / ratio
    else if (vertical && !horizontal) width = height * ratio
    else if (width / height > ratio) width = height * ratio
    else height = width / ratio
  }
  // 고정 변(커서 반대편) — 뒤집힌 뒤의 좌표 기준. 경계를 넘으면 비율을 유지하며 줄인다.
  const anchorX = movesWest ? right : left
  const anchorY = movesNorth ? bottom : top
  const maxW = horizontal ? (movesWest ? anchorX : bounds.width - anchorX) : bounds.width - left
  const maxH = vertical ? (movesNorth ? anchorY : bounds.height - anchorY) : bounds.height - top
  const shrink = Math.min(1, maxW / width, maxH / height)
  width *= shrink
  height *= shrink

  const x = horizontal && movesWest ? anchorX - width : horizontal ? anchorX : left
  const y = vertical && movesNorth ? anchorY - height : vertical ? anchorY : top
  return {
    x: clamp(x, 0, Math.max(0, bounds.width - width)),
    y: clamp(y, 0, Math.max(0, bounds.height - height)),
    width,
    height,
  }
}

/**
 * 이미지 표시 크기 — 폭을 [80, 원본 폭] 으로 제한하고 비율대로 높이를 정한다(원본보다 키우지 않음).
 * 원본 폭이 80 보다 작으면 원본 폭을 쓴다.
 */
export function sizeForWidth(natural: Size, width: number): Size {
  const nw = Math.max(1, Math.round(natural.width))
  const nh = Math.max(1, Math.round(natural.height))
  const min = Math.min(IMAGE_MIN_WIDTH, nw)
  const w = clamp(Math.round(Number.isFinite(width) ? width : nw), min, nw)
  return { width: w, height: Math.max(1, Math.round((w * nh) / nw)) }
}

/** 영상 크기 — 폭을 [200, 1280] 으로 제한하고 16:9 높이를 정한다. */
export function videoSizeForWidth(width: number): Size {
  const w = clamp(Math.round(Number.isFinite(width) ? width : VIDEO_DEFAULT_WIDTH), VIDEO_MIN_WIDTH, VIDEO_MAX_WIDTH)
  return { width: w, height: Math.round((w * 9) / 16) }
}

/**
 * 업로드 전 재인코딩 MIME.
 * - GIF 는 변환하지 않는다(애니메이션 보존) → null.
 * - WebP 인코딩이 되면 image/webp.
 * - 아니면(구형 Safari 등) 투명도가 있을 수 있는 형식(PNG·WebP)은 image/png, 나머지는 image/jpeg.
 */
export function outputMimeFor(
  file: { type: string },
  canUseWebp: boolean,
): "image/webp" | "image/png" | "image/jpeg" | null {
  if (file.type === "image/gif") return null
  if (canUseWebp) return "image/webp"
  return file.type === "image/png" || file.type === "image/webp" ? "image/png" : "image/jpeg"
}

const EXT_BY_MIME: Record<string, string> = {
  "image/webp": "webp",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
}

/** 변환 결과 MIME 에 맞게 파일 확장자를 바꾼다(`photo.JPG` + webp → `photo.webp`). */
export function outputFilename(name: string, mime: string): string {
  const ext = EXT_BY_MIME[mime]
  const base = (name || "image").replace(/\.[^./\\]*$/, "") || "image"
  return ext ? `${base}.${ext}` : name || "image"
}
