// 본문 바로가기 — 키보드 사용자가 반복되는 내비게이션을 건너뛴다. 포커스될 때만 보인다.
export default function SkipLink({ target }: { target: string }) {
  return (
    <a
      href={`#${target}`}
      className="sr-only rounded bg-primary px-4 py-3 font-semibold text-on-primary focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
    >
      본문으로 건너뛰기
    </a>
  )
}
