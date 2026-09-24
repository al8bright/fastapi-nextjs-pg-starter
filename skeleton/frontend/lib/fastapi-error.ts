// FastAPI 실패 분류와 사용자 문구 — 순수 로직이라 **의존성이 없어야 한다**.
//
// lib/server/fastapi.ts 에서 분리한 이유: 그 모듈은 `server-only` 를 물고 있어
// vitest(jsdom)가 **로드조차 못 한다** (architecture.md §13 프론트엔드 테스트).
// 오류 분기는 네트워크도 요청 컨텍스트도 필요 없는 순수 함수이므로 여기로 뽑아
// lib/fastapi-error.test.ts 로 고정한다. 호출부는 기존대로 lib/server/fastapi.ts 가
// re-export 하는 이름을 쓰면 된다 — import 경로를 바꿀 필요가 없다.

/** 실패 원인 분류 — 화면이 "인증 실패"와 "백엔드 미기동"을 구분할 수 있어야 한다. */
export type FastapiFailureKind =
  /** 백엔드에 닿지 못함 (미기동·DNS·타임아웃) */
  | "network"
  /** 401 — 토큰 없음/만료/무효, 또는 로그인 자격증명 불일치 */
  | "unauthorized"
  /** 422 — 요청 본문 검증 실패 */
  | "validation"
  /** 429 — 시도 횟수 제한 (로그인 브루트포스 차단) */
  | "throttled"
  /** 5xx */
  | "server"
  /** 그 밖의 4xx */
  | "http"

export class FastapiError extends Error {
  readonly kind: FastapiFailureKind
  /** HTTP 상태코드. 네트워크 실패면 0. */
  readonly status: number
  /** 서버 `detail` 이 **문자열일 때만** 담는다 (FastAPI 422 는 객체 배열이라 그대로 보여줄 수 없다). */
  readonly detail: string | null

  constructor(kind: FastapiFailureKind, status: number, detail: string | null) {
    super(`FastAPI ${kind} (${status})${detail ? `: ${detail}` : ""}`)
    this.name = "FastapiError"
    this.kind = kind
    this.status = status
    this.detail = detail
  }
}

export function kindFor(status: number): FastapiFailureKind {
  if (status === 401) return "unauthorized"
  if (status === 422) return "validation"
  if (status === 429) return "throttled"
  if (status >= 500) return "server"
  return "http"
}

/**
 * 실패 원인을 사용자 문구로 바꾼다 — kind 별로 분기한다.
 * 모든 실패를 "아이디 또는 비밀번호"로 표시하면 422·네트워크 오류·500 을 오진한다.
 */
export function fastapiErrorMessage(error: unknown): string {
  if (!(error instanceof FastapiError)) return "알 수 없는 오류가 발생했습니다."
  switch (error.kind) {
    case "network":
      return "서버에 연결할 수 없습니다. 백엔드가 실행 중인지 확인하세요."
    // 401 문구는 고정 — 계정 존재 여부를 노출하지 않는다(백엔드도 메시지를 통일한다).
    case "unauthorized":
      return "아이디 또는 비밀번호가 올바르지 않습니다."
    case "validation":
      return error.detail ?? "입력값을 확인하세요. (비밀번호는 UTF-8 기준 72 bytes 이하)"
    // 429 는 자격증명 오류와 구분해 보여준다 — "비밀번호가 틀렸다" 로 오진하면
    // 사용자가 재시도를 반복해 제한이 더 길어진다. 백엔드 detail(대기 시간 안내)이 있으면 우선한다.
    case "throttled":
      return error.detail ?? "시도가 너무 많습니다. 잠시 후 다시 시도하세요."
    case "server":
      return "서버 오류가 발생했습니다. 잠시 후 다시 시도하세요."
    default:
      return error.detail ?? "요청 처리 중 오류가 발생했습니다."
  }
}
