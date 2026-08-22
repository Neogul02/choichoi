// 통계탭 전체 Recharts 차트가 공유하는 스타일 토큰 — 그리드/축/툴팁 외관을 한 곳에서 통일해
// 차트마다 제각각이던 회색·강조색 하드코딩(#888, #f0f0f0, #6366f1 등)을 브랜드 토큰으로 정리한다.

/** 격자선 — 항상 var(--color-hairline), 배경에 거의 묻히는 recessive 톤 유지 */
export const CHART_GRID_STROKE = 'var(--color-hairline)';

/** 축 눈금·범례 라벨 공통 스타일 */
export const CHART_TICK_STYLE = { fontSize: 11, fill: 'var(--color-ink-muted)' };

/** 막대 위 값 라벨(LabelList) 공통 스타일 */
export const CHART_VALUE_LABEL_STYLE = { fontSize: 10, fill: 'var(--color-ink-secondary)', fontWeight: 600 };

/** 주 지표(매출 등 크기 비교의 기본 색) — 브랜드 그린 */
export const CHART_ACCENT_PRIMARY = 'var(--color-primary-700)';
export const CHART_ACCENT_PRIMARY_SOFT = 'var(--color-primary-600)';

/** 보조 지표·기준선(평균 페이스, 객단가 등) — 통계탭 전용 강조색인 골드 재사용 */
export const CHART_ACCENT_GOLD = 'var(--color-gold)';

/** 감소·저조 델타 표시 — 앱 전역에서 쓰는 rose-500과 동일 값 */
export const CHART_NEGATIVE = '#f43f5e';
