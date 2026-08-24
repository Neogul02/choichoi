'use client';

import { useState, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { createIngredient } from '@/app/actions/inventory';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';
import { useModalKeyboard } from '@/lib/useModalKeyboard';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const DEFAULT_CATEGORY = '기타';
const PRESET_COLORS = [
  '#FFB3BA', '#FF8FA3', '#F87171', '#FB923C',
  '#FBBF24', '#FDE047', '#D9F99D', '#86EFAC',
  '#5EEAD4', '#7DD3FC', '#93C5FD', '#A5B4FC',
  '#C4B5FD', '#F0ABFC', '#F9A8D4', '#D6D3D1',
  '#B5EAD7', '#C7E4A3', '#E0E7FF', '#F3F4F6',
];

type UnitType = 'count' | 'weight';

const BASE_UNIT_PRESETS: Record<UnitType, string[]> = {
  count: ['개', '장', '봉지'],
  weight: ['g'],
};

export default function AddIngredientModal({ open, onClose, onSuccess }: Props) {
  useBodyScrollLock(open);

  const panelRef = useRef<HTMLDivElement>(null);
  useModalKeyboard({ active: open, onClose, containerRef: panelRef });

  const [name, setName] = useState('');
  const [id, setId] = useState('');
  const [color, setColor] = useState('#FFB3BA');
  const [unitType, setUnitType] = useState<UnitType>('count');
  const [baseUnit, setBaseUnit] = useState('개');
  const [reorderAt, setReorderAt] = useState('5');
  const [vendor, setVendor] = useState('');
  const [saving, setSaving] = useState(false);

  function reset() {
    setName(''); setId(''); setColor('#FFB3BA');
    setUnitType('count'); setBaseUnit('개');
    setReorderAt('5'); setVendor('');
  }

  async function handleSave() {
    if (!name.trim() || !id.trim()) { toast.error('이름과 ID를 입력하세요'); return; }
    const ra = parseFloat(reorderAt);
    if (isNaN(ra) || ra < 0) { toast.error('올바른 발주 기준 수량을 입력하세요'); return; }

    setSaving(true);
    const res = await createIngredient({
      id: id.trim().toLowerCase().replace(/\s+/g, '_'),
      name: name.trim(),
      category: DEFAULT_CATEGORY,
      color,
      unit_type: unitType,
      base_unit: baseUnit,
      reorder_at: ra,
      vendor: vendor.trim() || undefined,
    });
    setSaving(false);

    if (res.success) {
      toast.success(`${name} 추가 완료`);
      reset();
      onSuccess();
      onClose();
    } else {
      toast.error(`추가 실패: ${res.error}`);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-0 md:p-4"
        >
          <motion.div
            key="modal"
            ref={panelRef}
            initial={{ y: 48, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 48, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 340 }}
            className="bg-canvas w-full md:max-w-sm rounded-t-3xl md:rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
              <h2 className="text-[15px] font-extrabold text-ink">재고 종류 추가</h2>
              <button type="button" onClick={onClose} aria-label="닫기" className="text-ink-faint hover:text-ink-muted text-xl leading-none cursor-pointer transition">✕</button>
            </div>

            <form
              onSubmit={(e) => { e.preventDefault(); handleSave(); }}
              className="flex-1 overflow-y-auto px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] flex flex-col gap-4"
            >
              {/* 이름 + ID */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[10px] font-bold text-ink-muted block mb-1">이름</label>
                  <input
                    type="text" value={name} onChange={(e) => setName(e.target.value)}
                    placeholder="예: 딸기"
                    className="w-full border border-hairline rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary-700 transition"
                    style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] font-bold text-ink-muted block mb-1">ID (영문)</label>
                  <input
                    type="text" value={id} onChange={(e) => setId(e.target.value)}
                    placeholder="예: strawberry"
                    className="w-full border border-hairline rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary-700 transition"
                    style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
                  />
                </div>
              </div>

              {/* 단위 타입 */}
              <div>
                <label className="text-[10px] font-bold text-ink-muted block mb-1.5">단위 타입</label>
                <div className="flex gap-1.5 mb-2">
                  {(['count', 'weight'] as UnitType[]).map((t) => (
                    <button key={t} type="button" onClick={() => {
                      setUnitType(t);
                      setBaseUnit(BASE_UNIT_PRESETS[t][0]);
                    }}
                      className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer border-none transition ${
                        unitType === t ? 'bg-primary-700 text-white' : 'bg-[#f5f6f7] text-ink-muted hover:bg-primary-50'
                      }`}
                    >{t === 'count' ? '개수 (장/개)' : '중량 (g/kg)'}</button>
                  ))}
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {BASE_UNIT_PRESETS[unitType].map((u) => (
                    <button key={u}
                      type="button"
                      onClick={() => setBaseUnit(u)}
                      className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border-none cursor-pointer transition ${
                        baseUnit === u
                          ? 'bg-[#161616] text-white'
                          : 'bg-[#f5f6f7] text-ink-muted hover:bg-[#e8e8e8]'
                      }`}
                    >{u}</button>
                  ))}
                </div>
              </div>

              {/* 발주 기준 수량 */}
              <div>
                <label className="text-[10px] font-bold text-ink-muted block mb-1">
                  발주 기준 수량 ({baseUnit})
                </label>
                <input
                  type="number" value={reorderAt} onChange={(e) => setReorderAt(e.target.value)} min={0}
                  className="w-full border border-hairline rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary-700 transition"
                  style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
                />
                <p className="text-[10px] text-ink-faint mt-1">재고가 이 수량 이하로 떨어지면 &quot;발주&quot; 상태로 표시됩니다.</p>
              </div>

              {/* 거래처 */}
              <div>
                <label className="text-[10px] font-bold text-ink-muted block mb-1">거래처 (선택)</label>
                <input
                  type="text" value={vendor} onChange={(e) => setVendor(e.target.value)}
                  placeholder="예: 마켓컬리 010-1234-5678"
                  className="w-full border border-hairline rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary-700 transition"
                  style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
                />
              </div>

              {/* 색상 */}
              <div>
                <label className="text-[10px] font-bold text-ink-muted block mb-1.5">색상</label>
                <div className="flex gap-1.5 flex-wrap">
                  {PRESET_COLORS.map((c) => (
                    <button key={c} type="button" onClick={() => setColor(c)}
                      className={`w-7 h-7 rounded-full cursor-pointer border-2 transition ${
                        color === c ? 'border-primary-700 scale-110' : 'border-transparent hover:scale-105'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              {/* 프리뷰 */}
              <div className="bg-canvas-soft rounded-xl px-3.5 py-2.5 text-[11px] text-ink-muted">
                <span className="font-bold">{name || '재료명'}</span>
                {' · '}단위 {baseUnit}
                {' · '}<span className="inline-block w-3 h-3 rounded-full align-middle" style={{ backgroundColor: color }} />
              </div>

              <button
                type="submit" disabled={saving}
                className="w-full bg-primary-700 hover:bg-primary-800 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl cursor-pointer transition text-[13px] border-none"
              >
                {saving ? '추가 중…' : '재고 종류 추가'}
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
