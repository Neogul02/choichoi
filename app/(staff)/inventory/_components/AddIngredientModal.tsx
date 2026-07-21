'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { createIngredient } from '@/app/actions/inventory';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const CATEGORIES = ['빵', '크림', '과일', '패키지'] as const;
const PRESET_COLORS = [
  '#F5E6C8', '#FFFDE7', '#FFF9C4', '#FFB3BA',
  '#B5EAD7', '#FFD700', '#C7E4A3', '#E0E7FF',
  '#F3F4F6', '#FECACA', '#BBF7D0', '#BAE6FD',
];

type UnitType = 'count' | 'weight';

const UNIT_PRESETS: Record<UnitType, { base: string; container: string }[]> = {
  count: [
    { base: '장', container: '봉지' },
    { base: '개', container: '박스' },
    { base: '개', container: '봉지' },
  ],
  weight: [
    { base: 'g', container: '박스' },
    { base: 'g', container: '팩' },
    { base: 'g', container: '통' },
    { base: 'g', container: '봉지' },
  ],
};

export default function AddIngredientModal({ open, onClose, onSuccess }: Props) {
  useBodyScrollLock(open);
  const [name, setName] = useState('');
  const [id, setId] = useState('');
  const [category, setCategory] = useState<typeof CATEGORIES[number]>('과일');
  const [color, setColor] = useState('#FFB3BA');
  const [unitType, setUnitType] = useState<UnitType>('weight');
  const [baseUnit, setBaseUnit] = useState('g');
  const [containerUnit, setContainerUnit] = useState('박스');
  const [containerSize, setContainerSize] = useState('1000');
  const [vendor, setVendor] = useState('');
  const [saving, setSaving] = useState(false);

  function reset() {
    setName(''); setId(''); setCategory('과일'); setColor('#FFB3BA');
    setUnitType('weight'); setBaseUnit('g'); setContainerUnit('박스');
    setContainerSize('1000'); setVendor('');
  }

  function handleUnitPreset(preset: { base: string; container: string }) {
    setBaseUnit(preset.base);
    setContainerUnit(preset.container);
  }

  async function handleSave() {
    if (!name.trim() || !id.trim()) { toast.error('이름과 ID를 입력하세요'); return; }
    const cs = parseFloat(containerSize);
    if (isNaN(cs) || cs <= 0) { toast.error('올바른 용량을 입력하세요'); return; }

    setSaving(true);
    const res = await createIngredient({
      id: id.trim().toLowerCase().replace(/\s+/g, '_'),
      name: name.trim(),
      category,
      color,
      unit_type: unitType,
      base_unit: baseUnit,
      container_unit: containerUnit,
      container_size: cs,
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
            initial={{ y: 48, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 48, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 340 }}
            className="bg-canvas w-full md:max-w-sm rounded-t-3xl md:rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
              <h2 className="text-[15px] font-extrabold text-ink">재고 종류 추가</h2>
              <button onClick={onClose} className="text-ink-faint hover:text-ink-muted text-xl leading-none cursor-pointer transition">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-5 flex flex-col gap-4">
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

              {/* 카테고리 */}
              <div>
                <label className="text-[10px] font-bold text-ink-muted block mb-1.5">카테고리</label>
                <div className="flex gap-1.5">
                  {CATEGORIES.map((c) => (
                    <button key={c} onClick={() => setCategory(c)}
                      className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer border-none transition ${
                        category === c ? 'bg-primary-700 text-white' : 'bg-[#f5f6f7] text-ink-muted hover:bg-primary-50'
                      }`}
                    >{c}</button>
                  ))}
                </div>
              </div>

              {/* 단위 타입 */}
              <div>
                <label className="text-[10px] font-bold text-ink-muted block mb-1.5">단위 타입</label>
                <div className="flex gap-1.5 mb-2">
                  {(['count', 'weight'] as UnitType[]).map((t) => (
                    <button key={t} onClick={() => {
                      setUnitType(t);
                      const preset = UNIT_PRESETS[t][0];
                      setBaseUnit(preset.base);
                      setContainerUnit(preset.container);
                      setContainerSize(t === 'weight' ? '1000' : '12');
                    }}
                      className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer border-none transition ${
                        unitType === t ? 'bg-primary-700 text-white' : 'bg-[#f5f6f7] text-ink-muted hover:bg-primary-50'
                      }`}
                    >{t === 'count' ? '개수 (장/개)' : '중량 (g/kg)'}</button>
                  ))}
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {UNIT_PRESETS[unitType].map((p) => (
                    <button key={`${p.base}-${p.container}`}
                      onClick={() => handleUnitPreset(p)}
                      className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border-none cursor-pointer transition ${
                        baseUnit === p.base && containerUnit === p.container
                          ? 'bg-[#161616] text-white'
                          : 'bg-[#f5f6f7] text-ink-muted hover:bg-[#e8e8e8]'
                      }`}
                    >{p.base}/{p.container}</button>
                  ))}
                </div>
              </div>

              {/* 용량 */}
              <div>
                <label className="text-[10px] font-bold text-ink-muted block mb-1">
                  1{containerUnit}당 {baseUnit} 수
                </label>
                <input
                  type="number" value={containerSize} onChange={(e) => setContainerSize(e.target.value)} min={1}
                  className="w-full border border-hairline rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary-700 transition"
                  style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
                />
              </div>

              {/* 거래처 */}
              <div>
                <label className="text-[10px] font-bold text-ink-muted block mb-1">거래처 (선택)</label>
                <input
                  type="text" value={vendor} onChange={(e) => setVendor(e.target.value)}
                  placeholder="예: 마켓컬리"
                  className="w-full border border-hairline rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary-700 transition"
                  style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
                />
              </div>

              {/* 색상 */}
              <div>
                <label className="text-[10px] font-bold text-ink-muted block mb-1.5">색상</label>
                <div className="flex gap-1.5 flex-wrap">
                  {PRESET_COLORS.map((c) => (
                    <button key={c} onClick={() => setColor(c)}
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
                {' · '}1{containerUnit} = {containerSize}{baseUnit}
                {' · '}{category}
                {' · '}<span className="inline-block w-3 h-3 rounded-full align-middle" style={{ backgroundColor: color }} />
              </div>

              <button
                onClick={handleSave} disabled={saving}
                className="w-full bg-primary-700 hover:bg-primary-800 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl cursor-pointer transition text-[13px] border-none"
              >
                {saving ? '추가 중…' : '재고 종류 추가'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
