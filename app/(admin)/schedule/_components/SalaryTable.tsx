'use client';

import { useState } from 'react';
import { formatHours, MIN_HOURLY_WAGE, checkBreakCompliance, calcWeeklyHolidayPay, parseRawHours } from '@/lib/utils';
import type { Worker } from '@/types/database';

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'] as const;

export type SalaryEntry = { date: string; role: string; workTime: string | null; breakTime: number; hours: number };
export type SalaryGroup = { key: string; worker: Worker | null; name: string; entries: SalaryEntry[] };

interface Props {
  eventName: string;
  salaryGroups: SalaryGroup[];
  grandTotal: { hours: number; pay: number };
  localRates: Record<string, number>;
  onRateChange: (worker: Worker | null, name: string, rate: number) => void;
  onPaymentToggle: (worker: Worker) => void;
}

export default function SalaryTable({ eventName, salaryGroups, localRates, onRateChange, onPaymentToggle }: Props) {
  const [draftRates, setDraftRates] = useState<Record<string, string>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [includeHoliday, setIncludeHoliday] = useState<Record<string, boolean>>({});

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    });
  }

  // 휴게시간 미준수 경고 수집
  const breakWarnings = salaryGroups.flatMap(group =>
    group.entries
      .filter(e => {
        const bc = checkBreakCompliance(e.workTime, e.breakTime);
        return !bc.compliant && bc.required;
      })
      .map(e => {
        const raw = parseRawHours(e.workTime);
        const d = new Date(e.date + 'T00:00:00');
        const dateLabel = `${d.getMonth() + 1}/${d.getDate()}(${DAY_NAMES[d.getDay()]})`;
        return { name: group.name, dateLabel, raw, minBreak: raw >= 8 ? '1시간' : '30분' };
      })
  );

  // 주휴수당 포함한 전체 합계
  const grandTotalWithHoliday = salaryGroups.reduce((acc, group) => {
    const rate = group.worker ? group.worker.hourly_rate : (localRates[group.name] ?? 0);
    const totalHours = group.entries.reduce((s, e) => s + e.hours, 0);
    const weeklyInfo = calcWeeklyHolidayPay(group.entries, rate);
    const rateIncludesHoliday = includeHoliday[group.key] ?? false;
    const holidayPay = rateIncludesHoliday ? 0 : weeklyInfo.reduce((s, w) => s + w.amount, 0);
    return { hours: acc.hours + totalHours, pay: acc.pay + totalHours * rate + holidayPay };
  }, { hours: 0, pay: 0 });

  return (
    <div className="mt-5 bg-canvas rounded-xl p-4 shadow-level-1 border border-hairline">
      <h3 className="m-0 mb-1 text-lg font-extrabold">급여 계산서 — {eventName}</h3>
      <div className="flex items-center gap-2 mb-4 text-[11px] text-ink-muted">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-semibold">
          2026 최저시급 {MIN_HOURLY_WAGE.toLocaleString('ko-KR')}원
        </span>
        <span>· 시급이 최저시급 미만이면 경고 표시</span>
      </div>
      <div className="overflow-x-auto [scrollbar-width:thin] select-text">
        <table className="w-full border-collapse text-sm min-w-[600px]">
          <thead>
            <tr className="bg-canvas-soft">
              {['이름', '근무날짜', '근무시간', '총 근무시간', '시급 (원)', '최종 급여', '송금'].map(h => (
                <th key={h} className="border border-hairline px-3 py-2 text-xs font-semibold text-ink-muted text-left whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {salaryGroups.flatMap(group => {
              const totalHours = group.entries.reduce((s, e) => s + e.hours, 0);
              const rate = group.worker ? group.worker.hourly_rate : (localRates[group.name] ?? 0);
              const weeklyInfo = calcWeeklyHolidayPay(group.entries, rate);
              const eligibleWeeks = weeklyInfo.filter(w => w.eligible);
              // true = 시급에 주휴수당 이미 포함 → 추가 계산 안 함
              const rateIncludesHoliday = includeHoliday[group.key] ?? false;
              const totalHolidayPay = rateIncludesHoliday ? 0 : weeklyInfo.reduce((s, w) => s + w.amount, 0);
              const basePay = totalHours * rate;
              const finalPay = basePay + totalHolidayPay;
              const isBelowMin = rate > 0 && rate < MIN_HOURLY_WAGE;

              return group.entries.map((entry, idx) => {
                const d = new Date(entry.date + 'T00:00:00');
                const dateLabel = `${d.getMonth() + 1}/${d.getDate()}(${DAY_NAMES[d.getDay()]})`;
                const breakLabel = entry.breakTime === 30 ? '(-30분)' : entry.breakTime === 60 ? '(-1h)' : null;

                return (
                  <tr key={`${group.key}-${idx}`} className={group.worker?.payment_done ? 'bg-gray-100 text-gray-400' : 'hover:bg-canvas-soft'}>
                    {idx === 0 && (
                      <td className="border border-hairline px-3 py-2 align-top font-bold text-ink" rowSpan={group.entries.length}>
                        <div className="text-sm">{group.name}</div>
                        {group.worker?.phone && <div className="text-[10px] text-ink-muted font-normal mt-0.5">{group.worker.phone}</div>}
                        {eligibleWeeks.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {eligibleWeeks.map(w => (
                              <span key={w.weekKey}
                                title={`${w.weekKey}: ${w.hours.toFixed(1)}h 근무 → 주휴수당 ${w.amount.toLocaleString('ko-KR')}원`}
                                className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-help">
                                주휴
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    )}
                    <td className="border border-hairline px-3 py-2 text-xs text-ink-muted whitespace-nowrap">{dateLabel}</td>
                    <td className="border border-hairline px-3 py-2 text-xs text-ink-muted">
                      {entry.workTime ?? '-'}
                      {breakLabel && <span className="ml-1 text-[10px] text-orange-500">{breakLabel}</span>}
                    </td>
                    {idx === 0 && (
                      <td className="border border-hairline px-3 py-2 text-center font-bold align-top" rowSpan={group.entries.length}>
                        {formatHours(totalHours)}
                      </td>
                    )}
                    {idx === 0 && (
                      <td className="border border-hairline px-2 py-2 text-center align-top" rowSpan={group.entries.length}>
                        <input
                          type="number" min={0} step={100}
                          value={group.key in draftRates ? draftRates[group.key] : (rate || '')}
                          onChange={e => setDraftRates(p => ({ ...p, [group.key]: e.target.value }))}
                          onBlur={() => {
                            if (group.key in draftRates) {
                              onRateChange(group.worker, group.name, parseInt(draftRates[group.key]) || 0);
                              setDraftRates(p => { const n = { ...p }; delete n[group.key]; return n; });
                            }
                          }}
                          placeholder="시급"
                          className={`w-[88px] px-2 py-1 border rounded text-xs text-right focus:outline-none focus:border-primary-700 ${isBelowMin ? 'border-red-400 bg-red-50' : 'border-hairline'}`}
                          title={isBelowMin ? `주휴수당 포함 최저시급(${MIN_HOURLY_WAGE.toLocaleString()}원) 미만입니다` : undefined}
                        />
                        {isBelowMin && (
                          <div className="text-[9px] text-red-500 font-semibold mt-0.5">최저시급 미만</div>
                        )}
                        {eligibleWeeks.length > 0 && (
                          <label className="flex items-center justify-center gap-1 mt-1.5 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={rateIncludesHoliday}
                              onChange={e => setIncludeHoliday(p => ({ ...p, [group.key]: e.target.checked }))}
                              className="w-3 h-3 cursor-pointer accent-emerald-600"
                            />
                            <span className="text-[9px] text-ink-muted">시급에 주휴 포함</span>
                          </label>
                        )}
                      </td>
                    )}
                    {idx === 0 && (
                      <td className="border border-hairline px-3 py-2 text-right font-bold text-primary-700 align-top" rowSpan={group.entries.length}>
                        <div>{rate > 0 ? `${finalPay.toLocaleString('ko-KR')}원` : '-'}</div>
                        {!rateIncludesHoliday && totalHolidayPay > 0 && (
                          <div className="text-[10px] font-normal text-emerald-600 mt-0.5">주휴 +{totalHolidayPay.toLocaleString('ko-KR')}원</div>
                        )}
                        {group.worker && group.worker.bank_account && (
                          <div className="mt-1 flex items-center gap-1 justify-end">
                            <span className="text-xs font-medium text-ink-muted">
                              {[group.worker.bank_name, group.worker.bank_account].filter(Boolean).join(' ')}
                            </span>
                            <button
                              onClick={() => copyToClipboard(group.worker!.bank_account!, `account-${group.key}`)}
                              className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold border transition cursor-pointer"
                              style={copiedKey === `account-${group.key}` ? { background: '#22c55e', color: '#fff', borderColor: '#22c55e' } : { background: '#f5f5f5', color: '#666', borderColor: '#ddd' }}
                              title="계좌번호 복사"
                            >
                              {copiedKey === `account-${group.key}` ? '✓' : '복사'}
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                    {idx === 0 && group.worker && (
                      <td className="border border-hairline px-3 py-2 text-center align-top" rowSpan={group.entries.length}>
                        <input
                          type="checkbox"
                          checked={group.worker.payment_done}
                          onChange={() => onPaymentToggle(group.worker!)}
                          className="w-4 h-4 cursor-pointer accent-green-500"
                          title={group.worker.payment_done ? '송금 완료' : '송금 전'}
                        />
                      </td>
                    )}
                    {idx === 0 && !group.worker && (
                      <td className="border border-hairline" rowSpan={group.entries.length} />
                    )}
                  </tr>
                );
              });
            })}
            <tr className="bg-primary-50">
              <td colSpan={2} className="border border-hairline px-3 py-2.5 text-right font-extrabold text-ink text-sm">전체 합계</td>
              <td className="border border-hairline px-3 py-2.5"></td>
              <td className="border border-hairline px-3 py-2.5 text-center font-extrabold">{formatHours(grandTotalWithHoliday.hours)}</td>
              <td className="border border-hairline px-3 py-2.5"></td>
              <td className="border border-hairline px-3 py-2.5 text-right font-extrabold text-primary-700">
                {grandTotalWithHoliday.pay > 0 ? `${grandTotalWithHoliday.pay.toLocaleString('ko-KR')}원` : '-'}
              </td>
              <td className="border border-hairline px-3 py-2.5"></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 휴게시간 미준수 경고 섹션 */}
      {breakWarnings.length > 0 && (
        <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
          <p className="text-[12px] font-bold text-amber-700 mb-1.5">⚠️ 휴게시간 미준수 {breakWarnings.length}건</p>
          <div className="space-y-0.5">
            {breakWarnings.map((w, i) => (
              <p key={i} className="text-[11px] text-amber-700 m-0">
                {w.name} · {w.dateLabel} · 근무 {w.raw}h → 최소 {w.minBreak} 휴게 필요
              </p>
            ))}
          </div>
        </div>
      )}

      <p className="mt-2 text-[11px] text-ink-faint m-0">* 등록된 근무자의 시급 변경은 DB에 자동 저장됩니다. 근무시간 형식: 09-18, 10:00-19:00 / 주휴수당: 1주 실근로 15h 이상 시 자동 계산</p>
    </div>
  );
}
