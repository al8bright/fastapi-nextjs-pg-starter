// 브라우저 전용 canvas 처리 (editor-spec §3·§4). jsdom 에는 canvas·createImageBitmap 이 없으므로
// 계산은 전부 lib/editor/imageTransform.ts 에 두고, 이 파일은 그리기·인코딩만 얇게 담당한다(테스트에서는 mock).
import {
  EDITOR_IMAGE_MAX_EDGE,
  EDITOR_IMAGE_QUALITY,
  fitWithin,
  normalizeRotation,
  outputFilename,
  outputMimeFor,
  type Rect,
  rotatedSize,
  type Size,
} from "@/lib/editor/imageTransform"

export type DecodedImage = ImageBitmap | HTMLImageElement

export interface TransformOptions {
  /** 회전 후 좌표계 기준 자르기 영역(원본 px). 없으면 전체. */
  crop?: Rect | null
  rotate?: number
  maxEdge?: number
  quality?: number
}

export interface TransformResult {
  blob: Blob
  filename: string
}

/** 디코드한 이미지의 원래 크기. */
export function sizeOf(image: DecodedImage): Size {
  return image instanceof HTMLImageElement
    ? { width: image.naturalWidth, height: image.naturalHeight }
    : { width: image.width, height: image.height }
}

/** 디코드 — EXIF 방향을 반영한다. createImageBitmap 이 없거나 실패하면 <img> 로 폴백. */
export async function decodeImage(file: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" })
    } catch {
      // 일부 브라우저는 옵션을 모르거나 형식을 못 읽는다 — <img> 폴백.
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** 디코드 자원 해제 (ImageBitmap 만 해당). */
export function releaseImage(image: DecodedImage | null | undefined): void {
  if (image && "close" in image) image.close()
}

let webpSupport: boolean | null = null
/** canvas 가 WebP 인코딩을 지원하는지 (구형 Safari 는 PNG 로 돌려준다). */
export function canEncodeWebp(): boolean {
  if (webpSupport === null) {
    try {
      const c = document.createElement("canvas")
      c.width = c.height = 1
      webpSupport = c.toDataURL("image/webp").startsWith("data:image/webp")
    } catch {
      webpSupport = false
    }
  }
  return webpSupport
}

/** 회전한 전체 이미지를 그린 canvas 를 만든다. */
function drawRotated(image: DecodedImage, rotate: number): HTMLCanvasElement {
  const r = normalizeRotation(rotate)
  const src = sizeOf(image)
  const out = rotatedSize(src, r)
  const canvas = document.createElement("canvas")
  canvas.width = out.width
  canvas.height = out.height
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("canvas 2d 컨텍스트를 만들 수 없습니다.")
  ctx.translate(out.width / 2, out.height / 2)
  ctx.rotate((r * Math.PI) / 180)
  ctx.drawImage(image, -src.width / 2, -src.height / 2)
  return canvas
}

/** 자르기 다이얼로그 미리보기 — 회전한 이미지를 표시 크기로 canvas 에 그린다. */
export function drawPreview(canvas: HTMLCanvasElement, image: DecodedImage, rotate: number, display: Size): void {
  const rotated = drawRotated(image, rotate)
  canvas.width = Math.max(1, Math.round(display.width))
  canvas.height = Math.max(1, Math.round(display.height))
  const ctx = canvas.getContext("2d")
  if (!ctx) return
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(rotated, 0, 0, canvas.width, canvas.height)
}

function toBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), mime, quality)
    } catch {
      resolve(null)
    }
  })
}

/**
 * 업로드 전 변환 (§4 ③④): 회전 → 자르기 → 긴 변 maxEdge 이하 축소 → WebP(불가 시 PNG/JPEG) 재인코딩.
 * GIF 는 변환하지 않는다. 어떤 단계든 실패하면 원본 파일을 그대로 돌려준다(서버가 최종 재인코딩).
 */
export async function transformImage(file: File, options: TransformOptions = {}): Promise<TransformResult> {
  const original: TransformResult = { blob: file, filename: file.name || "image" }
  const mime = outputMimeFor(file, canEncodeWebp())
  if (!mime) return original
  let image: DecodedImage | null = null
  try {
    image = await decodeImage(file)
    const rotated = drawRotated(image, options.rotate ?? 0)
    const crop = options.crop ?? { x: 0, y: 0, width: rotated.width, height: rotated.height }
    const out = fitWithin(crop.width, crop.height, options.maxEdge ?? EDITOR_IMAGE_MAX_EDGE)
    const canvas = document.createElement("canvas")
    canvas.width = out.width
    canvas.height = out.height
    const ctx = canvas.getContext("2d")
    if (!ctx) return original
    ctx.imageSmoothingQuality = "high"
    if (mime === "image/jpeg") {
      // JPEG 는 투명을 못 담는다 — 검은 배경 대신 흰 배경.
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, out.width, out.height)
    }
    ctx.drawImage(rotated, crop.x, crop.y, crop.width, crop.height, 0, 0, out.width, out.height)
    const blob = await toBlob(canvas, mime, options.quality ?? EDITOR_IMAGE_QUALITY)
    if (!blob) return original
    return { blob, filename: outputFilename(file.name, blob.type || mime) }
  } catch {
    return original
  } finally {
    releaseImage(image)
  }
}
