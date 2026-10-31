import type { TodayPopupSales } from '@/types/api';

/** 영업 시간대 기본 축 — 매출이 없는 시간도 축에 남겨야 "하루 중 어디쯤인지"가 읽힌다 */
export const AXIS_FROM = 7;
export const AXIS_TO = 22;

export const curveKeyOf = (popupId: number) => `p${popupId}`;
/** 기준 곡선(통계탭의 "어제") 한 줄이 쓰는 키 */
export const REFERENCE_KEY = 'ref';

export interface HourRevenue {
  hour: number;
  revenue: number;
}

export interface SalesCurve {
  /** recharts에 그대로 넘기는 포인트 배열 — 인덱스 i는 시각 (from + i) */
  data: Array<Record<string, number | null>>;
  from: number;
  to: number;
  /** 키별 "선두" 인덱스 — 곡선 끝 글로우를 켤 지점. 매출이 0인 선은 들어있지 않다 */
  leadIndexByKey: Record<string, number>;
}

/**
 * 시간대별 매출을 누적 곡선 포인트로 바꾼다. 차트가 쓰는 규칙 전부가 여기 모여 있다:
 *
 * 1. 축은 07~22를 기본으로 두되 그 밖에 매출이 있으면 넓힌다 — 데이터가 조용히 잘리면 안 된다.
 * 2. 마지막으로 매출이 있던 시각 이후는 null로 끊는다. 끝까지 수평으로 이으면 아직 남은
 *    영업시간이 이미 끝난 것처럼 보인다.
 * 3. 기준 곡선(어제)은 하루가 끝났으므로 오늘 곡선의 절단 시각에 끌려가면 안 된다 — 각자 따로 잡는다.
 * 4. 선두 인덱스는 이 함수가 같이 돌려준다. 절단 규칙과 한 곳에서 나와야 글로우가 선 끝에서 어긋나지 않는다.
 * 5. 매출이 한 푼도 없는 선에는 선두를 주지 않는다 — 0원 수평선 끝에서 반짝이면 방해만 된다.
 */
export function buildSalesCurve(
  rows: TodayPopupSales[],
  reference?: { hourly: HourRevenue[] } | null,
): SalesCurve {
  const refHourly = reference?.hourly ?? [];
  const todayHours = rows.flatMap(r => r.hourly.map(h => h.hour));
  const hours = [...todayHours, ...refHourly.map(h => h.hour)];

  const from = Math.min(AXIS_FROM, ...(hours.length ? hours : [AXIS_FROM]));
  const to = Math.max(AXIS_TO, ...(hours.length ? hours : [AXIS_TO]));

  const lastActive = todayHours.length ? Math.max(...todayHours) : from;
  const refLastActive = refHourly.length ? Math.max(...refHourly.map(h => h.hour)) : null;
  const refByHour = new Map(refHourly.map(h => [h.hour, h.revenue]));
  let refAcc = 0;

  const acc = new Map<number, number>(rows.map(r => [r.popupId, 0]));
  const byPopupHour = new Map<string, number>();
  for (const r of rows) for (const h of r.hourly) byPopupHour.set(`${r.popupId}|${h.hour}`, h.revenue);

  const data: Array<Record<string, number | null>> = [];
  for (let h = from; h <= to; h++) {
    const point: Record<string, number | null> = { hour: h };
    for (const r of rows) {
      const next = (acc.get(r.popupId) ?? 0) + (byPopupHour.get(`${r.popupId}|${h}`) ?? 0);
      acc.set(r.popupId, next);
      point[curveKeyOf(r.popupId)] = h <= lastActive ? next : null;
    }
    if (refLastActive != null) {
      refAcc += refByHour.get(h) ?? 0;
      point[REFERENCE_KEY] = h <= refLastActive ? refAcc : null;
    }
    data.push(point);
  }

  const leadIndexByKey: Record<string, number> = {};
  for (const r of rows) {
    if ((acc.get(r.popupId) ?? 0) > 0) leadIndexByKey[curveKeyOf(r.popupId)] = lastActive - from;
  }
  if (refLastActive != null && refAcc > 0) leadIndexByKey[REFERENCE_KEY] = refLastActive - from;

  return { data, from, to, leadIndexByKey };
}

/**
 * 행들을 지정 시각까지 합산 — 오늘(진행 중)과 과거를 같은 잣대로 맞출 때 쓴다.
 * 하루 전체 합과 맞대면 오전엔 늘 "폭망"으로 보이므로 비교는 항상 이 값끼리 한다.
 */
export const sumUpto = (rows: TodayPopupSales[], hourCap: number) =>
  rows.reduce(
    (sum, p) => sum + p.hourly.reduce((s, h) => (h.hour <= hourCap ? s + h.revenue : s), 0),
    0,
  );

/** 여러 팝업의 시간대 매출을 한 줄로 합친다 — 기준 곡선(어제)을 범위 합계로 그릴 때 */
export function mergeHourly(rows: TodayPopupSales[]): HourRevenue[] {
  const byHour = new Map<number, number>();
  for (const r of rows) {
    for (const h of r.hourly) byHour.set(h.hour, (byHour.get(h.hour) ?? 0) + h.revenue);
  }
  return [...byHour.entries()]
    .map(([hour, revenue]) => ({ hour, revenue }))
    .sort((a, b) => a.hour - b.hour);
}

/**
 * KST 기준 오늘에서 delta일 떨어진 하루의 경계(UTC ISO).
 * created_at은 naive UTC 컬럼이라 KST 경계를 UTC로 환산해 넘겨야 9시간이 어긋나지 않는다.
 */
export function kstDayBounds(today: string, delta: number): { startISO: string; endISO: string } {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  const day = d.toISOString().slice(0, 10);
  return {
    startISO: new Date(`${day}T00:00:00+09:00`).toISOString(),
    endISO: new Date(`${day}T23:59:59.999+09:00`).toISOString(),
  };
}

/**
 * 기준일(오늘 + delta일)의 "지금 시 정각 ~ 지금 분" 구간 — 진행 중인 시를 분 단위로 맞대기 위한 조회 범위.
 * RPC가 끝을 포함(<=)하므로 끝은 그 분 직전(−1ms)이다. 정각(minute 0)이면 볼 구간이 없어 null.
 */
export function kstPartialHourBounds(
  today: string, delta: number, hour: number, minute: number,
): { startISO: string; endISO: string } | null {
  if (minute <= 0) return null;
  const { startISO } = kstDayBounds(today, delta);
  const start = new Date(startISO).getTime() + hour * 3_600_000;
  return {
    startISO: new Date(start).toISOString(),
    endISO: new Date(start + minute * 60_000 - 1).toISOString(),
  };
}

/**
 * 기준일의 "같은 시각(분 단위)까지" 누적 — 끝난 시는 하루치 행에서, 진행 중인 시는 그 시 정각~지금 분 구간 조회
 * 결과(partial)에서 더한다. 시 단위로만 자르면 14:05에 기준일은 14:59까지 들어가 오늘이 늘 불리해 보였다.
 */
export const sumUptoMinute = (full: TodayPopupSales[], partial: TodayPopupSales[], hour: number) =>
  sumUpto(full, hour - 1) + partial.reduce((s, p) => s + p.totalRevenue, 0);
