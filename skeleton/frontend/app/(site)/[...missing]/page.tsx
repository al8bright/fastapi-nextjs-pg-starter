import { notFound } from "next/navigation"

// 사용자 화면의 404 — 일치하는 라우트가 없는 주소를 여기서 받아 notFound() 를 던진다.
// 그러면 같은 그룹의 (site)/not-found.tsx 가 **사용자 레이아웃(헤더·푸터) 안에서** 그려진다.
// (루트 app/not-found.tsx 는 레이아웃 밖이라 헤더가 없다 — 관리자·로그인 쪽 미일치용으로 남긴다.)
// ⚠️ 정적 파일 경로(/uploads/*, 공개 첨부)는 next.config.ts 의 beforeFiles rewrite 가 이 catch-all 보다 먼저 가져간다.
export default function MissingPage() {
  notFound()
}
