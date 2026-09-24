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
//    recommended)를 명시적으로 더한다.
const config = [
  // 빌드 산출물과 Next 가 생성하는 앰비언트 타입 선언은 린트 대상이 아니다.
  { ignores: [".next/**", "out/**", "next-env.d.ts"] },
  js.configs.recommended,
  ...nextCoreWebVitals,
  ...nextTypescript,
  // ⚠️ ESLint 10 은 v9 에서 deprecated 였던 context.getFilename() 등을 제거했다.
  //    eslint-plugin-react(eslint-config-next 의존성)의 React 버전 자동 감지("detect")가
  //    아직 그 API 를 쓰므로, 감지를 건너뛰도록 버전을 명시해 우회한다.
  //    React 를 올릴 때 이 값도 함께 맞춘다(SSOT 는 package.json 의 react 핀).
  { settings: { react: { version: "19.3" } } },
]

export default config
