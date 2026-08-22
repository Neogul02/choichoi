import { HOURS } from './hourly';
import { utcToKst } from '@/lib/date';
import { DAY_NAMES } from '@/lib/staffing';

// getDay()/getUTCDay() 인덱스(0=일 ~ 6=토)와 그대로 맞물리므로 순서를 바꾸면 안 됨
export const DAYS = DAY_NAMES;
export type DayLabel = (typeof DAYS)[number];

// 화면 표시용 순서(월→일). 인덱싱에는 DAYS를, 표시 순서에는 이걸 사용
export const WEEKDAY_ORDER: DayLabel[] = ['월', '화', '수', '목', '금', '토', '일'];

// scripts/validate_palette.js(dataviz 스킬)로 일~토 실제 범례 순서 그대로 CVD 시뮬레이션
// (protanopia/tritanopia) 검증까지 통과한 고정 순서 — 임의 순환 rainbow 팔레트가 아님.
// 일=빨강/토=파랑은 한국 달력 관례 그대로 유지(weekendAccentColor가 참조), 사이 5개 요일은
// 서로 인접해도 구별되는 슬롯만 사용(초록은 매출 강조색과 혼동 방지 위해 제외).
export const DAY_COLORS: Record<DayLabel, string> = {
  '일': '#e34948',
  '월': '#4a3aa7',
  '화': '#eb6834',
  '수': '#1baf7a',
  '목': '#eda100',
  '금': '#e87ba4',
  '토': '#2a78d6',
};

// 평일은 중립색 유지, 토요일은 파란색·일요일은 빨간색으로 주말만 강조
export function weekendAccentColor(day: DayLabel, defaultColor: string): string {
  if (day === '토') return DAY_COLORS['토'];
  if (day === '일') return DAY_COLORS['일'];
  return defaultColor;
}

export function getDayOfWeekLabel(dateStr: string): DayLabel {
  const [y, m, dd] = dateStr.split('-').map(Number);
  return DAYS[new Date(y, m - 1, dd).getDay()];
}

export type DayHourMatrix = Record<DayLabel, Record<number, { revenue: number; orderCount: number }>>;

export function buildDayHourMatrix(
  orders: Array<{ created_at: string; total_price: number }>
): { matrix: DayHourMatrix; activeDays: DayLabel[] } {
  const matrix = {} as DayHourMatrix;
  DAYS.forEach((day) => {
    matrix[day] = {};
    HOURS.forEach((h) => { matrix[day][h] = { revenue: 0, orderCount: 0 }; });
  });

  for (const order of orders) {
    const kst = utcToKst(order.created_at);
    const dayLabel = DAYS[kst.getUTCDay()];
    const kstHour = kst.getUTCHours();
    if (matrix[dayLabel]?.[kstHour] !== undefined) {
      matrix[dayLabel][kstHour].revenue += Number(order.total_price ?? 0);
      matrix[dayLabel][kstHour].orderCount += 1;
    }
  }

  const activeDays = [...DAYS].filter((day) =>
    HOURS.some((h) => matrix[day][h].orderCount > 0)
  ) as DayLabel[];

  return { matrix, activeDays };
}
