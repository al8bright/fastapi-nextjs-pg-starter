import Form from "next/form"
import Icon from "./Icon"
import { ui } from "./styles"

// 제목 검색 폼 — GET 폼(next/form)이라 제출하면 `?q=` 가 붙은 URL 로 클라이언트 이동하고, 서버가 목록을 다시 그린다.
// JS 가 아직 없어도 일반 GET 폼으로 동작한다. 새 검색은 page 를 넣지 않아 1페이지로 돌아간다.
// 보이는 라벨은 sr-only 로 둔다(placeholder 는 라벨이 아니다).
interface Props {
  label: string
  /** 폼이 제출될 목록 경로. */
  action: string
  initial: string
  /** 검색할 때 유지할 다른 쿼리(예: 역할 필터). */
  keep?: Record<string, string | number | undefined>
  name?: string
  placeholder?: string
}

export default function SearchForm({ label, action, initial, keep = {}, name = "q", placeholder }: Props) {
  const id = `search-${action.replace(/[^a-z0-9]+/gi, "-")}`
  return (
    <Form action={action} role="search" className="flex w-full gap-2 sm:w-auto">
      {Object.entries(keep).map(([key, value]) =>
        value === undefined || value === "" ? null : <input key={key} type="hidden" name={key} value={String(value)} />,
      )}
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        key={initial}
        type="search"
        name={name}
        defaultValue={initial}
        maxLength={100}
        placeholder={placeholder ?? label}
        className={`${ui.input} mt-0 min-w-0 flex-1 sm:w-64`}
      />
      <button type="submit" className={ui.btnNeutral}>
        <Icon name="search" size={16} />
        검색
      </button>
    </Form>
  )
}
