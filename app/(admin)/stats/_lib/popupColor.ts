// 달력에 팝업 일정을 겹쳐 그릴 때 쓰는 색. 한 달에 같이 도는 팝업이 서로 구분되어야 하므로
// 색상환을 넓게 도는 순서로 나열했다 — 인접한 두 색이 비슷하면 달력 칸의 얇은 띠에서 구분이 안 된다.
//
// 팝업 id로 색을 고정하지 않고 "그 달의 등장 순서"로 배정한다. id는 띄엄띄엄 생성돼
// (현재 2~32) id % 길이로 돌리면 같은 달 두 팝업이 같은 색을 받는 일이 생긴다.
const POPUP_COLORS = [
  '#0ea5e9', // 하늘
  '#f59e0b', // 주황
  '#8b5cf6', // 보라
  '#10b981', // 초록
  '#f43f5e', // 분홍
  '#64748b', // 회청
  '#14b8a6', // 청록
  '#d946ef', // 자홍
] as const;

/** popupId가 null인 "팝업 미지정" 몫 — 팝업 색과 섞이지 않게 중립 회색으로 둔다 */
export const UNASSIGNED_POPUP_COLOR = '#b4b0aa';

/**
 * 그 달에 보이는 팝업 id 목록(등장 순서)에서 색을 뽑는 함수를 만든다.
 * 목록에 없는 id, 그리고 null(미지정)은 중립 회색을 받는다.
 */
export function makePopupColorOf(orderedPopupIds: number[]): (popupId: number | null) => string {
  const colorById = new Map<number, string>();
  for (const id of orderedPopupIds) {
    if (!colorById.has(id)) colorById.set(id, POPUP_COLORS[colorById.size % POPUP_COLORS.length]);
  }
  return (popupId) => (popupId == null ? UNASSIGNED_POPUP_COLOR : colorById.get(popupId) ?? UNASSIGNED_POPUP_COLOR);
}
