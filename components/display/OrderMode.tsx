'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { formatPrice, hexWithAlpha } from '@/lib/utils';
import type { MenuItem } from '@/types/database';

interface Props {
  menuItems: MenuItem[];
  localCounts: Record<number, number>;
  onIncrement: (id: number) => void;
  onDecrement: (id: number) => void;
  onReset: () => void;
}

export default function OrderMode({ menuItems, localCounts, onIncrement, onDecrement, onReset }: Props) {
  const localTotalPrice = menuItems.reduce((sum, item) => sum + item.price * (localCounts[item.id] ?? 0), 0);
  const localTotalCount = Object.values(localCounts).reduce((sum, c) => sum + c, 0);

  return (
    <motion.div
      key="order"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="flex-1 flex flex-col"
    >
      <div className="flex-1 p-4 flex flex-col items-center justify-center">
        {menuItems.length === 0 ? (
          <div className="flex items-center justify-center h-48">
            <p className="text-ink-faint text-base m-0">메뉴를 불러오는 중...</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 max-w-2xl w-full">
            {menuItems.map((item) => {
              const count = localCounts[item.id] ?? 0;
              return (
                <motion.div
                  key={item.id}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => onIncrement(item.id)}
                  className="rounded-xl p-4 cursor-pointer transition-all duration-200"
                  style={
                    count > 0
                      ? {
                          backgroundColor: hexWithAlpha(item.color, 0.15),
                          boxShadow: `0 0 0 2.5px ${hexWithAlpha(item.color, 0.55)}`,
                        }
                      : { backgroundColor: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }
                  }
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                    <h3 className="m-0 text-lg font-bold text-ink leading-snug">{item.name}</h3>
                  </div>
                  <p className="m-0 text-xl font-extrabold text-ink-secondary mb-3">{formatPrice(item.price)}원</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); onDecrement(item.id); }}
                      className="w-10 h-10 rounded-lg border border-[#e0e0e0] text-2xl font-semibold bg-[#fafafa] flex items-center justify-center cursor-pointer active:scale-95 transition-transform leading-none"
                      style={{ touchAction: 'manipulation' }}
                    >
                      −
                    </button>
                    <span className={`flex-1 text-center text-xl font-black ${count > 0 ? 'text-primary-700' : 'text-hairline'}`}>
                      {count}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); onIncrement(item.id); }}
                      className="w-10 h-10 rounded-lg border border-[#e0e0e0] text-2xl font-semibold bg-[#fafafa] flex items-center justify-center cursor-pointer active:scale-95 transition-transform leading-none"
                      style={{ touchAction: 'manipulation' }}
                    >
                      +
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      <AnimatePresence>
        {localTotalCount > 0 && (
          <motion.div
            initial={{ y: 100, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 100, opacity: 0, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="fixed bottom-[5.5rem] left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-20"
          >
            <div className="bg-white rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.18)] p-5 border border-hairline">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="m-0 text-ink-muted text-sm font-semibold mb-1">선택한 항목</p>
                  <p className="m-0 text-ink text-2xl font-black leading-none">
                    {localTotalCount}개 &middot; {formatPrice(localTotalPrice)}원
                  </p>
                </div>
              </div>
              <button
                onClick={onReset}
                className="w-full py-4 rounded-xl bg-primary-700 text-white text-xl font-black cursor-pointer border-none hover:bg-primary-800 active:scale-95 transition-all"
              >
                초기화
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
