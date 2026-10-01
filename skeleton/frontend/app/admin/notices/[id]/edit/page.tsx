import Link from "next/link"
import NoticeForm from "@/components/admin/NoticeForm"
import PageHeader from "@/components/layout/PageHeader"
import { ErrorState } from "@/components/ui/QueryState"
import { ui } from "@/components/ui/styles"
import { firstParam, type SearchParams } from "@/lib/listParams"
import { loadForPage } from "@/lib/server/load"
import { getAdminNotice } from "@/lib/server/notices"

// 공지 수정 — 서버가 공지(임시저장 포함, 첨부 목록 포함)를 읽어 폼에 넘긴다.
// 저장·첨부 변경 뒤에는 액션의 revalidatePath 로 이 화면이 다시 렌더되어 props 가 갱신된다.

export const metadata = { title: "공지 수정" }

function Missing() {
  return (
    <>
      <PageHeader title="공지 수정" />
      <ErrorState message="공지를 찾을 수 없습니다. 이미 삭제되었을 수 있습니다." />
      <Link href="/admin/notices" className={`${ui.btnNeutral} mt-4`}>
        목록으로
      </Link>
    </>
  )
}

export default async function EditNoticePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<SearchParams>
}) {
  const { id } = await params
  const noticeId = Number(id)
  if (!Number.isInteger(noticeId) || noticeId <= 0) return <Missing />

  const path = `/admin/notices/${noticeId}/edit`
  const result = await loadForPage(path, () => getAdminNotice(noticeId))
  if (!result.ok) return <ErrorState message={result.error} retryHref={path} />
  if (!result.data) return <Missing />
  const created = firstParam(await searchParams, "created") === "1"
  // key: 다른 공지로 이동하면 폼·에디터를 새로 마운트한다(에디터는 비제어 — editor-spec §8).
  return <NoticeForm key={result.data.id} notice={result.data} created={created} />
}
