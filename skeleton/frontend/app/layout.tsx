import type { Metadata } from "next"
import type { ReactNode } from "react"
import "./globals.css"

// 루트 레이아웃 (App Router 필수). React SPA 판의 index.html + main.tsx 자리를 대신한다.
// SPA 와 달리 Provider 가 하나도 없다 — 서버 상태 캐시(React Query)도, 전역 스토어(Zustand)도
// 쓰지 않기 때문이다. 세션의 단일 출처는 httpOnly 쿠키다 (architecture.md §14).

export const metadata: Metadata = {
  title: "__PROJECT_NAME__",
  description: "공통 아키텍처(FastAPI · Next.js · PostgreSQL) 기반 스타터입니다.",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
