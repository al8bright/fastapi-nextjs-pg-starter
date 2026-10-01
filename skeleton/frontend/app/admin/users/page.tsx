import Form from "next/form"
import UsersTable from "@/components/admin/UsersTable"
import PageHeader from "@/components/layout/PageHeader"
import AutoSubmitSelect from "@/components/ui/AutoSubmitSelect"
import Icon from "@/components/ui/Icon"
import Pagination from "@/components/ui/Pagination"
import { ErrorState } from "@/components/ui/QueryState"
import { ui } from "@/components/ui/styles"
import { formatNumber } from "@/lib/format"
import { firstParam, listHref, parsePage, parseQuery, type SearchParams } from "@/lib/listParams"
import { listUsers } from "@/lib/server/admin"
import { loadForPage } from "@/lib/server/load"
import { getSessionUser } from "@/lib/session"
import type { UserRole } from "@/lib/types"

// 사용자 관리 — 검색·역할 필터·페이지(URL), 권한·활성 변경(확인 후 PATCH), 세션 모두 종료.
// 목록 조회는 서버, 변경은 클라이언트 표(UsersTable)가 Server Action 으로 한다.
const PAGE_SIZE = 20

export const metadata = { title: "사용자" }

export default async function UsersAdminPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const page = parsePage(params)
  const q = parseQuery(params)
  const rawRole = firstParam(params, "role")
  const role: UserRole | undefined = rawRole === "admin" || rawRole === "user" ? rawRole : undefined
  const current = listHref("/admin/users", { q, role, page })

  const [result, me] = await Promise.all([
    loadForPage(current, () => listUsers({ page, size: PAGE_SIZE, q, role }), "사용자 목록을 불러오지 못했습니다."),
    getSessionUser(current),
  ])

  return (
    <>
      <PageHeader title="사용자" description={result.ok ? `${formatNumber(result.data.total)}명` : "계정 권한·활성 상태 관리"} />
      {/* 검색어·권한 필터를 한 GET 폼으로 — 새 조건은 page 를 넣지 않아 1페이지로 돌아간다. */}
      <Form action="/admin/users" role="search" className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex w-full gap-2 sm:w-auto">
          <label htmlFor="users-q" className="sr-only">
            아이디 검색
          </label>
          <input
            id="users-q"
            key={q}
            type="search"
            name="q"
            defaultValue={q}
            maxLength={100}
            placeholder="아이디 검색"
            className={`${ui.input} mt-0 min-w-0 flex-1 sm:w-64`}
          />
          <button type="submit" className={ui.btnNeutral}>
            <Icon name="search" size={16} />
            검색
          </button>
        </div>
        <div className="sm:w-44">
          <label htmlFor="users-role" className="sr-only">
            권한 필터
          </label>
          <AutoSubmitSelect id="users-role" key={role ?? ""} name="role" defaultValue={role ?? ""} className={`${ui.input} mt-0`}>
            <option value="">모든 권한</option>
            <option value="admin">관리자</option>
            <option value="user">일반 사용자</option>
          </AutoSubmitSelect>
        </div>
      </Form>

      {result.ok ? (
        <div className="flex flex-col gap-4">
          <UsersTable users={result.data.items} meId={me?.id ?? null} />
          <Pagination page={page} size={PAGE_SIZE} total={result.data.total} basePath="/admin/users" params={{ q, role }} />
        </div>
      ) : (
        <ErrorState message={result.error} retryHref={current} />
      )}
    </>
  )
}
