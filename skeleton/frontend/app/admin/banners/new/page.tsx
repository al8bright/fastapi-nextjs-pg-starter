import BannerForm from "@/components/admin/BannerForm"

// 새 배너 — 폼(클라이언트)만 그린다. 저장은 Server Action(saveBannerAction)이 하고 목록으로 redirect 한다.

export const metadata = { title: "새 배너" }

export default function NewBannerPage() {
  return <BannerForm banner={null} />
}
