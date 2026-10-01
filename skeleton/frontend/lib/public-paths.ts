// 로그인 없이 볼 수 있는 화면 판정 — proxy.ts 가 쓴다. **의존성이 없어야 한다**(proxy·Vitest 공용).

/**
 * 공개 화면 — 홈(`/`)과 공지(`/notices`, `/notices/<id>`).
 *
 * ⚠️ **허용 목록**이다. 여기 없는 경로는 전부 보호된다(새 화면은 기본이 보호 — 빠뜨려도 안전한 쪽으로 실패).
 *    공개 화면을 늘리면 여기에 더한다. 앵커(정확히 같거나 `/` 로 이어지는 하위 경로)를 지키지 않으면
 *    `/notices-admin` 같은 평범한 보호 경로가 공개로 새어 나간다.
 * 공개라도 proxy 는 탄다 — 만료된 access 쿠키를 refresh 쿠키로 이어 헤더가 로그인 상태를 보이게 한다(proxy.ts).
 */
export function isPublicPath(pathname: string): boolean {
  return pathname === "/" || pathname === "/notices" || pathname.startsWith("/notices/")
}
