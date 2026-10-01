// 공용 클래스 묶음 (DESIGN.md Components). 버튼·입력은 최소 44px 높이(터치 대상)를 지킨다.
// 포커스는 키보드 사용자에게 보이도록 focus-visible 링을 공통으로 준다.

const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container-lowest"

const buttonBase = `inline-flex min-h-11 items-center justify-center gap-2 rounded px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`

export const ui = {
  focusRing,
  btnPrimary: `${buttonBase} bg-primary text-on-primary hover:bg-primary-container`,
  btnSecondary: `${buttonBase} border border-primary bg-transparent text-primary hover:bg-primary-fixed`,
  btnNeutral: `${buttonBase} border border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container-low`,
  btnDanger: `${buttonBase} border border-error bg-surface-container-lowest text-error hover:bg-error-container hover:text-on-error-container`,
  btnDangerSolid: `${buttonBase} bg-error text-on-primary hover:opacity-90`,
  /** 표 안의 작은 버튼 — 시각 높이는 36px 이지만 터치 영역은 44px 을 유지한다. */
  btnSmall: `inline-flex min-h-11 items-center justify-center rounded px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`,
  label: "block text-sm font-semibold text-on-surface",
  input: `mt-1 block min-h-11 w-full rounded border border-outline-variant bg-surface-container-lowest px-3 text-on-surface placeholder:text-on-surface-variant/70 focus:border-primary aria-[invalid=true]:border-error ${focusRing} focus-visible:ring-offset-0`,
  help: "mt-1 text-sm text-on-surface-variant",
  fieldError: "mt-1 text-sm font-medium text-error",
  card: "rounded-lg border border-outline-variant bg-surface-container-lowest",
  link: `rounded text-primary underline-offset-2 hover:underline hover:text-on-primary-fixed ${focusRing}`,
  th: "border-b border-outline-variant px-3 py-3 text-left text-sm font-medium whitespace-nowrap text-on-surface-variant",
  td: "border-b border-surface-container px-3 py-3 align-middle text-sm",
}
