// 업로드 사전 검사 — 백엔드 허용 목록·상한과 같은 값이다(app/core/storage.py ATTACHMENT_TYPES,
// MAX_ATTACHMENT_UPLOAD_MB). 서버가 최종 판정하므로 여기 검사는 왕복을 줄이는 용도다.
// 백엔드 설정(.env)에서 상한을 바꾸면 이 값도 맞춘다.

export const ATTACHMENT_EXTENSIONS = [
  "pdf", "hwp", "hwpx", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv", "zip", "png", "jpg", "jpeg",
] as const

export const MAX_ATTACHMENT_MB = 20
export const MAX_ATTACHMENTS_PER_NOTICE = 10
export const MAX_IMAGE_MB = 5

/** `<input accept>` 값. */
export const ATTACHMENT_ACCEPT = ATTACHMENT_EXTENSIONS.map((ext) => `.${ext}`).join(",")

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".")
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ""
}

/** 첨부 파일 문제 문구(문제 없으면 null). */
export function attachmentProblem(file: { name: string; size: number }): string | null {
  const ext = extensionOf(file.name)
  if (!(ATTACHMENT_EXTENSIONS as readonly string[]).includes(ext)) {
    return `허용되지 않는 형식입니다. (${ATTACHMENT_EXTENSIONS.join(", ")})`
  }
  if (file.size === 0) return "빈 파일은 올릴 수 없습니다."
  if (file.size > MAX_ATTACHMENT_MB * 1024 * 1024) return `${MAX_ATTACHMENT_MB}MB 이하만 올릴 수 있습니다.`
  return null
}
