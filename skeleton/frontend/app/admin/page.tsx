import Link from "next/link"
import RefreshButton from "@/components/admin/RefreshButton"
import SessionsTable from "@/components/admin/SessionsTable"
import ThrottlesTable from "@/components/admin/ThrottlesTable"
import PageHeader from "@/components/layout/PageHeader"
import { ErrorState } from "@/components/ui/QueryState"
import { ui } from "@/components/ui/styles"
import { formatNumber } from "@/lib/format"
import { getDashboard, listLoginThrottles, listSessions } from "@/lib/server/admin"
import { loadForPage } from "@/lib/server/load"
import type { Dashboard } from "@/lib/types"

// 대시보드 (디자인 A) — KPI 타일 + 최근 활성 세션 5건(강제 종료) + 잠긴 계정(잠금 해제).
// 서버 컴포넌트 — 세 조회를 병렬로 기다린다. 강제 종료·잠금 해제는 클라이언트 표가 Server Action 으로.

export const metadata = { title: "대시보드" }

interface Kpi {
  label: string
  value: string
  sub: string
  tone?: "primary" | "danger" | "success"
}

const KPI_COLOR = { primary: "text-primary", danger: "text-error", success: "text-tertiary" } as const

function KpiTile({ kpi }: { kpi: Kpi }) {
  return (
    <section className={`${ui.card} flex flex-col gap-2 rounded-xl p-5`}>
      <h2 className="text-sm font-medium text-on-surface-variant">{kpi.label}</h2>
      <p className={`text-3xl font-bold ${kpi.tone ? KPI_COLOR[kpi.tone] : "text-on-surface"}`}>{kpi.value}</p>
      <p className="text-[13px] text-on-surface-variant">{kpi.sub}</p>
    </section>
  )
}

function kpisOf(data: Dashboard): Kpi[] {
  return [
    {
      label: "전체 사용자",
      value: formatNumber(data.users.total),
      sub: `활성 ${formatNumber(data.users.active)} · 비활성 ${formatNumber(data.users.inactive)}`,
    },
    { label: "활성 세션", value: formatNumber(data.active_sessions), sub: "만료·폐기 전 refresh 세션", tone: "primary" },
    {
      label: "잠긴 계정",
      value: formatNumber(data.locked_accounts),
      sub: data.locked_accounts ? "자동 해제 대기" : "잠긴 계정 없음",
      tone: data.locked_accounts ? "danger" : undefined,
    },
    {
      label: "공지사항",
      value: formatNumber(data.notices.published),
      sub: `게시 중 · 임시저장 ${formatNumber(data.notices.draft)}`,
    },
    { label: "활성 배너", value: formatNumber(data.active_banners), sub: "활성 + 노출 기간 안" },
    {
      label: "DB 상태",
      value: data.db === "ok" ? "정상" : "오류",
      sub: `마이그레이션 ${data.alembic_revision ?? "확인 불가"}`,
      tone: data.db === "ok" ? "success" : "danger",
    },
  ]
}

export default async function DashboardPage() {
  const [dashboard, sessions, throttles] = await Promise.all([
    loadForPage("/admin", getDashboard, "대시보드 집계를 불러오지 못했습니다."),
    loadForPage("/admin", () => listSessions({ page: 1, size: 5 }), "세션 목록을 불러오지 못했습니다."),
    loadForPage("/admin", listLoginThrottles, "잠금 목록을 불러오지 못했습니다."),
  ])

  return (
    <>
      <PageHeader title="대시보드" description="시스템 상태와 인증 현황" actions={<RefreshButton />} />
      <div className="flex flex-col gap-6">
        {dashboard.ok ? (
          <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 md:grid-cols-3 2xl:grid-cols-6">
            {kpisOf(dashboard.data).map((k) => (
              <KpiTile key={k.label} kpi={k} />
            ))}
          </div>
        ) : (
          <ErrorState message={dashboard.error} retryHref="/admin" />
        )}

        <div className="grid gap-4 xl:grid-cols-3">
          <section aria-labelledby="dash-sessions" className={`${ui.card} flex min-w-0 flex-col gap-3 rounded-xl p-5 xl:col-span-2`}>
            <div className="flex items-center justify-between">
              <h2 id="dash-sessions" className="text-lg font-semibold">
                활성 세션
              </h2>
              <Link href="/admin/sessions" className={`${ui.link} text-sm font-medium`}>
                전체 보기
              </Link>
            </div>
            {sessions.ok ? <SessionsTable sessions={sessions.data.items} compact /> : <ErrorState message={sessions.error} />}
          </section>

          <section aria-labelledby="dash-locks" className={`${ui.card} flex flex-col gap-3 rounded-xl p-5`}>
            <div className="flex items-center justify-between">
              <h2 id="dash-locks" className="text-lg font-semibold">
                로그인 잠금
              </h2>
              <Link href="/admin/login-throttles" className={`${ui.link} text-sm font-medium`}>
                전체 보기
              </Link>
            </div>
            <p className="text-[13px] text-on-surface-variant">연속 실패 횟수가 기준을 넘으면 일정 시간 로그인이 잠깁니다.</p>
            {throttles.ok ? (
              <ThrottlesTable throttles={throttles.data} variant="locked" />
            ) : (
              <ErrorState message={throttles.error} />
            )}
          </section>
        </div>
      </div>
    </>
  )
}
