import { FastapiError } from "@/lib/fastapi-error"

// 관리자·공지 작업의 오류 → 한국어 사용자 문구 (ARCHITECTURE.md §13 "오류 표시는 원인으로 구분한다").
// 도메인 오류 응답은 {"detail": str, "code": str}, FastAPI 검증 422 는 detail 이 객체 배열이다
// (FastapiError.code / .validation 으로 분해돼 온다 — lib/fastapi-error.ts 의 parseErrorBody).
//
// 로그인 폼 문구(fastapiErrorMessage)와 분리한 이유: 그쪽은 401 을 "아이디 또는 비밀번호" 로 고정해야 하고,
// 여기서는 401 이 "세션 만료" 다. 같은 함수로 두면 한쪽이 반드시 오진된다.
// Server Action 이 이 함수로 문구를 만들어 상태 객체로 돌려준다 — 순수 함수라 Vitest 로 고정한다.

/** 도메인 오류 코드별 문구 — 백엔드 app/api/errors.py 의 STATUS_BY_CODE 와 짝이다. */
const MESSAGE_BY_CODE: Record<string, string> = {
  self_modification: "자기 자신의 권한이나 활성 상태는 바꿀 수 없습니다.",
  last_admin: "마지막 활성 관리자는 강등하거나 비활성화할 수 없습니다. 다른 관리자를 먼저 지정하세요.",
  too_many_attachments: "첨부 파일은 공지당 10개까지 올릴 수 있습니다.",
  empty_body: "본문을 입력하세요.",
  invalid_image: "이미지를 처리할 수 없습니다. PNG·JPEG·WebP·GIF 파일인지 확인하세요.",
  invalid_image_key: "이미지를 다시 올려 주세요. (올린 이미지를 찾을 수 없습니다)",
  unsupported_file_type: "허용되지 않는 파일 형식입니다.",
  invalid_filename: "파일 이름이 올바르지 않습니다. 확장자가 있는 파일인지 확인하세요.",
  invalid_reorder: "순서를 바꿀 수 없습니다. 목록을 새로고침한 뒤 다시 시도하세요.",
  not_found: "대상을 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.",
}

export interface ApiErrorOptions {
  /** 413 문구에 넣을 상한(MB). */
  maxMb?: number
  /** 어떤 분기에도 맞지 않을 때 쓸 문구. */
  fallback?: string
}

export function apiErrorMessage(error: unknown, options: ApiErrorOptions = {}): string {
  const fallback = options.fallback ?? "요청을 처리하지 못했습니다. 잠시 후 다시 시도하세요."
  if (!(error instanceof FastapiError)) return fallback
  if (error.kind === "network") return "서버에 연결할 수 없습니다. 백엔드가 실행 중인지 확인하세요."
  const { status, code, detail } = error
  if (code && MESSAGE_BY_CODE[code]) {
    // 형식 오류는 서버가 허용 목록을 detail 에 담아 준다 — 그 편이 더 구체적이다.
    if (code === "unsupported_file_type" && detail) return detail
    return MESSAGE_BY_CODE[code]
  }
  if (status === 413 || code === "file_too_large") {
    return options.maxMb ? `파일이 너무 큽니다. ${options.maxMb}MB 이하만 올릴 수 있습니다.` : "파일이 너무 큽니다."
  }
  if (status === 401) return "로그인이 만료되었습니다. 다시 로그인하세요."
  if (status === 403) return "이 작업을 할 권한이 없습니다."
  if (status === 404) return MESSAGE_BY_CODE.not_found
  if (status === 422) return detail ?? error.validation ?? "입력값을 확인하세요."
  if (status >= 500) return "서버 오류가 발생했습니다. 잠시 후 다시 시도하세요."
  return detail ?? fallback
}

/** 에디터 이미지 업로드 오류 → 문구. 상태코드로 구분한다(모든 실패를 한 문구로 뭉개지 않는다). */
export function editorUploadErrorMessage(error: unknown): string {
  if (!(error instanceof FastapiError)) return "이미지를 올리지 못했습니다. 잠시 후 다시 시도해 주세요."
  if (error.kind === "network") return "네트워크 오류로 이미지를 올리지 못했습니다. 연결을 확인해 주세요."
  switch (error.status) {
    case 413:
      return "이미지는 5MB 이하만 올릴 수 있습니다."
    case 415:
      return "PNG·JPEG·WebP·GIF 이미지만 올릴 수 있습니다."
    case 422:
      // FastAPI 검증 오류의 detail 은 객체 배열이다 — 문자열일 때만 그대로 보여 준다.
      return error.detail ?? "이미지를 처리할 수 없습니다. 다른 파일로 다시 시도해 주세요."
    case 401:
      return "로그인이 만료되었습니다. 다시 로그인한 뒤 올려 주세요."
    case 403:
      return "이미지를 올릴 권한이 없습니다."
    default:
      return "이미지를 올리지 못했습니다. 잠시 후 다시 시도해 주세요."
  }
}
