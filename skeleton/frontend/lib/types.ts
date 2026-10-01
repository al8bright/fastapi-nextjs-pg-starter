// 백엔드 스키마와 동기화되는 타입 (ARCHITECTURE.md §8, §13).
// 원본은 backend/app/schemas/{user,health,common,notice,banner,admin}.py 다 — 백엔드를 바꾸면 여기도 함께 바꾼다.
// 서버(lib/server/*)·클라이언트 컴포넌트 양쪽이 import 하므로 server-only 모듈에 두지 않는다.
// 날짜는 전부 KST naive ISO 문자열("2026-10-02T10:00:00")이다 — Date 로 바꾸지 않는다(lib/format.ts).

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

// ---------- 공통 (schemas/common.py) ----------

/** 목록 페이지 응답 — page 는 1부터, total 은 필터 적용 후 전체 건수. */
export interface Page<T> {
  items: T[]
  total: number
  page: number
  size: number
}

/** 이미지 업로드 응답 — key 는 이후 요청(배너 저장 등)에서 참조, url 은 바로 표시용. */
export interface UploadedImage {
  key: string
  url: string
  width: number
  height: number
}

// ---------- 공지사항 (schemas/notice.py) ----------

export interface Attachment {
  id: number
  original_name: string
  size_bytes: number
  content_type: string
  /** 공개 다운로드 URL(게시된 공지만 동작) — Next 가 같은 오리진에서 백엔드로 rewrite 한다(next.config.ts). */
  download_url: string
}

export interface NoticeListItem {
  id: number
  title: string
  is_pinned: boolean
  published_at: string | null
  view_count: number
  has_attachments: boolean
}

export interface NoticeDetail {
  id: number
  title: string
  /** 서버가 저장 시 정화한 HTML — RichContent 에 그대로 넣는다. */
  body_html: string
  is_pinned: boolean
  published_at: string | null
  view_count: number
  created_at: string
  updated_at: string
  attachments: Attachment[]
}

export interface AdminNoticeListItem {
  id: number
  title: string
  is_pinned: boolean
  is_published: boolean
  published_at: string | null
  view_count: number
  has_attachments: boolean
  author_id: number | null
  author_username: string | null
  created_at: string
  updated_at: string
}

export interface AdminNoticeDetail extends AdminNoticeListItem {
  body_html: string
  attachments: Attachment[]
}

/** 생성(POST)·수정(PUT) 공통 본문 — PUT 은 전체 교체. */
export interface NoticeWrite {
  title: string
  body_html: string
  is_pinned: boolean
  is_published: boolean
}

// ---------- 배너 (schemas/banner.py) ----------

/** 공개 배너 — 활성 + 노출 기간 안, sort_order → id 순. */
export interface BannerPublic {
  id: number
  title: string
  image_url: string
  width: number
  height: number
  link_url: string | null
  alt_text: string
}

export interface BannerAdmin {
  id: number
  title: string
  image_key: string
  image_url: string
  image_width: number
  image_height: number
  link_url: string | null
  alt_text: string
  /** KST naive ISO. null 이면 기간 제한 없음. */
  starts_at: string | null
  ends_at: string | null
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

/** 생성(POST)·수정(PUT) 공통 본문 — sort_order 를 생략하면 생성 시 맨 뒤·수정 시 유지. */
export interface BannerWrite {
  title: string
  image_key: string
  link_url?: string | null
  alt_text?: string
  starts_at?: string | null
  ends_at?: string | null
  sort_order?: number | null
  is_active?: boolean
}

// ---------- 관리자 (schemas/admin.py) ----------

export interface Dashboard {
  users: { total: number; active: number; inactive: number }
  active_sessions: number
  locked_accounts: number
  notices: { published: number; draft: number }
  active_banners: number
  db: "ok" | "error"
  /** 적용된 Alembic 리비전. alembic_version 테이블이 없으면 null. */
  alembic_revision: string | null
}

export interface AdminUser {
  id: number
  username: string
  role: UserRole
  is_active: boolean
  created_at: string
  active_session_count: number
}

/** 부분 수정 — 보낸 필드만 바꾼다. 409 self_modification·last_admin. */
export interface AdminUserUpdate {
  role?: UserRole
  is_active?: boolean
}

export interface AdminSession {
  id: number
  user_id: number
  username: string
  created_at: string
  last_used_at: string
  expires_at: string
}

export interface LoginThrottle {
  username: string
  failed_count: number
  locked_until: string | null
  last_failed_at: string
  is_locked: boolean
}
