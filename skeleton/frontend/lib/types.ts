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

/** backend: TokenResponse */
export interface TokenResponse {
  access_token: string
  token_type: string
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
