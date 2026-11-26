import { describe, expect, it } from 'vitest';
import { buildPayrollCopyText, deductionSummary, formatPercent, shortDate } from './payrollCopyText';

const adjustments = [
  { label: '국민연금 4.75%', amount: -98230 },
  { label: '건강보험 3.595%', amount: -74370 },
  { label: '장기요양보험', amount: -9770 },
  { label: '고용보험 0.9%', amount: -18618 },
];

describe('payrollCopyText', () => {
  it('공제 합계와 기본급 대비 비율', () => {
    const s = deductionSummary(2068750, adjustments);
    expect(s.deductTotal).toBe(200988);
    expect(formatPercent(s.deductPct!)).toBe('9.72');
    expect(s.addTotal).toBe(0);
  });

  it('formatPercent는 끝의 0을 뺀다', () => {
    expect(formatPercent(10)).toBe('10');
    expect(formatPercent(3.3)).toBe('3.3');
  });

  it('shortDate', () => {
    expect(shortDate('2026-11-01')).toBe('11/1(일)');
  });

  it('지급액 → 기본급 → 공제 → 근무 일자 순', () => {
    const text = buildPayrollCopyText({
      name: '김채아', periodLabel: '2026년 11월',
      days: [
        { date: '2026-11-01', timeRange: '09:41~14:53', hours: 5.2, breakMinutes: 0 },
        { date: '2026-11-21', timeRange: '09:38~17:18', hours: 6.2, breakMinutes: 90 },
      ],
      totalHours: 165.5, breakHours: 18, rateText: '12,500원', basePay: 2068750,
      adjustments: [...adjustments, { label: '교통비', amount: 10000 }],
      finalPay: 1877762, insuranceNote: '국민연금·건강보험 가입 대상',
    });
    expect(text).toContain('💰 지급액 1,877,762원');
    expect(text).toContain('근무 2일 · 165.5시간 (휴게 18시간 제외)');
    expect(text).toContain('➖ 공제 −200,988원 (기본급의 9.72%)');
    expect(text).toContain('· 국민연금 4.75% 98,230원');
    expect(text).toContain('➕ 추가 +10,000원');
    expect(text).toContain('11/1(일) 09:41~14:53 5.2h');
    expect(text).not.toContain('11/1(일) 09:41~14:53 5.2h ·');
    expect(text).toContain('11/21(토) 09:38~17:18 6.2h · 휴게 1시간 30분');
    expect(text.indexOf('지급액')).toBeLessThan(text.indexOf('기본급'));
    expect(text.indexOf('공제')).toBeLessThan(text.indexOf('[ 근무 일자 ]'));
  });
});
