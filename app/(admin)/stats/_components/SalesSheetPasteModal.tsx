'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { fetchPopupDailySales, savePopupDailySales } from '@/app/actions/stats';
import { parseSalesSheet } from '@/lib/salesSheetParse';
import { formatPrice } from '@/lib/utils';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';
import { useModalKeyboard } from '@/lib/useModalKeyboard';
import { DAY_NAMES } from '@/lib/staffing';

interface Props {
  popupId: number;
  popupName: string;
  startDate: string;
  endDate: string;
  onClose: () => void;
  onSaved: () => void;
}

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;
const dow = (d: string) => DAY_NAMES[new Date(`${d}T00:00:00`).getDay()];

/**
 * 엑셀 매출 정산표를 통째로 붙여넣어 팝업 하루 매출(정정값)을 한 번에 저장한다.
 * 붙여넣으면 지금 반영된 값(정정 또는 POS)과 나란히 보여주고, 다른 날만 저장한다.
 */
export default function SalesSheetPasteModal({ popupId, popupName, startDate, endDate, onClose, onSaved }: Props) {
  useBodyScrollLock();
  const panelRef = useRef<HTMLDivElement>(null);
  useModalKeyboard({ active: true, onClose, containerRef: panelRef });

  const [text, setText] = useState('');
  const [current, setCurrent] = useState<Map<string, { revenue: number; orders: number }> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchPopupDailySales(popupId).then(res => {
      if (res.success && res.data) setCurrent(new Map(res.data.map(r => [r.date, { revenue: r.revenue, orders: r.orderCount }])));
      else { toast.error(`지금 매출을 불러오지 못했습니다: ${res.success ? '' : res.error}`); setCurrent(new Map()); }
    });
  }, [popupId]);

  const parsed = useMemo(() => parseSalesSheet(text, Number(startDate.slice(0, 4))), [text, startDate]);
  const rows = useMemo(() => parsed.rows.map(r => {
    const now = current?.get(r.date);
    const outside = r.date < startDate || r.date > endDate;
    const same = !!now && now.revenue === r.revenue && now.orders === r.orders;
    return { ...r, now, outside, same };
  }), [parsed.rows, current, startDate, endDate]);
  const toSave = rows.filter(r => !r.outside && !r.same);
  const sum = rows.filter(r => !r.outside).reduce((a, r) => ({ revenue: a.revenue + r.revenue, orders: a.orders + r.orders }), { revenue: 0, orders: 0 });

  const handleSave = async () => {
    if (toSave.length === 0) return;
    setSaving(true);
    const results = await Promise.all(toSave.map(r => savePopupDailySales(popupId, r.date, r.revenue, r.orders)));
    setSaving(false);
    const failed = results.filter(r => !r.success);
    if (failed.length > 0) { toast.error(`${failed.length}일 저장 실패: ${failed[0].success ? '' : failed[0].error}`); return; }
    toast.success(`${toSave.length}일 매출을 반영했습니다`);
    onSaved();
  };

  return (
    <AnimatePresence>
      <motion.div
        key="sales-sheet-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          key="sales-sheet-panel"
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="bg-canvas w-full sm:max-w-[520px] rounded-t-2xl sm:rounded-xl shadow-level-2 border border-hairline overflow-hidden max-h-[90dvh] flex flex-col pb-[env(safe-area-inset-bottom)] sm:pb-0"
          ref={panelRef}
          role="dialog"
          aria-label="정산표 붙여넣기"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-hairline shrink-0">
            <div>
              <p className="text-[11px] text-ink-faint font-medium mb-0.5">정산표 붙여넣기 · {md(startDate)}~{md(endDate)}</p>
              <h3 className="m-0 text-[17px] font-bold text-ink">{popupName}</h3>
            </div>
            <button type="button" onClick={onClose} aria-label="닫기" className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-canvas-soft text-ink-faint transition-colors cursor-pointer border-none bg-transparent">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            </button>
          </div>

          <div className="overflow-y-auto flex-1 px-4 py-4 flex flex-col gap-3 [scrollbar-width:thin]">
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              autoFocus
              rows={5}
              placeholder={'엑셀 정산표에서 일자~건수 칸을 복사해 붙여넣으세요\n예) 2026-11-05\t목\t₩ 2,791,000\t182건'}
              className="w-full px-3 py-2 rounded-lg border border-hairline bg-canvas text-[12px] font-mono text-ink outline-none focus:border-primary-700 resize-y"
            />

            {text.trim() && rows.length === 0 && (
              <p className="m-0 text-[12px] text-amber-700">날짜와 매출이 있는 줄을 찾지 못했습니다.</p>
            )}

            {rows.length > 0 && (
              <div className="rounded-lg border border-hairline overflow-hidden">
                <table className="w-full text-[12px] tabular-nums">
                  <thead className="bg-canvas-soft text-ink-muted">
                    <tr>
                      <th className="text-left font-semibold px-2.5 py-1.5">날짜</th>
                      <th className="text-right font-semibold px-2.5 py-1.5">지금</th>
                      <th className="text-right font-semibold px-2.5 py-1.5">정산표</th>
                      <th className="text-right font-semibold px-2.5 py-1.5">차이</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => {
                      const diff = r.revenue - (r.now?.revenue ?? 0);
                      return (
                        <tr key={r.date} className={`border-t border-hairline ${r.outside ? 'opacity-40' : ''}`}>
                          <td className="px-2.5 py-1.5 whitespace-nowrap">
                            {md(r.date)} <span className="text-ink-faint">({dow(r.date)})</span>
                            {r.outside && <span className="ml-1 text-[10px] text-rose-500">기간 밖</span>}
                          </td>
                          <td className="px-2.5 py-1.5 text-right text-ink-muted whitespace-nowrap">
                            {r.now ? <>₩{formatPrice(r.now.revenue)} · {r.now.orders}건</> : '—'}
                          </td>
                          <td className="px-2.5 py-1.5 text-right font-semibold text-ink whitespace-nowrap">₩{formatPrice(r.revenue)} · {r.orders}건</td>
                          <td className={`px-2.5 py-1.5 text-right whitespace-nowrap ${r.same ? 'text-ink-faint' : diff === 0 ? 'text-amber-700' : diff > 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                            {r.same ? '같음' : diff === 0 ? '건수만' : `${diff > 0 ? '+' : ''}${formatPrice(diff)}`}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="border-t border-hairline bg-canvas-soft font-bold">
                      <td className="px-2.5 py-1.5">합계</td>
                      <td />
                      <td className="px-2.5 py-1.5 text-right whitespace-nowrap">₩{formatPrice(sum.revenue)} · {sum.orders.toLocaleString('ko-KR')}건</td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {parsed.skipped.length > 0 && (
              <p className="m-0 text-[11px] text-ink-faint">숫자가 없어 건너뛴 줄 {parsed.skipped.length}개 (아직 입력 전인 날)</p>
            )}
            <p className="m-0 text-[11px] text-ink-faint leading-relaxed">
              저장하면 그날 이 팝업의 매출·주문 수가 정산표 값으로 바뀝니다. 시간대·메뉴별 숫자는 POS 기록 그대로라 합계와 다를 수 있습니다.
            </p>
          </div>

          <div className="px-4 py-3 border-t border-hairline flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg border border-hairline bg-canvas text-[13px] font-semibold text-ink-muted hover:bg-canvas-soft transition-colors cursor-pointer"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || current == null || toSave.length === 0}
              className="flex-1 py-2.5 rounded-lg border-none bg-primary-700 text-white text-[13px] font-bold hover:bg-primary-800 transition-colors disabled:opacity-60 cursor-pointer"
            >
              {saving ? '저장 중...' : toSave.length > 0 ? `${toSave.length}일 반영` : '바뀐 날 없음'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
