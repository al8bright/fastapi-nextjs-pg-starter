// 세션 쿠키 이름만 담는 모듈 — **의존성이 없어야 한다**.
//
// middleware 는 Edge 런타임에서 요청마다 돈다. 상수 하나를 쓰려고 lib/session.ts 를 import 하면
// 그 파일이 물고 있는 `server-only`·`next/headers`·`next/navigation`·FastAPI 래퍼가 전부
// Edge 번들에 끌려온다 (side-effect import 라 트리셰이킹되지 않는다).
// Next 가 middleware 레이어에서 `server-only` 를 무해하게 처리해 주는 데 기대는 구조라
// 버전이 바뀌면 조용히 깨진다 — 그래서 상수만 여기로 분리한다.
//
// ⛔ 이 파일에는 어떤 import 도 추가하지 마라.

/** 세션 쿠키 이름 — 같은 도메인에 여러 프로젝트를 올릴 때 충돌하지 않도록 프로젝트별로 분리한다. */
export const SESSION_COOKIE = "__PROJECT_SNAKE___session"
