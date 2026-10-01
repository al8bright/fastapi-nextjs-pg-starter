import { Suspense } from "react"
import RefreshButton from "@/components/admin/RefreshButton"
import PageHeader from "@/components/layout/PageHeader"
import Chip from "@/components/ui/Chip"
import { ui } from "@/components/ui/styles"
import { getDashboard, getDbHealth, getHealth } from "@/lib/server/admin"
import type { DbHealth } from "@/lib/types"

// 시스템 상태 — 헬스 체크(GET /health, /health/db) + 대시보드의 DB 상태·Alembic 리비전.
// (이전 템플릿의 랜딩 화면이 하던 연결 확인을 관리자 콘솔로 옮겼다.)
// 상태 조회는 서버가 직접 하고, 느린 조회는 <Suspense> 로 떼어 행 단위로 스트리밍한다.

export const metadata = { title: "시스템 상태" }

type State = "loading" | "ok" | "error"

function StatusChip({ state }: { state: State }) {
  if (state === "loading") return <Chip>확인 중…</Chip>
  return state === "ok" ? <Chip tone="success">정상</Chip> : <Chip tone="danger">연결 안 됨</Chip>
}

function StatusRow({ label, detail, state }: { label: string; detail: string; state: State }) {
  return (
    <div className="flex flex-col gap-2 border-b border-surface-container px-5 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-semibold">{label}</p>
        <p className="text-sm break-all text-on-surface-variant">{detail}</p>
      </div>
      <StatusChip state={state} />
    </div>
  )
}

async function ApiRow() {
  let ok = false
  try {
    ok = (await getHealth()).status === "ok"
  } catch {
    // 미기동·5xx 는 "연결 안 됨" 으로만 알린다.
  }
  return <StatusRow label="백엔드 API" detail="GET /api/v1/health" state={ok ? "ok" : "error"} />
}

async function DbRow() {
  let health: DbHealth | null = null
  try {
    health = await getDbHealth()
  } catch {
    // DB 미접속은 백엔드가 503 으로 알려준다.
  }
  return (
    <StatusRow
      label="데이터베이스"
      detail={health ? `GET /api/v1/health/db — ${health.table} (${health.rows} rows)` : "GET /api/v1/health/db"}
      state={health?.db === "ok" ? "ok" : "error"}
    />
  )
}

async function DbFacts() {
  let db: "ok" | "error" | null = null
  let revision: string | null = null
  try {
    const d = await getDashboard()
    db = d.db
    revision = d.alembic_revision
  } catch {
    // 아래에서 "오류"·"확인 불가" 로 보인다.
  }
  return (
    <>
      <div className="flex justify-between gap-4 px-5 py-4">
        <dt className="text-on-surface-variant">상태 (대시보드 집계)</dt>
        <dd>{db === "ok" ? <Chip tone="success">정상</Chip> : <Chip tone="danger">오류</Chip>}</dd>
      </div>
      <div className="flex justify-between gap-4 px-5 py-4">
        <dt className="text-on-surface-variant">Alembic 리비전</dt>
        <dd className="font-mono text-sm">{revision ?? "확인 불가"}</dd>
      </div>
    </>
  )
}

export default function SystemPage() {
  return (
    <>
      <PageHeader title="시스템 상태" description="백엔드·데이터베이스 연결과 마이그레이션 상태" actions={<RefreshButton />} />
      <div className="grid gap-6 xl:grid-cols-2">
        <section aria-labelledby="sys-health" className={`${ui.card} rounded-xl`}>
          <h2 id="sys-health" className="border-b border-surface-container px-5 py-4 text-lg font-semibold">
            헬스 체크
          </h2>
          <Suspense fallback={<StatusRow label="백엔드 API" detail="GET /api/v1/health" state="loading" />}>
            <ApiRow />
          </Suspense>
          <Suspense fallback={<StatusRow label="데이터베이스" detail="GET /api/v1/health/db" state="loading" />}>
            <DbRow />
          </Suspense>
        </section>

        <section aria-labelledby="sys-db" className={`${ui.card} rounded-xl`}>
          <h2 id="sys-db" className="border-b border-surface-container px-5 py-4 text-lg font-semibold">
            데이터베이스
          </h2>
          <dl className="divide-y divide-surface-container">
            <Suspense
              fallback={
                <div className="flex justify-between gap-4 px-5 py-4">
                  <dt className="text-on-surface-variant">상태 (대시보드 집계)</dt>
                  <dd>확인 중…</dd>
                </div>
              }
            >
              <DbFacts />
            </Suspense>
            <div className="flex justify-between gap-4 px-5 py-4">
              <dt className="text-on-surface-variant">프론트엔드 빌드</dt>
              <dd className="text-sm">{process.env.NODE_ENV}</dd>
            </div>
          </dl>
        </section>
      </div>
    </>
  )
}
