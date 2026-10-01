import "server-only"

// FastAPI 호출 래퍼 (ARCHITECTURE.md §13). 호출 경로는 항상 이렇다:
//
//   브라우저 → Next(서버) → FastAPI
//
// 브라우저는 FastAPI 를 **직접 호출하지 않는다**. 그래서
//   - CORS 가 필요 없고,
//   - JWT 가 브라우저 JS 에 노출되지 않으며,
//   - 401 을 만나도 `location.href` 로 튕길 수 없다(서버에는 location 이 없다).
//     세션 만료 처리는 proxy(쿠키 없음) + 각 페이지의 redirect("/login") 이 담당한다.
//
// ⛔ `import "server-only"` 를 지우지 마라. 이 모듈이 클라이언트 컴포넌트 그래프로 흘러들면
//    FASTAPI_URL(내부 주소)과 JWT 가 브라우저 번들에 실린다. server-only 는 그때 **빌드를 깨뜨려**
//    사고를 런타임이 아니라 CI 에서 잡는다.

const API_PREFIX = "/api/v1"

/**
 * 백엔드 응답 대기 상한(ms). 연결 **거부**는 즉시 실패하지만, 연결된 뒤 응답하지 않는 백엔드
 * (DB 락·스레드풀 고갈·방화벽 DROP)는 undici 기본값까지 SSR 렌더를 붙잡는다.
 * getSessionUser 가 모든 보호 페이지 렌더 경로에 있으므로, 백엔드 하나가 느려지면
 * Next 워커가 전부 묶인다.
 */
const DEFAULT_TIMEOUT_MS = 10_000

/** FastAPI 베이스 URL. 서버 전용 환경변수 — NEXT_PUBLIC_ 을 붙이면 안 된다. */
function baseUrl(): string {
  const raw = process.env.FASTAPI_URL
  if (!raw) {
    // ⛔ 프로덕션에서 조용히 localhost 로 폴백하면 서버는 정상 기동하고 모든 SSR 호출만
    //    실패해, 화면에는 "백엔드가 실행 중인지 확인하세요" 만 뜬다. 원인 추적이 가장 오래 걸리는
    //    실패 유형이므로 여기서 즉시 깨뜨린다.
    if (process.env.NODE_ENV === "production") {
      throw new Error("FASTAPI_URL 이 설정되지 않았습니다 (frontend/.env 를 확인하세요).")
    }
    return "http://localhost:8000"
  }
  return raw.replace(/\/+$/, "")
}

function timeoutMs(): number {
  const raw = Number(process.env.FASTAPI_TIMEOUT_MS)
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS
}

// 실패 분류·사용자 문구는 순수 로직이라 lib/fastapi-error.ts 로 분리했다 —
// 이 모듈은 server-only 라 vitest 가 로드하지 못하므로, 테스트 가능한 쪽에 두고
// 여기서 re-export 해 호출부의 import 경로를 유지한다.
import { FastapiError, kindFor, parseErrorBody } from "@/lib/fastapi-error"

export {
  FastapiError,
  fastapiErrorMessage,
  type FastapiFailureKind,
} from "@/lib/fastapi-error"

/** 오류 응답 본문을 FastapiError 로. 파싱 실패는 detail 없이. */
async function errorFrom(response: Response): Promise<FastapiError> {
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    // 본문 없음·HTML 오류 페이지 — 상태코드만으로 분류한다.
  }
  const { detail, code, validation } = parseErrorBody(body)
  return new FastapiError(kindFor(response.status), response.status, detail, { code, validation })
}

/** 쿼리 파라미터 값 — undefined·null·빈 문자열은 빠진다(`?q=` 같은 빈 검색 방지). */
export type QueryValue = string | number | boolean | null | undefined

interface FastapiRequest {
  /** `/auth/me` 처럼 `/api/v1` 이후 경로만 준다. */
  path: string
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"
  /**
   * 본문. 객체는 JSON 으로 직렬화한다. **FormData 는 multipart 로 그대로** 보낸다 —
   * Content-Type 을 직접 지정하지 않는다(fetch 가 boundary 를 포함해 채운다).
   */
  body?: unknown
  /** 쿼리 파라미터. 빈 값은 빠진다. */
  query?: Record<string, QueryValue>
  /** Bearer 로 주입할 JWT. 보호 API 는 lib/session 의 getSessionToken() 결과를 넘긴다. */
  token?: string | null
  /** 이 호출만 응답 대기 상한을 바꾼다(ms) — 큰 파일 업로드 등. */
  timeoutMs?: number
}

/** 백엔드 URL(`/api/v1` + path + 쿼리). */
function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const url = `${baseUrl()}${API_PREFIX}${path}`
  if (!query) return url
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue
    params.set(key, String(value))
  }
  const qs = params.toString()
  return qs ? `${url}?${qs}` : url
}

/** fetch 한 번 — 네트워크 실패(미기동·타임아웃)는 FastapiError("network") 로 정규화한다. */
async function send({ path, method = "GET", body, query, token, timeoutMs: timeout }: FastapiRequest): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json" }
  const isForm = typeof FormData !== "undefined" && body instanceof FormData
  if (body !== undefined && !isForm) headers["Content-Type"] = "application/json"
  if (token) headers.Authorization = `Bearer ${token}`

  try {
    return await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
      cache: "no-store",
      // 타임아웃도 AbortError 로 여기 catch 에 걸려 "network" 로 정규화된다 — 화면 문구를 그대로 쓴다.
      signal: AbortSignal.timeout(timeout ?? timeoutMs()),
    })
  } catch {
    throw new FastapiError("network", 0, null)
  }
}

/**
 * FastAPI 를 호출하고 JSON 을 반환한다. 실패는 전부 {@link FastapiError} 로 정규화된다.
 *
 * 캐시는 항상 `no-store` 다. 사용자별 응답(`/auth/me`)이나 실시간 상태(`/health`)를
 * Next 의 Data Cache 에 넣으면 **다른 사용자에게 캐시된 응답이 나간다**.
 */
export async function fastapiFetch<T>(request: FastapiRequest): Promise<T> {
  const response = await send(request)
  if (!response.ok) throw await errorFrom(response)

  // 204/205 는 본문이 없다. 또 리버스 프록시가 200 으로 HTML 오류 페이지를 끼워 넣으면
  // json() 이 SyntaxError 를 던지는데, 그대로 두면 FastapiError 가 아닌 예외가 새어 나가
  // 호출부의 원인 분류가 무너진다.
  if (response.status === 204 || response.status === 205) return undefined as T
  try {
    return (await response.json()) as T
  } catch {
    throw new FastapiError("server", response.status, null)
  }
}

/**
 * 응답을 **해석하지 않고** 그대로 돌려준다 — 파일 다운로드를 Route Handler 가 스트리밍으로
 * 넘겨줄 때만 쓴다(본문을 메모리에 올리지 않는다). 실패(비 2xx)는 fastapiFetch 와 같이 FastapiError.
 */
export async function fastapiStream(request: FastapiRequest): Promise<Response> {
  const response = await send(request)
  if (!response.ok) throw await errorFrom(response)
  return response
}
