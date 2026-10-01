// 표시용 포맷 — 서버 시각은 KST naive ISO 문자열("2026-10-02T10:00:00[.ffffff]")이다(ARCHITECTURE.md §10).
// 브라우저 시각대로 다시 해석하면 해외·UTC 환경에서 시각이 밀리므로 Date 로 바꾸지 않고 문자열로만 다룬다.

/** "2026-10-02T10:00:00" → "2026-10-02". 값이 없으면 "-". */
export function formatDate(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "-"
}

/** "2026-10-02T10:00:00" → "2026-10-02 10:00". 값이 없으면 "-". */
export function formatDateTime(value: string | null | undefined): string {
  return value ? value.slice(0, 16).replace("T", " ") : "-"
}

/** 서버 시각 → `<input type="datetime-local">` 값("YYYY-MM-DDTHH:mm"). */
export function toDateTimeLocal(value: string | null | undefined): string {
  return value ? value.slice(0, 16) : ""
}

/** `<input type="datetime-local">` 값 → 서버로 보낼 KST naive 문자열(빈 값은 null). */
export function fromDateTimeLocal(value: string): string | null {
  if (!value) return null
  return value.length === 16 ? `${value}:00` : value
}

/** 바이트 → "1.2 MB" 형식. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** 숫자 천 단위 구분. */
export function formatNumber(value: number): string {
  return value.toLocaleString("ko-KR")
}
