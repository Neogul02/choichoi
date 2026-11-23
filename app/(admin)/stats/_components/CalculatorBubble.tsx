'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import SettlementCalculator from './SettlementCalculator';
import DeductionCalculator from './DeductionCalculator';
import type { CalendarSalesData } from '@/types/api';
import type { PopupEvent } from '@/types/database';

type CalcTab = 'settlement' | 'deduction';
const TAB_KEY = 'choichoi_stats_calc_tab';

/**
 * 통계탭 계산기 버블 — POS 메모처럼 화면 오른쪽 아래에 떠 있다가 누르면 계산기가 열린다.
 * 정산 계산기(달력에서 보는 달 기준)와 공제 계산기(예전 인사 탭)를 탭으로 함께 둔다. 스크롤 위치와 상관없이 쓸 수 있다.
 */
export default function CalculatorBubble(props: {
  calendarSales: CalendarSalesData;
  popupEvents: PopupEvent[];
  calendarMonth: Date;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<CalcTab>('settlement');

  useEffect(() => {
    try { if (localStorage.getItem(TAB_KEY) === 'deduction') setTab('deduction'); } catch { /* ignore */ }
  }, []);
  const pickTab = (t: CalcTab) => {
    setTab(t);
    try { localStorage.setItem(TAB_KEY, t); } catch { /* ignore */ }
  };

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            key="calc-panel"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            role="dialog"
            aria-label="계산기"
            className="fixed right-4 bottom-[84px] z-40 w-[360px] max-w-[calc(100vw-32px)] max-h-[min(640px,calc(100dvh-120px))] flex flex-col rounded-2xl border border-hairline bg-canvas shadow-level-2 overflow-hidden"
          >
            <div className="flex items-center gap-1.5 px-3 py-2.5 border-b border-hairline bg-canvas-soft shrink-0">
              {([['settlement', '정산 계산기'], ['deduction', '공제 계산기']] as [CalcTab, string][]).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => pickTab(key)}
                  className={`rounded-full border px-3 py-1 text-[12px] font-bold cursor-pointer transition ${
                    tab === key ? 'border-primary-700 bg-primary-700 text-white' : 'border-hairline bg-canvas text-ink-muted hover:bg-canvas-soft'
                  }`}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="계산기 닫기"
                className="ml-auto w-7 h-7 flex items-center justify-center rounded-lg border-none bg-transparent text-ink-faint cursor-pointer hover:bg-canvas"
              >
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              </button>
            </div>
            <div className={`overflow-y-auto flex-1 [scrollbar-width:thin] ${tab === 'settlement' ? 'px-4 py-3' : ''}`}>
              {tab === 'settlement' ? <SettlementCalculator {...props} /> : <DeductionCalculator />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-label={open ? '계산기 닫기' : '계산기 열기'}
        className={`fixed right-4 bottom-4 z-40 h-14 w-14 rounded-full border-none shadow-level-2 cursor-pointer flex items-center justify-center text-[24px] transition-transform active:scale-95 ${
          open ? 'bg-ink text-white' : 'bg-primary-700 text-white hover:bg-primary-800'
        }`}
      >
        {open ? '×' : '🧮'}
      </button>
    </>
  );
}
