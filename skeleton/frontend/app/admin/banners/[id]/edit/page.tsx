import Link from "next/link"
import BannerForm from "@/components/admin/BannerForm"
import PageHeader from "@/components/layout/PageHeader"
import { ErrorState } from "@/components/ui/QueryState"
import { ui } from "@/components/ui/styles"
import { getAdminBanner } from "@/lib/server/banners"
import { loadForPage } from "@/lib/server/load"

// 배너 수정 — 서버가 배너를 읽어 폼에 넘긴다. 없는 id(404)는 안내 화면.

export const metadata = { title: "배너 수정" }

function Missing() {
  return (
    <>
      <PageHeader title="배너 수정" />
      <ErrorState message="배너를 찾을 수 없습니다. 이미 삭제되었을 수 있습니다." />
      <Link href="/admin/banners" className={`${ui.btnNeutral} mt-4`}>
        목록으로
      </Link>
    </>
  )
}

export default async function EditBannerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const bannerId = Number(id)
  if (!Number.isInteger(bannerId) || bannerId <= 0) return <Missing />

  const path = `/admin/banners/${bannerId}/edit`
  const result = await loadForPage(path, () => getAdminBanner(bannerId))
  if (!result.ok) return <ErrorState message={result.error} retryHref={path} />
  if (!result.data) return <Missing />
  // key: 다른 배너로 이동하면 폼 상태를 새로 만든다.
  return <BannerForm key={result.data.id} banner={result.data} />
}
