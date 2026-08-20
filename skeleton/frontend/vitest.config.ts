import path from "node:path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

// 테스트 러너 (architecture.md §16).
// ⚠️ Next 는 Vite 를 쓰지 않는다 — 이 설정은 **테스트 전용**이다. `next build` 는 Turbopack 이 한다.
//    그래서 tsconfig 의 paths 를 Vite 가 자동으로 읽지 않으므로 alias 를 여기 다시 적어야 한다.
//
// ⛔ 서버 컴포넌트 / Server Action 은 여기서 테스트하지 않는다.
//    jsdom 에는 RSC 런타임도 요청 컨텍스트(cookies()/redirect())도 없다. 흉내 낸 목(mock)으로
//    통과시키면 "테스트는 초록인데 실제로는 깨지는" 가짜 안전망이 된다.
//    → 순수 로직(lib/safe-redirect)과 클라이언트 컴포넌트(components/*)만 테스트한다.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./vitest.setup.ts",
    include: ["{app,components,lib}/**/*.test.{ts,tsx}"],
  },
})
