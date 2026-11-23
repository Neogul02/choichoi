/**
 * 팝업 정산 예상 — 매출에서 팝업(백화점·몰) 고정 수수료를 뺀 금액.
 * 수수료율은 팝업마다 설정(popup_events.fee_percent)하고, 미설정 팝업·팝업 미지정 매출에는 화면에서 입력한 기본 수수료를 쓴다.
 */
export const feePercentOf = (p: { fee_percent?: number | string | null }): number | null =>
  p.fee_percent == null ? null : Number(p.fee_percent)

/** 매출 × (1 − 수수료%) — 원 단위 반올림 */
export const afterFee = (revenue: number, feePercent: number): number =>
  Math.round(revenue * (1 - Math.min(100, Math.max(0, feePercent)) / 100))

/**
 * 한 달 정산 — 팝업별 매출에 각자 수수료를 적용하고, 팝업으로 나눠지지 않는 나머지(팝업 미지정·날짜 전체 정정으로
 * 팝업 합보다 커진 몫)는 기본 수수료로 계산한다.
 */
export function monthSettlement(
  monthTotal: number,
  popups: { revenue: number; feePercent: number | null }[],
  fallbackFee: number,
): { afterFee: number; fee: number; usesFallback: boolean } {
  const fb = Math.min(100, Math.max(0, fallbackFee))
  let fee = 0
  let usesFallback = false
  let popupSum = 0
  for (const p of popups) {
    popupSum += p.revenue
    if (p.feePercent == null && p.revenue > 0) usesFallback = true
    fee += (p.revenue * (p.feePercent ?? fb)) / 100
  }
  const rest = Math.max(0, monthTotal - popupSum)
  if (rest > 0) usesFallback = true
  fee += (rest * fb) / 100
  fee = Math.round(fee)
  return { afterFee: monthTotal - fee, fee, usesFallback }
}
