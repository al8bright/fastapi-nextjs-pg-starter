// Tailwind v4 는 PostCSS 플러그인으로 붙인다 (architecture.md §15).
// ⛔ @tailwindcss/vite 는 쓸 수 없다 — Next 는 Vite 가 아니라 자체 번들러(Turbopack)를 쓴다.
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
}

export default config
