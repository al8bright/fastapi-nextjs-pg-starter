"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

// "저장하지 않은 변경" 이탈 확인 — 공지 작성 화면(NoticeForm)이 쓴다.
//
// Next App Router 에는 React Router 의 useBlocker 같은 내비게이션 차단 API 가 없다. 그래서 두 가지만 막는다:
//   1. 새로고침·탭 닫기·외부 주소 이동 → `beforeunload` (브라우저 기본 확인창)
//   2. 화면 안의 **링크 클릭**(next/link 포함) → window 캡처 단계에서 가로채 확인 다이얼로그를 띄우고,
//      "나가기" 를 고르면 router.push 로 이어 간다. 캡처 단계라 next/link 의 onClick 보다 먼저 돈다.
// ⚠️ 막지 못하는 것: 브라우저 뒤로/앞으로 버튼(popstate), 코드에서 직접 부르는 router.push.
//    이 화면은 저장 버튼 옆에 "저장하지 않은 변경 사항이 있습니다" 를 항상 보여 주어 보완한다.
//    새 탭(Ctrl/⌘·가운데 클릭)·target="_blank"·download 링크는 현재 화면을 떠나지 않으므로 통과시킨다.

/** 이 클릭이 현재 화면을 떠나는 같은 오리진 이동이면 목적지(경로+쿼리+해시)를, 아니면 null. */
export function leavingHref(event: MouseEvent, current: Location): string | null {
  if (event.defaultPrevented || event.button !== 0) return null
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null
  const target = event.target as Element | null
  const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null
  if (!anchor) return null
  if ((anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return null
  let url: URL
  try {
    url = new URL(anchor.href, current.href)
  } catch {
    return null
  }
  // 다른 오리진은 문서 이동이라 beforeunload 가 맡는다. 같은 화면 안의 해시 이동은 떠나는 것이 아니다.
  if (url.origin !== current.origin) return null
  if (url.pathname === current.pathname && url.search === current.search) return null
  return `${url.pathname}${url.search}${url.hash}`
}

export function useLeaveGuard(dirty: boolean) {
  const router = useRouter()
  const [pendingHref, setPendingHref] = useState<string | null>(null)

  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // 구형 브라우저는 returnValue 를 설정해야 확인창을 띄운다.
      e.returnValue = ""
    }
    const onClick = (e: MouseEvent) => {
      const href = leavingHref(e, window.location)
      if (!href) return
      e.preventDefault()
      e.stopPropagation()
      setPendingHref(href)
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    window.addEventListener("click", onClick, true)
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload)
      window.removeEventListener("click", onClick, true)
    }
  }, [dirty])

  return {
    /** 확인을 기다리는 목적지 — 있으면 다이얼로그를 띄운다. */
    pendingHref,
    /** "나가기" — 기다리던 목적지로 이동한다. */
    proceed: () => {
      const href = pendingHref
      setPendingHref(null)
      if (href) router.push(href)
    },
    /** "계속 작성" */
    cancel: () => setPendingHref(null),
  }
}
