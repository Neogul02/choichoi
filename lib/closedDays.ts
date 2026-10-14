import { addDays, dayOfWeek } from '@/lib/date';
import type { PopupClosedDay } from '@/types/database';

/**
 * 팝업 휴무일 — 운영 기간 안이지만 영업하지 않는 날(백화점 정기휴점 등).
 *
 * **이 파일이 "그 날이 휴무인가"의 유일한 기준이다.** 근무표·일정표·일괄 배정·지난주 복사가
 * 전부 이 판정을 쓴다. 화면마다 따로 판정하면 한쪽에선 휴무로 가려지고 다른 쪽에선 근무자가
 * 나오는 상태가 생긴다.
 *
 * 저장은 날짜 행(popup_closed_days) 하나로만 한다 — 행이 있으면 휴무, 없으면 영업.
 * "매주 ○요일"은 요일 규칙을 따로 저장하지 않고 `weekdayDatesInRange()`로 기간에 펼쳐 넣는다.
 *
 * **급여는 건드리지 않는다.** 근무 사실은 `roster_assignments` 행에 있고 휴무일은 보조값이다.
 * 휴무로 지정해도 이미 찍힌 배정은 남으며, 삭제는 관리자가 건수를 보고 따로 확인해야 한다.
 */
export type ClosedDayIndex = Map<string, string | null>;

const key = (popupId: number, dateStr: string) => `${popupId}|${dateStr}`;

export function buildClosedDayIndex(rows: Pick<PopupClosedDay, 'popup_id' | 'closed_date' | 'reason'>[]): ClosedDayIndex {
  return new Map(rows.map(r => [key(r.popup_id, r.closed_date), r.reason]));
}

/**
 * 그 팝업의 그 날이 휴무인지.
 * 휴무일은 팝업에 귀속되므로 `popupId`가 null인 단위(주방)는 항상 영업으로 본다 —
 * 주방은 팝업이 쉬어도 준비·손질 일이 돌아가고, 애초에 어느 팝업의 휴무인지 특정할 수 없다.
 */
export function isClosedDay(index: ClosedDayIndex | undefined, popupId: number | null, dateStr: string): boolean {
  if (!index || popupId == null) return false;
  return index.has(key(popupId, dateStr));
}

/** 휴무 사유 — 휴무일이지만 사유를 안 적었으면 null, 휴무일이 아니면 undefined */
export function closedDayReason(index: ClosedDayIndex | undefined, popupId: number | null, dateStr: string): string | null | undefined {
  if (!index || popupId == null) return undefined;
  return index.get(key(popupId, dateStr));
}

/** 여러 팝업이 섞인 화면(캐셔 "전체" 보기)에서 "이 날 쉬는 팝업이 하나라도 있나" */
export function hasClosedPopupOnDate(index: ClosedDayIndex | undefined, popupIds: number[], dateStr: string): boolean {
  return popupIds.some(id => isClosedDay(index, id, dateStr));
}

/**
 * 기간(양끝 포함) 안에서 그 요일에 해당하는 날짜 전체 — "매주 ○요일 휴무 일괄 지정"용.
 * weekday: 0=일 ~ 6=토
 */
export function weekdayDatesInRange(fromDate: string, toDate: string, weekday: number): string[] {
  if (fromDate > toDate) return [];
  const dates: string[] = [];
  for (let d = fromDate; d <= toDate; d = addDays(d, 1)) {
    if (dayOfWeek(d) === weekday) dates.push(d);
  }
  return dates;
}

/** 휴무일을 뺀 날짜 목록 — 일괄 배정이 기간을 펼친 뒤 통과시키는 필터 */
export function excludeClosedDays(index: ClosedDayIndex | undefined, popupId: number | null, dates: string[]): string[] {
  if (!index || popupId == null) return dates;
  return dates.filter(d => !isClosedDay(index, popupId, d));
}
