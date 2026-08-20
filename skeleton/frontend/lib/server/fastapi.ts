import "server-only"

// FastAPI 호출 래퍼 (architecture.md §13).
// React SPA 판의 src/lib/api.ts(axios + 401 인터셉터)에 대응한다. 아키텍처가 다르다:
//
//   브라우저 → Next(서버) → FastAPI
//
// 브라우저는 FastAPI 를 **직접 호출하지 않는다**. 그래서
//   - CORS 가 필요 없고,
//   - JWT 가 브라우저 JS 에 노출되지 않으며,
//   - 401 을 만나도 `location.href` 로 튕길 수 없다(서버에는 location 이 없다).
//     세션 만료 처리는 middleware(쿠키 없음) + 각 페이지의 redirect("/login") 이 담당한다.
//
// ⛔ `import "server-only"` 를 지우지 마라. 이 모듈이 클라이언트 컴포넌트 그래프로 흘러들면
//    FASTAPI_URL(내부 주소)과 JWT 가 브라우저 번들에 실린다. server-only 는 그때 **빌드를 깨뜨려**
//    사고를 런타임이 아니라 CI 에서 잡는다.

const API_PREFIX = "/api/v1"

/** FastAPI 베이스 URL. 서버 전용 환경변수 — NEXT_PUBLIC_ 을 붙이면 안 된다. */
function baseUrl(): string {
  return (process.env.FASTAPI_URL ?? "http://localhost:8000").replace(/\/+$/, "")
}

/** 실패 원인 분류 — 화면이 "인증 실패"와 "백엔드 미기동"을 구분할 수 있어야 한다. */
export type FastapiFailureKind =
  /** 백엔드에 닿지 못함 (미기동·DNS·타임아웃) */
  | "network"
  /** 401 — 토큰 없음/만료/무효, 또는 로그인 자격증명 불일치 */
  | "unauthorized"
  /** 422 — 요청 본문 검증 실패 */
  | "validation"
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

function kindFor(status: number): FastapiFailureKind {
  if (status === 401) return "unauthorized"
  if (status === 422) return "validation"
  if (status >= 500) return "server"
  return "http"
}

/** 응답 본문에서 문자열 `detail` 만 뽑는다. 파싱 실패는 조용히 null. */
async function readDetail(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json()
    const detail = (body as { detail?: unknown } | null)?.detail
    return typeof detail === "string" && detail.trim() !== "" ? detail : null
  } catch {
    return null
  }
}

interface FastapiRequest {
  /** `/auth/me` 처럼 `/api/v1` 이후 경로만 준다. */
  path: string
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"
  /** JSON 직렬화할 본문. */
  body?: unknown
  /** Bearer 로 주입할 JWT. 보호 API 는 lib/session 의 getSessionToken() 결과를 넘긴다. */
  token?: string | null
}

/**
 * FastAPI 를 호출하고 JSON 을 반환한다. 실패는 전부 {@link FastapiError} 로 정규화된다.
 *
 * 캐시는 항상 `no-store` 다. 사용자별 응답(`/auth/me`)이나 실시간 상태(`/health`)를
 * Next 의 Data Cache 에 넣으면 **다른 사용자에게 캐시된 응답이 나간다**.
 */
export async function fastapiFetch<T>({
  path,
  method = "GET",
  body,
  token,
}: FastapiRequest): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" }
  if (body !== undefined) headers["Content-Type"] = "application/json"
  if (token) headers.Authorization = `Bearer ${token}`

  let response: Response
  try {
    response = await fetch(`${baseUrl()}${API_PREFIX}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    })
  } catch {
    throw new FastapiError("network", 0, null)
  }

  if (!response.ok) {
    throw new FastapiError(kindFor(response.status), response.status, await readDetail(response))
  }

  return (await response.json()) as T
}

/**
 * 실패 원인을 사용자 문구로 바꾼다 (React 판 loginErrorMessage 와 동일한 분기).
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
    case "server":
      return "서버 오류가 발생했습니다. 잠시 후 다시 시도하세요."
    default:
      return error.detail ?? "요청 처리 중 오류가 발생했습니다."
  }
}
