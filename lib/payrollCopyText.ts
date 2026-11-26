// 급여 상세 '급여 내역 복사' 문구 — 직원에게 카톡·문자로 보내는 글.
// 받는 사람이 먼저 보는 건 '얼마 받나'와 '왜 빠졌나'라서 지급액 → 기본급 → 공제(합계와 기본급 대비 %) → 근무 일자 순으로 짧게 쓴다.

export interface CopyAdjustment { label: string; amount: number }
export interface CopyDay {
  /** YYYY-MM-DD */
  date: string;
  /** '09:41~14:53' */
  timeRange: string;
  hours: number;
  breakMinutes: number;
}

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
const DAY = ['일', '월', '화', '수', '목', '금', '토'];

/** 소수 둘째 자리까지, 끝의 0은 뺀다 — 9.7171… → '9.72', 10 → '10' */
export function formatPercent(v: number): string {
  return String(Math.round(v * 100) / 100);
}

/** 공제(음수 조정) 합계와 기본급 대비 비율, 수당(양수 조정) 합계 */
export function deductionSummary(basePay: number | null, adjustments: CopyAdjustment[]) {
  const deductions = adjustments.filter(a => a.amount < 0);
  const additions = adjustments.filter(a => a.amount > 0);
  const deductTotal = deductions.reduce((s, a) => s - a.amount, 0);
  const addTotal = additions.reduce((s, a) => s + a.amount, 0);
  const deductPct = basePay && basePay > 0 ? (deductTotal / basePay) * 100 : null;
  return { deductions, additions, deductTotal, addTotal, deductPct };
}

/** '2026-11-01' → '11/1(일)' */
export function shortDate(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}(${DAY[d.getDay()]})`;
}

const breakText = (min: number) => {
  if (min <= 0) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return ` · 휴게 ${h > 0 ? `${h}시간` : ''}${h > 0 && m > 0 ? ' ' : ''}${m > 0 ? `${m}분` : ''}`;
};

export function buildPayrollCopyText(p: {
  name: string;
  periodLabel: string;
  days: CopyDay[];
  totalHours: number;
  breakHours: number;
  /** '12,500원' 또는 '12,500원 → 13,000원(1/1부터)' */
  rateText: string | null;
  basePay: number | null;
  adjustments: CopyAdjustment[];
  finalPay: number | null;
  /** '4대보험 가입 대상' 같은 한 줄 안내(없으면 생략) */
  insuranceNote?: string | null;
}): string {
  const { deductions, additions, deductTotal, addTotal, deductPct } = deductionSummary(p.basePay, p.adjustments);
  const lines: string[] = [`📋 ${p.name} 님 ${p.periodLabel} 급여`, ''];

  if (p.finalPay != null) lines.push(`💰 지급액 ${won(p.finalPay)}`, '');

  lines.push(`근무 ${p.days.length}일 · ${p.totalHours}시간${p.breakHours > 0 ? ` (휴게 ${p.breakHours}시간 제외)` : ''}`);
  if (p.rateText) lines.push(`시급 ${p.rateText}`);
  if (p.basePay != null) lines.push(`기본급 ${won(p.basePay)}`);

  if (additions.length > 0) {
    lines.push('', `➕ 추가 +${won(addTotal)}`);
    for (const a of additions) lines.push(`· ${a.label} +${won(a.amount)}`);
  }

  if (deductions.length > 0) {
    lines.push('', `➖ 공제 −${won(deductTotal)}${deductPct != null ? ` (기본급의 ${formatPercent(deductPct)}%)` : ''}`);
    for (const a of deductions) lines.push(`· ${a.label} ${won(-a.amount)}`);
  }
  if (p.insuranceNote) lines.push(`※ ${p.insuranceNote}`);

  if (p.days.length > 0) {
    lines.push('', '[ 근무 일자 ]');
    for (const d of p.days) lines.push(`${shortDate(d.date)} ${d.timeRange} ${d.hours}h${breakText(d.breakMinutes)}`);
  }
  return lines.join('\n');
}
