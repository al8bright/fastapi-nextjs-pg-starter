import { describe, expect, it } from "vitest"
import {
  centeredCrop,
  clampCrop,
  displayToSource,
  dragCrop,
  EDITOR_IMAGE_MAX_EDGE,
  EDITOR_IMAGE_QUALITY,
  fitWithin,
  IMAGE_WIDTH_PRESETS,
  normalizeRotation,
  outputFilename,
  outputMimeFor,
  previewScale,
  rotatedSize,
  sizeForWidth,
  VIDEO_SIZE_PRESETS,
  videoSizeForWidth,
} from "./imageTransform"

describe("상수", () => {
  it("명세 값과 같다", () => {
    expect(EDITOR_IMAGE_MAX_EDGE).toBe(1600)
    expect(EDITOR_IMAGE_QUALITY).toBe(0.85)
    expect(IMAGE_WIDTH_PRESETS).toEqual([320, 640, 960])
    expect(VIDEO_SIZE_PRESETS).toEqual([
      [320, 180],
      [640, 360],
      [960, 540],
    ])
  })
})

describe("fitWithin", () => {
  it("긴 변이 한도 이하면 그대로(키우지 않음)", () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 })
    expect(fitWithin(1600, 900, 1600)).toEqual({ width: 1600, height: 900 })
  })
  it("가로가 긴 이미지는 가로를 한도로", () => {
    expect(fitWithin(3200, 1800, 1600)).toEqual({ width: 1600, height: 900 })
  })
  it("세로가 긴 이미지는 세로를 한도로", () => {
    expect(fitWithin(1000, 4000, 1600)).toEqual({ width: 400, height: 1600 })
  })
  it("극단 비율에서도 1px 이상", () => {
    expect(fitWithin(100000, 10, 1600)).toEqual({ width: 1600, height: 1 })
  })
  it("1px 넘는 경계 — 1601 은 줄인다", () => {
    expect(fitWithin(1601, 1601, 1600)).toEqual({ width: 1600, height: 1600 })
  })
})

describe("normalizeRotation / rotatedSize", () => {
  it("각도를 0·90·180·270 으로", () => {
    expect(normalizeRotation(0)).toBe(0)
    expect(normalizeRotation(-90)).toBe(270)
    expect(normalizeRotation(450)).toBe(90)
    expect(normalizeRotation(360)).toBe(0)
  })
  it("90·270 이면 가로세로 교환", () => {
    expect(rotatedSize({ width: 4, height: 3 }, 90)).toEqual({ width: 3, height: 4 })
    expect(rotatedSize({ width: 4, height: 3 }, 180)).toEqual({ width: 4, height: 3 })
    expect(rotatedSize({ width: 4, height: 3 }, -90)).toEqual({ width: 3, height: 4 })
  })
})

describe("clampCrop", () => {
  const bounds = { width: 1000, height: 500 }
  it("경계 안 사각형은 가장자리를 반올림해 정수로만 맞춘다", () => {
    // 왼쪽 10.4→10, 오른쪽 110.6→111, 위 20.6→21, 아래 70.6→71
    expect(clampCrop({ x: 10.4, y: 20.6, width: 100.2, height: 50 }, bounds)).toEqual({
      x: 10,
      y: 21,
      width: 101,
      height: 50,
    })
  })
  it("음수 폭·높이(역방향 드래그)를 정규화한다", () => {
    expect(clampCrop({ x: 200, y: 200, width: -100, height: -50 }, bounds)).toEqual({
      x: 100,
      y: 150,
      width: 100,
      height: 50,
    })
  })
  it("경계 밖은 잘라 낸다", () => {
    expect(clampCrop({ x: -50, y: -50, width: 2000, height: 2000 }, bounds)).toEqual({
      x: 0,
      y: 0,
      width: 1000,
      height: 500,
    })
    expect(clampCrop({ x: 900, y: 400, width: 500, height: 500 }, bounds)).toEqual({
      x: 900,
      y: 400,
      width: 100,
      height: 100,
    })
  })
  it("최소 1px 을 보장한다(0 크기·경계 끝)", () => {
    expect(clampCrop({ x: 10, y: 10, width: 0, height: 0 }, bounds)).toEqual({ x: 10, y: 10, width: 1, height: 1 })
    expect(clampCrop({ x: 5000, y: 5000, width: 10, height: 10 }, bounds)).toEqual({
      x: 999,
      y: 499,
      width: 1,
      height: 1,
    })
  })
  it("비율이 있으면 좌상단 고정으로 긴 쪽을 줄인다", () => {
    expect(clampCrop({ x: 0, y: 0, width: 1000, height: 500 }, bounds, 1)).toEqual({
      x: 0,
      y: 0,
      width: 500,
      height: 500,
    })
    expect(clampCrop({ x: 0, y: 0, width: 400, height: 500 }, bounds, 16 / 9)).toEqual({
      x: 0,
      y: 0,
      width: 400,
      height: 225,
    })
  })
  it("결과는 항상 경계 안", () => {
    const r = clampCrop({ x: 990, y: 0, width: 100, height: 600 }, bounds, 4 / 3)
    expect(r.x + r.width).toBeLessThanOrEqual(1000)
    expect(r.y + r.height).toBeLessThanOrEqual(500)
    expect(r.width / r.height).toBeCloseTo(4 / 3, 0)
  })
})

describe("centeredCrop / displayToSource / previewScale", () => {
  it("비율 없는 가운데 사각형은 전체", () => {
    expect(centeredCrop({ width: 400, height: 300 })).toEqual({ x: 0, y: 0, width: 400, height: 300 })
  })
  it("1:1 이면 짧은 변 기준 정사각형을 가운데에", () => {
    expect(centeredCrop({ width: 400, height: 300 }, 1)).toEqual({ x: 50, y: 0, width: 300, height: 300 })
  })
  it("표시 좌표를 원본 좌표로 환산한다", () => {
    expect(displayToSource({ x: 10, y: 20, width: 30, height: 40 }, 0.5)).toEqual({ x: 20, y: 40, width: 60, height: 80 })
  })
  it("미리보기는 확대하지 않는다", () => {
    expect(previewScale({ width: 100, height: 100 }, 720, 440)).toBe(1)
    expect(previewScale({ width: 1440, height: 440 }, 720, 440)).toBe(0.5)
  })
})

describe("dragCrop", () => {
  const bounds = { width: 400, height: 300 }
  const start = { x: 100, y: 100, width: 100, height: 50 }
  it("move 는 크기를 유지하고 경계 안에 둔다", () => {
    expect(dragCrop(start, "move", 20, 10, bounds)).toEqual({ x: 120, y: 110, width: 100, height: 50 })
    expect(dragCrop(start, "move", 1000, -1000, bounds)).toEqual({ x: 300, y: 0, width: 100, height: 50 })
  })
  it("se 핸들은 오른쪽 아래를 늘린다", () => {
    expect(dragCrop(start, "se", 50, 20, bounds)).toEqual({ x: 100, y: 100, width: 150, height: 70 })
  })
  it("nw 핸들은 오른쪽 아래를 고정한다", () => {
    expect(dragCrop(start, "nw", -50, -20, bounds)).toEqual({ x: 50, y: 80, width: 150, height: 70 })
  })
  it("반대편을 넘으면 뒤집힌다", () => {
    expect(dragCrop(start, "e", -150, 0, bounds)).toEqual({ x: 50, y: 100, width: 50, height: 50 })
  })
  it("경계를 넘지 않는다", () => {
    const r = dragCrop(start, "se", 1000, 1000, bounds)
    expect(r.x + r.width).toBeLessThanOrEqual(400)
    expect(r.y + r.height).toBeLessThanOrEqual(300)
  })
  it("비율이 있으면 유지한다(경계에 닿아도)", () => {
    const r = dragCrop(start, "se", 1000, 0, bounds, 1)
    expect(r.width).toBeCloseTo(r.height)
    expect(r.x + r.width).toBeLessThanOrEqual(400.0001)
    expect(r.y + r.height).toBeLessThanOrEqual(300.0001)
  })
  it("0 크기에서 새로 그리기(se)", () => {
    expect(dragCrop({ x: 10, y: 10, width: 0, height: 0 }, "se", 30, 20, bounds, null, 0)).toEqual({
      x: 10,
      y: 10,
      width: 30,
      height: 20,
    })
  })
})

describe("sizeForWidth", () => {
  const natural = { width: 1600, height: 900 }
  it("폭에 맞춰 비율대로 높이를 정한다", () => {
    expect(sizeForWidth(natural, 640)).toEqual({ width: 640, height: 360 })
  })
  it("원본보다 키우지 않는다", () => {
    expect(sizeForWidth(natural, 5000)).toEqual({ width: 1600, height: 900 })
  })
  it("최소 80", () => {
    expect(sizeForWidth(natural, 10)).toEqual({ width: 80, height: 45 })
    expect(sizeForWidth(natural, 80)).toEqual({ width: 80, height: 45 })
  })
  it("원본이 80 보다 작으면 원본 폭", () => {
    expect(sizeForWidth({ width: 50, height: 50 }, 10)).toEqual({ width: 50, height: 50 })
  })
  it("NaN 은 원본 폭", () => {
    expect(sizeForWidth(natural, Number.NaN)).toEqual(natural)
  })
})

describe("videoSizeForWidth", () => {
  it("16:9 높이, [200,1280] 제한", () => {
    expect(videoSizeForWidth(640)).toEqual({ width: 640, height: 360 })
    expect(videoSizeForWidth(100)).toEqual({ width: 200, height: 113 })
    expect(videoSizeForWidth(5000)).toEqual({ width: 1280, height: 720 })
  })
})

describe("outputMimeFor / outputFilename", () => {
  it("GIF 는 변환하지 않는다", () => {
    expect(outputMimeFor({ type: "image/gif" }, true)).toBeNull()
    expect(outputMimeFor({ type: "image/gif" }, false)).toBeNull()
  })
  it("WebP 가능하면 webp", () => {
    expect(outputMimeFor({ type: "image/png" }, true)).toBe("image/webp")
    expect(outputMimeFor({ type: "image/jpeg" }, true)).toBe("image/webp")
  })
  it("WebP 불가면 투명 가능 형식은 png, 나머지는 jpeg", () => {
    expect(outputMimeFor({ type: "image/png" }, false)).toBe("image/png")
    expect(outputMimeFor({ type: "image/webp" }, false)).toBe("image/png")
    expect(outputMimeFor({ type: "image/jpeg" }, false)).toBe("image/jpeg")
  })
  it("확장자를 결과 형식에 맞춘다", () => {
    expect(outputFilename("photo.JPG", "image/webp")).toBe("photo.webp")
    expect(outputFilename("a.b.png", "image/jpeg")).toBe("a.b.jpg")
    expect(outputFilename("", "image/png")).toBe("image.png")
    expect(outputFilename("noext", "image/webp")).toBe("noext.webp")
  })
})

describe("rotatedSize + clampCrop 조합", () => {
  it("회전한 좌표계 경계로 자른다", () => {
    const b = rotatedSize({ width: 400, height: 200 }, 90)
    expect(clampCrop({ x: 0, y: 0, width: 400, height: 400 }, b)).toEqual({ x: 0, y: 0, width: 200, height: 400 })
  })
})
