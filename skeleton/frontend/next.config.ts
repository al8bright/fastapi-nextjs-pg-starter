import type { NextConfig } from "next"

// Next 설정 (ARCHITECTURE.md §13).
// 이 스타터는 정적 export 가 아니라 **Node 런타임**으로 배포한다 (`next build` → `next start`).
// 서버 컴포넌트가 FASTAPI_URL 로 FastAPI 를 호출하기 때문에 `output: "export"` 를 쓰면 안 된다.

// NODE_ENV 는 headers() 평가 시점(빌드/dev 서버 기동)에 확정된다 — dev 전용 완화가
// production 빌드 산출물에 섞여 들어갈 일은 없다.
const isProduction = process.env.NODE_ENV === "production"

// CSP 는 Next 런타임 요구를 감안한 **현실적 기본값**이다:
//   - script-src 'unsafe-inline' : Next 는 하이드레이션 데이터·런타임 부트스트랩을 인라인
//     <script> 로 심는다. nonce 로 조이려면 요청마다 proxy 에서 CSP 헤더를 생성하는
//     방식으로 넘어가야 한다(정적 headers() 로는 불가능) — 필요해지면 그때 전환한다.
//   - 'unsafe-eval' 은 dev 전용 : HMR/React Refresh 가 eval 을 쓴다. production 에서는 뺀다.
//   - style-src 'unsafe-inline' : Next 가 스트리밍 중 인라인 스타일을 쓰고, 라이브러리의
//     style 속성 주입도 여기 걸린다.
//   - connect-src 'self' : 브라우저는 FastAPI 를 직접 부르지 않는 구조라(§13) 자기 origin 이면
//     충분하다. dev 의 HMR 웹소켓도 same-origin 이라 'self' 로 통과한다. 에디터의 "다시 자르기"가
//     본문 이미지를 fetch 하는 것도 같은 오리진의 /uploads(아래 rewrite)라 'self' 로 충분하다.
//   - img-src : 업로드 이미지는 같은 오리진의 /uploads(rewrite)라 'self'. 에디터는 업로드 전 미리보기에
//     blob: URL 을, 자르기 미리보기·변환에 canvas(CSP 대상 아님)를 쓴다. img.youtube.com 은 유튜브 썸네일.
//     ⚠️ backend PUBLIC_FILES_BASE_URL 로 공개 파일을 다른 오리진(CDN)에서 내보내면 그 호스트를 여기 더한다.
//   - frame-src : 본문의 유튜브 임베드(youtube-nocookie 가 표준, www.youtube.com 은 기존 마크업 호환).
//     **정확한 호스트만** 연다 — 와일드카드(*.youtube.com)를 쓰지 않는다. 백엔드 정화기(sanitize.py)도
//     같은 두 호스트의 /embed/<id> 만 남긴다(editor-spec §7).
// 나머지(object-src·base-uri·form-action·frame-ancestors)는 안전하게 조인다.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://img.youtube.com",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src https://www.youtube-nocookie.com https://www.youtube.com",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ")

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  // 클릭재킹 방지 — frame-ancestors 를 모르는 구형 브라우저용 백업으로 둘 다 보낸다.
  { key: "X-Frame-Options", value: "DENY" },
  // 응답을 선언된 Content-Type 으로만 해석 — 업로드 파일이 HTML 로 스니핑되어 실행되는 XSS 차단.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // 외부 이동에는 origin 만 남기고, https→http 다운그레이드면 아예 보내지 않는다 —
  // `/login?next=…` 같은 내부 경로·쿼리가 Referer 로 새는 것을 막는다.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // 쓰지 않는 고권한 브라우저 API 를 문서 전체에서 차단 — XSS 가 성공해도 카메라·마이크·위치에
  // 접근할 수 없다. 해당 기능을 실제로 쓰게 되면 그 origin 만 열어 준다.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // HSTS 는 production 에서만 — localhost 에 한번 붙으면 브라우저가 도메인 단위로 기억해
  // http://localhost 접속 자체를 거부한다(개발 환경이 잠기고, 지우기도 번거롭다).
  ...(isProduction
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
    : []),
]

/**
 * 백엔드 주소 — rewrite 대상. lib/server/fastapi.ts 의 baseUrl() 과 같은 값(FASTAPI_URL)을 쓴다.
 * ⚠️ rewrites() 는 **빌드 시점**에 평가되어 .next/routes-manifest.json 에 박힌다(headers() 와 같다).
 *    frontend/.env 는 `next build` 때도 읽히므로 보통은 문제없지만, 이미지를 한 번 빌드해 여러 환경에
 *    배포한다면 FASTAPI_URL 을 빌드 환경에도 넣어야 한다(바꾸면 다시 빌드).
 */
const fastapiUrl = (process.env.FASTAPI_URL ?? "http://localhost:8000").replace(/\/+$/, "")

/**
 * 서버 액션 본문 상한 — 첨부(백엔드 MAX_ATTACHMENT_UPLOAD_MB 기본 20MB)·이미지(5MB)가 Server Action 으로
 * 올라온다(브라우저 → Next → FastAPI). multipart 머리말 여유를 더해 25MB. 백엔드 상한을 올리면 같이 올린다.
 * proxy 가 요청 본문을 복제할 때의 상한(proxyClientMaxBodySize, 기본 10MB)도 같은 값으로 맞춘다 —
 * 작으면 /admin/** 에서 올린 큰 파일이 proxy 단계에서 잘린다.
 */
const UPLOAD_BODY_LIMIT = "25mb"

const nextConfig: NextConfig = {
  // 빌드 산출물에 소스맵을 남기지 않는다 (서버 코드 노출 방지).
  productionBrowserSourceMaps: false,
  experimental: {
    serverActions: { bodySizeLimit: UPLOAD_BODY_LIMIT },
    proxyClientMaxBodySize: UPLOAD_BODY_LIMIT,
  },
  // 보안 응답 헤더 — 전 경로 공통. 라우트별 예외가 필요해지면 source 를 나눈다.
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }]
  },
  // 백엔드 공개 파일을 **Next 오리진**에서 내보낸다 — API 응답의 URL 이 루트 상대(`/uploads/...`,
  // `/api/v1/notices/<id>/attachments/<aid>`; backend PUBLIC_FILES_BASE_URL 비움)라 그대로 동작한다.
  // 브라우저는 여전히 백엔드 주소를 모른다(BFF, §13). 열어 두는 것은 정확히 두 갈래뿐이다:
  //   - /uploads/:path*  : 에디터·배너 이미지(백엔드가 public/ 만 정적 서빙, private 은 404)
  //   - /api/v1/notices/:id/attachments/:aid : 게시된 공지의 첨부 다운로드(백엔드가 임시저장이면 404,
  //     Content-Disposition·nosniff·no-store 헤더를 그대로 전달). 관리자 다운로드(임시저장 포함)는
  //     토큰이 필요해 rewrite 가 아니라 Route Handler 다(app/admin/notices/[id]/attachments/[attachmentId]).
  // beforeFiles 인 이유: 사용자 화면의 404 catch-all(app/(site)/[...missing])보다 먼저 적용돼야 한다.
  // proxy.ts 의 matcher 는 두 경로를 제외한다(세션과 무관한 파일이라 refresh 왕복을 태우지 않는다).
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/uploads/:path*", destination: `${fastapiUrl}/uploads/:path*` },
        {
          source: "/api/v1/notices/:id(\\d+)/attachments/:aid(\\d+)",
          destination: `${fastapiUrl}/api/v1/notices/:id/attachments/:aid`,
        },
      ],
      afterFiles: [],
      fallback: [],
    }
  },
}

export default nextConfig
