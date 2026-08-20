import js from "@eslint/js"
import nextCoreWebVitals from "eslint-config-next/core-web-vitals"
import nextTypescript from "eslint-config-next/typescript"

// ESLint flat config (architecture.md §13).
// eslint-config-next 16 은 flat config 배열을 그대로 export 한다 —
// `@eslint/eslintrc` 의 FlatCompat 로 감쌀 필요가 없다(Next 15 시절 템플릿과 다르다).
//
// ⚠️ `eslint-config-next/core-web-vitals` 만으로는 **타입스크립트 규칙이 하나도 켜지지 않는다.**
//    이 진입점은 typescript-eslint 파서만 붙이고 규칙은 react/react-hooks/@next/jsx-a11y 뿐이다
//    (any 나 미사용 변수를 잡지 못한다 — `pnpm lint` 가 사실상 무력화된다).
//    그래서 js.configs.recommended 와 `eslint-config-next/typescript`(= typescript-eslint
//    recommended)를 명시적으로 더한다. 참조: React SPA 판의 eslint.config.js 와 같은 구성이다.
const config = [
  // 빌드 산출물과 Next 가 생성하는 앰비언트 타입 선언은 린트 대상이 아니다.
  { ignores: [".next/**", "out/**", "next-env.d.ts"] },
  js.configs.recommended,
  ...nextCoreWebVitals,
  ...nextTypescript,
]

export default config
