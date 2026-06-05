'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { formatPrice } from '@/lib/utils';
import type { CartItem, DisplayState } from '@/types/display';
import EmojiPhysics from './EmojiPhysics';

interface Props {
  displayState: DisplayState;
  checkoutItems: CartItem[];
  checkoutTotal: number;
}

export default function CheckoutOverlay({ displayState, checkoutItems, checkoutTotal }: Props) {
  const active = displayState === 'checkout' || displayState === 'thanks';

  return (
    <>
      <EmojiPhysics items={checkoutItems} active={active} />
      <AnimatePresence>
        {displayState !== 'idle' && (
          <motion.div
            key={displayState}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 z-20 bg-[#f5f6f7] flex items-center justify-center p-8"
          >
            {displayState === 'checkout' ? (
              <motion.div
                initial={{ scale: 0.96, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className="w-full max-w-lg"
              >
                <motion.div
                  animate={{ boxShadow: ['0 0 0 3px #084431', '0 0 0 7px #08443140', '0 0 0 3px #084431'] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                  className="bg-white rounded-2xl overflow-hidden mb-4"
                >
                  <div className="bg-primary-700 px-6 py-4 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-white/60 animate-pulse" />
                    <h3 className="text-base font-bold text-white/90 tracking-wide uppercase m-0">결제 완료</h3>
                  </div>
                  <ul className="m-0 p-0 list-none divide-y divide-[#f5f5f5]">
                    {checkoutItems.map((item) => (
                      <li key={item.id} className="flex items-center justify-between px-6 py-4">
                        <div className="flex items-center gap-3">
                          {item.color && (
                            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                          )}
                          <span className="text-[22px] font-semibold text-[#1a1a1a]">{item.name}</span>
                          <span className="text-base font-bold text-[#bbb]">× {item.count}</span>
                        </div>
                        <span className="text-[22px] font-bold text-[#333]">
                          {formatPrice(item.price * item.count)}원
                        </span>
                      </li>
                    ))}
                  </ul>
                </motion.div>
                <div className="bg-primary-700 rounded-2xl px-6 py-5 flex items-center justify-between shadow-[0_4px_20px_rgba(8,68,49,0.25)]">
                  <span className="text-white text-2xl font-bold opacity-80">합계</span>
                  <span className="text-white text-[48px] font-black leading-none">
                    {formatPrice(checkoutTotal)}원
                  </span>
                </div>
              </motion.div>
            ) : (
              <motion.div
                initial={{ scale: 0.88, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                className="text-center"
              >
                <h2 className="text-7xl font-black text-primary-700 mb-3 m-0">감사합니다</h2>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
