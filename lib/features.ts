/**
 * 일시적으로 끈 기능 — 코드는 그대로 두고 여기 값만 바꿔 다시 켠다.
 * 화면 이동(URL 직접 접근)은 next.config.mjs redirects()에서 같이 막는다 — 두 곳을 함께 바꿀 것.
 */
export const FEATURES = {
  /** 재고 탭(/inventory) — 2026-11 잘 안 써서 메뉴에서 숨김 */
  inventory: false,
  /** 고객 화면(/, /display) — 분기 페이지 없이 바로 POS로 */
  customerDisplay: false,
} as const;

/** 개발자 도구에 보여 줄 꺼 둔 기능 목록 */
export const DISABLED_FEATURE_LABELS: Record<keyof typeof FEATURES, string> = {
  inventory: '재고 탭 (/inventory → /pos)',
  customerDisplay: '고객 화면 (/, /display → /pos)',
};
