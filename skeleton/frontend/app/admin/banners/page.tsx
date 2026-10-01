import Link from "next/link"
import BannerList from "@/components/admin/BannerList"
import PageHeader from "@/components/layout/PageHeader"
import { ErrorState } from "@/components/ui/QueryState"
import { ui } from "@/components/ui/styles"
import { listAdminBanners } from "@/lib/server/banners"
import { loadForPage } from "@/lib/server/load"

// 배너 목록 — 조회는 서버, 토글·순서·삭제는 클라이언트 목록(BannerList)이 Server Action 으로.

export const metadata = { title: "배너" }

export default async function BannersAdminPage() {
  const result = await loadForPage("/admin/banners", listAdminBanners, "배너 목록을 불러오지 못했습니다.")
  return (
    <>
      <PageHeader
        title="배너"
        description="홈 화면 캐러셀에 노출 순서대로 보입니다. 활성이고 노출 기간 안인 배너만 보입니다."
        actions={
          <Link href="/admin/banners/new" className={ui.btnPrimary}>
            새 배너
          </Link>
        }
      />
      {result.ok ? <BannerList banners={result.data} /> : <ErrorState message={result.error} retryHref="/admin/banners" />}
    </>
  )
}
