import Link from "next/link"
import { Suspense } from "react"
import { fastapiFetch } from "@/lib/server/fastapi"
import { getSessionUser } from "@/lib/session"
import type { DbHealth, Health } from "@/lib/types"

// 랜딩(시스템 상태) 화면.
// 상태 조회는 클라이언트 훅 폴링이 아니라 **서버가 직접** 호출한다.
// 브라우저는 FastAPI 주소를 알지도 못한다 (architecture.md §13).
//
// 로딩 표시는 <Suspense> 로 만든다 — 서버가 두 요청을 기다리는 동안 껍데기부터 스트리밍되고,
// 응답이 도착하면 배지만 교체된다. 클라이언트 로딩 상태 없이 서버 렌더만으로 같은 UX 를 낸다.

type Tone = "loading" | "ok" | "error"

const TONE_CLASS: Record<Tone, string> = {
  // ⚠️ 전체 클래스명을 그대로 적는다. `bg-${tone}-container` 처럼 조립하면
  //    Tailwind v4 의 소스 탐지가 못 찾아 CSS 가 생성되지 않는다.
  loading: "bg-surface-container text-on-surface-variant",
  ok: "bg-tertiary-container text-on-tertiary-container",
  error: "bg-error-container text-on-error-container",
}

const TONE_TEXT: Record<Tone, string> = {
  loading: "확인 중…",
  ok: "정상",
  error: "연결 안 됨",
}

function StatusBadge({ label, tone, detail }: { label: string; tone: Tone; detail?: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-outline-variant bg-surface-container-lowest px-5 py-4">
      <div>
        <p className="font-semibold text-on-surface">{label}</p>
        {detail && <p className="text-sm text-on-surface-variant">{detail}</p>}
      </div>
      <span className={`rounded-full px-3 py-1 text-sm font-semibold ${TONE_CLASS[tone]}`}>
        {TONE_TEXT[tone]}
      </span>
    </div>
  )
}

async function ApiStatus() {
  let ok = false
  try {
    const health = await fastapiFetch<Health>({ path: "/health" })
    ok = health.status === "ok"
  } catch {
    // 백엔드 미기동·5xx 는 화면에서 "연결 안 됨" 으로만 알리면 된다.
  }
  return <StatusBadge label="백엔드 API" tone={ok ? "ok" : "error"} detail="GET /api/v1/health" />
}

async function DbStatus() {
  let health: DbHealth | null = null
  try {
    health = await fastapiFetch<DbHealth>({ path: "/health/db" })
  } catch {
    // DB 미접속은 백엔드가 503 으로 알려준다 → FastapiError 로 정규화되어 여기로 온다.
  }
  const ok = health?.db === "ok"
  return (
    <StatusBadge
      label="데이터베이스"
      tone={ok ? "ok" : "error"}
      detail={
        health
          ? `GET /api/v1/health/db — ${health.table} (${health.rows} rows)`
          : "GET /api/v1/health/db"
      }
    />
  )
}

export default async function LandingPage() {
  // ⛔ proxy 는 쿠키의 **존재**만 본다 — 그것만으로는 보호 경계가 아니다.
  //    (임의의 문자열 쿠키를 심으면 통과한다.) 보호 페이지는 반드시 여기서 실검증한다.
  //    백엔드가 죽어 있으면 getSessionUser 가 null 을 돌려주고 리다이렉트하지 않으므로,
  //    "연결 안 됨" 을 보여주는 이 화면의 진단 가치는 그대로 유지된다.
  await getSessionUser("/landing")

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-surface px-4">
      <div className="w-full max-w-xl">
        <header className="mb-8 text-center">
          <span className="inline-block rounded-full bg-primary px-4 py-1 text-sm font-semibold text-on-primary">
            __PROJECT_NAME__
          </span>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-on-surface">
            프로젝트 스캐폴드 완료 🎉
          </h1>
          <p className="mt-3 text-on-surface-variant">
            공통 아키텍처(FastAPI · Next.js · PostgreSQL) 기반 스타터입니다. 아래에서 백엔드/DB 연결
            상태를 확인하세요.
          </p>
        </header>

        <div className="space-y-3">
          <Suspense
            fallback={
              <StatusBadge label="백엔드 API" tone="loading" detail="GET /api/v1/health" />
            }
          >
            <ApiStatus />
          </Suspense>
          <Suspense
            fallback={
              <StatusBadge label="데이터베이스" tone="loading" detail="GET /api/v1/health/db" />
            }
          >
            <DbStatus />
          </Suspense>
        </div>

        <footer className="mt-8 text-center text-sm text-on-surface-variant">
          다음 단계: <code className="font-mono">plan.md</code> 순서대로 TDD 로 개발을 시작하세요.
          <Link href="/" className="mt-3 block text-on-surface-variant hover:text-on-surface">
            ← 메인으로
          </Link>
        </footer>
      </div>
    </main>
  )
}
