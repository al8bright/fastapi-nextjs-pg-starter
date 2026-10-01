import NoticeForm from "@/components/admin/NoticeForm"

// 새 공지 — 폼(클라이언트)만 그린다. 처음 저장하면 Server Action 이 수정 화면(?created=1)으로 redirect 한다.

export const metadata = { title: "새 공지" }

export default function NewNoticePage() {
  return <NoticeForm notice={null} />
}
