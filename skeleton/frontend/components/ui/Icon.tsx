// 인라인 SVG 아이콘 — 장식용(aria-hidden). 의미는 옆 텍스트나 sr-only 로 전달한다.
const PATHS = {
  dashboard: "M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z",
  notice: "M4 5h16v12H8l-4 4zM8 9h8M8 13h5",
  banner: "M3 5h18v14H3zM3 15l5-5 4 4 3-3 6 6",
  users: "M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M21 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8",
  session: "M4 5h16v10H4zM8 19h8M12 15v4",
  lock: "M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3",
  system: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19 12l2-1-1-3-2 .3-1.5-1.5L17 5l-3-1-1 2h-2L10 4 7 5l.5 2.3L6 8.8 4 8.5l-1 3 2 1v1l-2 1 1 3 2-.3L7.5 17 7 19l3 1 1-2h2l1 2 3-1-.5-2.3 1.5-1.5 2 .3 1-3-2-1z",
  back: "M15 18l-6-6 6-6",
  chevronDown: "M6 9l6 6 6-6",
  chevronLeft: "M15 18l-6-6 6-6",
  chevronRight: "M9 6l6 6-6 6",
  shield: "M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "M6 6l12 12M18 6L6 18",
  clip: "M21 11l-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7",
  pin: "M9 4h6l-1 6 3 3H7l3-3zM12 13v7",
  download: "M12 4v11M7 10l5 5 5-5M5 20h14",
  up: "M12 19V5M6 11l6-6 6 6",
  down: "M12 5v14M6 13l6 6 6-6",
  pause: "M8 5v14M16 5v14",
  play: "M7 5l12 7-12 7z",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M20 20l-4-4",
  card: "M4 4h16v16H4zM9 12h6M12 9v6",
  external: "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6",
} as const

export type IconName = keyof typeof PATHS

export default function Icon({ name, size = 18, className = "" }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
