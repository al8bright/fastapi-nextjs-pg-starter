import type { NextConfig } from "next"

// Next 설정 (architecture.md §13).
// 이 스타터는 정적 export 가 아니라 **Node 런타임**으로 배포한다 (`next build` → `next start`).
// 서버 컴포넌트가 FASTAPI_URL 로 FastAPI 를 호출하기 때문에 `output: "export"` 를 쓰면 안 된다.

// NODE_ENV 는 headers() 평가 시점(빌드/dev 서버 기동)에 확정된다 — dev 전용 완화가
// production 빌드 산출물에 섞여 들어갈 일은 없다.
const isProduction = process.env.NODE_ENV === "production"

// CSP 는 Next 런타임 요구를 감안한 **현실적 기본값**이다:
//   - script-src 'unsafe-inline' : Next 는 하이드레이션 데이터·런타임 부트스트랩을 인라인
//     <script> 로 심는다. nonce 로 조이려면 요청마다 middleware 에서 CSP 헤더를 생성하는
//     방식으로 넘어가야 한다(정적 headers() 로는 불가능) — 필요해지면 그때 전환한다.
//   - 'unsafe-eval' 은 dev 전용 : HMR/React Refresh 가 eval 을 쓴다. production 에서는 뺀다.
//   - style-src 'unsafe-inline' : Next 가 스트리밍 중 인라인 스타일을 쓰고, 라이브러리의
//     style 속성 주입도 여기 걸린다.
//   - connect-src 'self' : 브라우저는 FastAPI 를 직접 부르지 않는 구조라(§13) 자기 origin 이면
//     충분하다. dev 의 HMR 웹소켓도 same-origin 이라 'self' 로 통과한다.
// 나머지(object-src·base-uri·form-action·frame-ancestors)는 안전하게 조인다.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
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

const nextConfig: NextConfig = {
  // 빌드 산출물에 소스맵을 남기지 않는다 (서버 코드 노출 방지).
  productionBrowserSourceMaps: false,
  // 보안 응답 헤더 — 전 경로 공통. 라우트별 예외가 필요해지면 source 를 나눈다.
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }]
  },
}

export default nextConfig
