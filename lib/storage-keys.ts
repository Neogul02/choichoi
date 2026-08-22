// 로그인 상태를 나타내는 localStorage/cookie 키 — password-gate.tsx(로그인)와
// NavBar.tsx(로그아웃) 양쪽에서 공유하는 단일 소스. 여기 문자열을 바꾸면 두 곳 모두 자동 반영된다.
export const CASHIER_NAME_KEY = 'choichoi_cashier_name'
export const POPUP_ID_KEY = 'choichoi_popup_id'
export const POPUP_NAME_KEY = 'choichoi_popup_name'
export const WORKER_ROLE_KEY = 'choichoi_worker_role'
export const APP_ROLE_KEY = 'choichoi_app_role'

export function setPopupIdCookie(popupId: string) {
  try { document.cookie = `${POPUP_ID_KEY}=${popupId}; path=/; max-age=31536000; samesite=lax` } catch { /* ignore */ }
}

export function clearPopupIdCookie() {
  try { document.cookie = `${POPUP_ID_KEY}=; path=/; max-age=0` } catch { /* ignore */ }
}

/** 로그인 상태 관련 localStorage 5종 + 팝업 쿠키를 한 번에 정리 — 로그아웃, 세션 만료 양쪽에서 재사용 */
export function clearChoichoiStorage() {
  try {
    localStorage.removeItem(CASHIER_NAME_KEY)
    localStorage.removeItem(POPUP_ID_KEY)
    localStorage.removeItem(POPUP_NAME_KEY)
    localStorage.removeItem(WORKER_ROLE_KEY)
    localStorage.removeItem(APP_ROLE_KEY)
  } catch { /* ignore */ }
  clearPopupIdCookie()
}
