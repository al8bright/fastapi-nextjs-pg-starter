import type { NextConfig } from "next"

// Next 설정 (architecture.md §13).
// 이 스타터는 정적 export 가 아니라 **Node 런타임**으로 배포한다 (`next build` → `next start`).
// 서버 컴포넌트가 FASTAPI_URL 로 FastAPI 를 호출하기 때문에 `output: "export"` 를 쓰면 안 된다.
const nextConfig: NextConfig = {
  // 빌드 산출물에 소스맵을 남기지 않는다 (서버 코드 노출 방지).
  productionBrowserSourceMaps: false,
}

export default nextConfig
