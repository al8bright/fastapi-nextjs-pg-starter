// 백엔드 스키마와 동기화되는 타입 (architecture.md §8, §13).
// 원본은 backend/app/schemas/user.py · health.py 다 — 백엔드를 바꾸면 여기도 함께 바꾼다.

export type UserRole = "user" | "admin"

/** backend: UserRead */
export interface User {
  id: number
  username: string
  role: UserRole
  is_active: boolean
}

/** backend: TokenResponse — /auth/login·/auth/refresh 가 같은 형태를 돌려준다(회전된 새 쌍). */
export interface TokenResponse {
  access_token: string
  /** 불투명 문자열 — 프론트는 해석하지 않고 쿠키에 담아 /auth/refresh 로 되돌려 보내기만 한다. */
  refresh_token: string
  token_type: string
  /** access 토큰 유효 초 (기본 15분). 쿠키 maxAge 계산에 쓴다 — lib/session-cookie.ts 참고. */
  expires_in: number
  /** refresh 토큰 유효 초 (기본 14일). */
  refresh_expires_in: number
}

/** backend: DbHealth (GET /api/v1/health/db) */
export interface DbHealth {
  db: string
  table: string
  rows: number
}

/** backend: GET /api/v1/health */
export interface Health {
  status: string
}
