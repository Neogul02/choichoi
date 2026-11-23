/**
 * 전체 새로고침 이동 — 로그인·로그아웃·탈퇴 직후처럼 세션 쿠키·localStorage·react-query 캐시를 한 번에 비워야 할 때만 쓴다.
 * 일반 화면 이동은 next/navigation의 router.push를 쓴다(이 함수는 앱 상태를 모두 버린다).
 */
export function hardNavigate(path: string): void {
  window.location.assign(new URL(path, window.location.origin).toString());
}
