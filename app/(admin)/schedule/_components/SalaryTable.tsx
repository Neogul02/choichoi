'use client';

import { useState } from 'react';
import { formatHours } from '@/lib/utils';
import type { Worker } from '@/types/database';

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'] as const;

export type SalaryEntry = { date: string; role: string; workTime: string | null; breakTime: boolean; hours: number };
export type SalaryGroup = { key: string; worker: Worker | null; name: string; entries: SalaryEntry[] };

interface Props {
  eventName: string;
  salaryGroups: SalaryGroup[];
  grandTotal: { hours: number; pay: number };
  localRates: Record<string, number>;
  onRateChange: (worker: Worker | null, name: string, rate: number) => void;
  onPaymentToggle: (worker: Worker) => void;
}

export default function SalaryTable({ eventName, salaryGroups, grandTotal, localRates, onRateChange, onPaymentToggle }: Props) {
  const [draftRates, setDraftRates] = useState<Record<string, string>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    });
  }

  return (
    <div className="mt-5 bg-canvas rounded-2xl p-4 shadow-level-1">
      <h3 className="m-0 mb-4 text-lg font-extrabold">급여 계산서 — {eventName}</h3>
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
              const finalPay = totalHours * rate;
              return group.entries.map((entry, idx) => {
                const d = new Date(entry.date + 'T00:00:00');
                const dateLabel = `${d.getMonth() + 1}/${d.getDate()}(${DAY_NAMES[d.getDay()]})`;
                return (
                  <tr key={`${group.key}-${idx}`} className={group.worker?.payment_done ? 'bg-gray-100 text-gray-400' : 'hover:bg-canvas-soft'}>
                    {idx === 0 && (
                      <td className="border border-hairline px-3 py-2 align-top font-bold text-ink" rowSpan={group.entries.length}>
                        <div className="text-sm">{group.name}</div>
                        {group.worker?.phone && <div className="text-[10px] text-ink-muted font-normal mt-0.5">{group.worker.phone}</div>}
                      </td>
                    )}
                    <td className="border border-hairline px-3 py-2 text-xs text-ink-muted whitespace-nowrap">{dateLabel}</td>
                    <td className="border border-hairline px-3 py-2 text-xs text-ink-muted">
                      {entry.workTime ?? '-'}
                      {entry.breakTime && <span className="ml-1 text-[10px] text-orange-500">(-1h)</span>}
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
                          className="w-[88px] px-2 py-1 border border-hairline rounded text-xs text-right focus:outline-none focus:border-primary-700"
                        />
                      </td>
                    )}
                    {idx === 0 && (
                      <td className="border border-hairline px-3 py-2 text-right font-bold text-primary-700 align-top" rowSpan={group.entries.length}>
                        <div>{rate > 0 ? `${finalPay.toLocaleString('ko-KR')}원` : '-'}</div>
                        {group.worker && group.worker.bank_account && (
                          <div className="mt-1 flex items-center gap-1">
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
              <td className="border border-hairline px-3 py-2.5 text-center font-extrabold">{formatHours(grandTotal.hours)}</td>
              <td className="border border-hairline px-3 py-2.5"></td>
              <td className="border border-hairline px-3 py-2.5 text-right font-extrabold text-primary-700">{grandTotal.pay > 0 ? `${grandTotal.pay.toLocaleString('ko-KR')}원` : '-'}</td>
              <td className="border border-hairline px-3 py-2.5"></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-ink-faint m-0">* 등록된 근무자의 시급 변경은 DB에 자동 저장됩니다. 근무시간 형식: 09-18, 10:00-19:00</p>
    </div>
  );
}
