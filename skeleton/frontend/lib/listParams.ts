// 목록 화면의 page·q 등 URL 검색 파라미터 처리 — 순수 함수 (서버 컴포넌트·클라이언트 공용).
// 목록 상태를 URL 에 두면 새로고침·뒤로 가기·링크 공유에도 그대로 유지된다.
// 서버 컴포넌트의 searchParams 는 `Record<string, string | string[] | undefined>` 다(같은 키가 여러 번 오면 배열).

export type SearchParams = Record<string, string | string[] | undefined>

/** 키의 첫 값(배열이면 첫 원소). 없으면 "". */
export function firstParam(params: SearchParams, key: string): string {
  const raw = params[key]
  const value = Array.isArray(raw) ? raw[0] : raw
  return typeof value === "string" ? value : ""
}

/** page — 양의 정수만, 아니면 1. */
export function parsePage(params: SearchParams): number {
  const n = Number(firstParam(params, "page") || "1")
  return Number.isInteger(n) && n > 0 ? n : 1
}

/** 검색어 — 앞뒤 공백 제거, 백엔드 상한(100자)으로 자른다. */
export function parseQuery(params: SearchParams, key = "q"): string {
  return firstParam(params, key).trim().slice(0, 100)
}

/** 양의 정수 id 파라미터(예: user_id). 아니면 undefined. */
export function parseIdParam(params: SearchParams, key: string): number | undefined {
  const n = Number(firstParam(params, key))
  return Number.isInteger(n) && n > 0 ? n : undefined
}

/**
 * 목록 링크 — `base` 에 `values` 를 쿼리로 붙인다. 빈 값은 빼고, page=1 은 생략한다(기본값).
 * 예: listHref("/notices", { q: "점검", page: 2 }) → "/notices?q=%EC%A0%90%EA%B2%80&page=2"
 */
export function listHref(base: string, values: Record<string, string | number | null | undefined>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === "") continue
    if (key === "page" && Number(value) === 1) continue
    params.set(key, String(value))
  }
  const qs = params.toString()
  return qs ? `${base}?${qs}` : base
}

/** 현재 페이지 주변 최대 5개 번호. */
export function pageWindow(page: number, last: number): number[] {
  const start = Math.max(1, Math.min(page - 2, last - 4))
  const end = Math.min(last, start + 4)
  return Array.from({ length: end - start + 1 }, (_, i) => start + i)
}
