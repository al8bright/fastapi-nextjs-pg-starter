"use client"

import Link from "next/link"
import { useEffect, useSyncExternalStore } from "react"
import Icon from "@/components/ui/Icon"
import { ui } from "@/components/ui/styles"

// 공지 상세의 "목록으로" 가 보던 목록(검색어·페이지)으로 돌아가게 한다.
// 목록 화면이 현재 쿼리를 sessionStorage 에 적어 두고(RememberNoticeList), 상세 화면의 링크가 읽는다
// (NoticeBackLink). URL 에 꼬리표를 붙이지 않아 상세 주소를 그대로 공유할 수 있다.
// 저장소를 못 쓰는 환경(사생활 보호 모드 등)이면 그냥 /notices 로 간다.

const KEY = "notices:list-search"

/** 목록이 렌더될 때 현재 쿼리 문자열("?q=…&page=2" 또는 "")을 기억한다. 화면에는 아무것도 그리지 않는다. */
export function RememberNoticeList({ search }: { search: string }) {
  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, search)
    } catch {
      // 저장소 비활성 — 기본 목록으로 돌아가면 된다.
    }
  }, [search])
  return null
}

function readSearch(): string {
  try {
    const value = sessionStorage.getItem(KEY) ?? ""
    // 우리가 적은 형태("?..." 또는 "")만 믿는다.
    return value === "" || value.startsWith("?") ? value : ""
  } catch {
    return ""
  }
}

const noop = () => () => {}

/** 상세 화면의 "목록으로" — 서버 렌더에서는 /notices, 브라우저에서는 기억한 목록 쿼리를 붙인다. */
export function NoticeBackLink() {
  const search = useSyncExternalStore(noop, readSearch, () => "")
  return (
    <Link href={`/notices${search}`} className={ui.btnNeutral}>
      <Icon name="back" size={16} />
      목록으로
    </Link>
  )
}
