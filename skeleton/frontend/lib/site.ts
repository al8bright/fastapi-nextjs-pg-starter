// 사이트 공통 상수 — 스캐폴드가 __PROJECT_NAME__ 을 프로젝트 이름으로 치환한다.
export const SITE_NAME = "__PROJECT_NAME__"

/** 로고 마크에 쓰는 첫 글자(영문이면 대문자). */
export const SITE_MARK = SITE_NAME.trim().charAt(0).toUpperCase() || "P"
