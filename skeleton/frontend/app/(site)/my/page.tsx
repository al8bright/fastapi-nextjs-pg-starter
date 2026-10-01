import { permanentRedirect } from "next/navigation"

// 이전 경로 호환 — 내 정보 화면은 /me 로 옮겼다.
export default function LegacyMyPage() {
  permanentRedirect("/me")
}
