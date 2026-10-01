import { FastapiError } from "@/lib/server/fastapi"
import { streamAdminAttachment } from "@/lib/server/notices"

// 관리자 첨부 다운로드 Route Handler — GET /admin/notices/<id>/attachments/<attachmentId>
//
// 왜 Route Handler 인가: 관리자 다운로드(`GET /api/v1/admin/notices/{id}/attachments/{aid}`)는 임시저장 공지도
// 내려주는 대신 **Bearer 토큰**이 필요하다. 브라우저는 토큰을 모르므로(httpOnly 쿠키, §14) 공개 다운로드처럼
// rewrite 로 넘길 수 없다. 여기서 세션 쿠키의 access 토큰으로 백엔드를 부르고, 본문을 메모리에 올리지 않고
// **스트리밍**으로 넘긴다. Content-Disposition(RFC 5987 파일명)은 백엔드 값을 그대로 전달한다.
// 경로가 /admin 아래라 proxy 가 먼저 세션 쿠키를 확인하고(없으면 로그인으로), 권한(403)은 백엔드가 판정한다.
// (스킬의 "app/api/** 남발 금지" 원칙의 예외 — 쿠키 세션을 Bearer 로 바꿔 파일을 중계하는 일은 Server Action 이 못 한다.)

/** 백엔드 응답에서 그대로 넘길 헤더. 나머지(Set-Cookie·서버 정보 등)는 버린다. */
const PASS_HEADERS = ["content-type", "content-length", "content-disposition", "last-modified", "etag"] as const

function parseId(value: string): number | null {
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : null
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  const { id, attachmentId } = await params
  const noticeId = parseId(id)
  const aid = parseId(attachmentId)
  if (noticeId === null || aid === null) return new Response("Not Found", { status: 404 })

  let upstream: Response
  try {
    upstream = await streamAdminAttachment(noticeId, aid)
  } catch (error) {
    const status = error instanceof FastapiError && error.status ? error.status : 502
    const text =
      status === 401
        ? "로그인이 만료되었습니다. 다시 로그인한 뒤 내려받으세요."
        : status === 403
          ? "이 파일을 내려받을 권한이 없습니다."
          : status === 404
            ? "파일을 찾을 수 없습니다. 이미 삭제되었을 수 있습니다."
            : "파일을 내려받지 못했습니다. 잠시 후 다시 시도하세요."
    return new Response(text, {
      status,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    })
  }

  const headers = new Headers({
    // 업로드 파일이 HTML 등으로 해석되지 않게 — 응답 헤더 기본값(next.config.ts)과 같지만 명시해 둔다.
    "X-Content-Type-Options": "nosniff",
    // 임시저장 첨부는 관리자 전용이다 — 브라우저·중간 캐시에 남기지 않는다.
    "Cache-Control": "no-store",
  })
  for (const name of PASS_HEADERS) {
    const value = upstream.headers.get(name)
    if (value) headers.set(name, value)
  }
  return new Response(upstream.body, { status: 200, headers })
}
