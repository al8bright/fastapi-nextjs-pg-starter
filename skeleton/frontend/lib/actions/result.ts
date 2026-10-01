// Server Action 공통 결과 타입·입력 정리 — "use server" 파일이 아니다(상수·동기 함수도 둘 수 있다).
// 액션 파일("use server")은 async 함수만 export 할 수 있어서 이런 도우미를 여기로 뺀다.

/** 폼 없는 변경(삭제·토글·강제 종료)의 결과 — 실패는 던지지 않고 문구로 돌려준다. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string }

/** 클라이언트가 보낸 id 를 양의 정수로만 받는다. 아니면 null. */
export function toId(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(typeof value === "string" ? value : NaN)
  return Number.isInteger(n) && n > 0 ? n : null
}

export const INVALID_TARGET = "잘못된 요청입니다. 화면을 새로고침한 뒤 다시 시도하세요."
