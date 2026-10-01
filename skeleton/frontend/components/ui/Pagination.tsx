import Link from "next/link"
import { listHref, pageWindow } from "@/lib/listParams"
import Icon from "./Icon"
import { ui } from "./styles"

// 페이지 이동 — 현재 페이지 주변 최대 5개 번호 + 이전/다음. 서버 컴포넌트에서 쓰는 **링크** 목록이다
// (page 는 URL 에 있다). 이동하면 서버가 그 페이지를 다시 그린다 — 클라이언트 상태가 없다.
interface Props {
  page: number
  size: number
  total: number
  /** 목록 경로(예: "/notices"). */
  basePath: string
  /** page 외에 유지할 쿼리(검색어·필터). */
  params?: Record<string, string | number | null | undefined>
  label?: string
}

export default function Pagination({ page, size, total, basePath, params = {}, label = "페이지 이동" }: Props) {
  const last = Math.max(1, Math.ceil(total / size))
  if (last <= 1) return null
  const href = (p: number) => listHref(basePath, { ...params, page: p })
  const item = `${ui.btnSmall} min-w-11`
  const disabled = `${item} pointer-events-none text-on-surface-variant opacity-40`
  return (
    <nav aria-label={label} className="flex flex-wrap items-center justify-center gap-1">
      {page > 1 ? (
        <Link href={href(page - 1)} className={`${item} text-on-surface-variant hover:bg-surface-container`} aria-label="이전 페이지">
          <Icon name="chevronLeft" />
        </Link>
      ) : (
        <span className={disabled} aria-hidden="true">
          <Icon name="chevronLeft" />
        </span>
      )}
      {pageWindow(page, last).map((p) => (
        <Link
          key={p}
          href={href(p)}
          className={`${item} ${p === page ? "bg-primary text-on-primary" : "text-on-surface hover:bg-surface-container"}`}
          aria-current={p === page ? "page" : undefined}
          aria-label={`${p} 페이지`}
        >
          {p}
        </Link>
      ))}
      {page < last ? (
        <Link href={href(page + 1)} className={`${item} text-on-surface-variant hover:bg-surface-container`} aria-label="다음 페이지">
          <Icon name="chevronRight" />
        </Link>
      ) : (
        <span className={disabled} aria-hidden="true">
          <Icon name="chevronRight" />
        </span>
      )}
    </nav>
  )
}
