"use client"

import type { ComponentProps } from "react"

// 값이 바뀌면 자기 폼을 바로 제출하는 select — 목록 필터(예: 사용자 권한)용.
// 폼은 서버 컴포넌트의 GET 폼(next/form)이라 제출 = 쿼리가 바뀐 URL 로 이동 = 서버가 목록을 다시 그린다.
// JS 가 아직 없으면 바뀌기만 하고 제출되지 않는다 — 같은 폼의 "검색" 버튼으로 함께 제출된다.
export default function AutoSubmitSelect(props: Omit<ComponentProps<"select">, "onChange">) {
  return <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />
}
