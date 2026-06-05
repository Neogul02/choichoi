'use client';

import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { formatPrice } from '@/lib/utils';
import type { CartItem } from '@/types/display';

const listItemVariants: Variants = {
  hidden: { opacity: 0, x: 20 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, x: -16, transition: { duration: 0.18 } },
};

interface Props {
  cartItems: CartItem[];
  cartTotalPrice: number;
}

export default function ViewMode({ cartItems, cartTotalPrice }: Props) {
  const isEmpty = cartItems.length === 0;

  return (
    <motion.div
      key="view"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="flex-1 flex flex-col items-center justify-center p-8"
    >
      <AnimatePresence mode="wait">
        {isEmpty ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.25 }}
            className="text-center"
          >
            <h2 className="text-5xl font-black text-[#1a1a1a] mb-3 m-0">안녕하세요!</h2>
            <p className="text-[#999] text-2xl m-0">주문을 기다리고 있어요</p>
          </motion.div>
        ) : (
          <motion.div
            key="cart"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="w-full max-w-lg"
          >
            <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.07)] overflow-hidden mb-4">
              <div className="px-6 py-4 border-b border-[#f0f0f0]">
                <h3 className="text-base font-bold text-[#888] tracking-wide uppercase m-0">주문 내역</h3>
              </div>
              <ul className="m-0 p-0 list-none divide-y divide-[#f5f5f5]">
                <AnimatePresence initial={false}>
                  {cartItems.map((item) => (
                    <motion.li
                      key={item.id}
                      variants={listItemVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      className="flex items-center justify-between px-6 py-4"
                    >
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
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </div>

            <motion.div
              key={cartTotalPrice}
              initial={{ scale: 1.03 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 18 }}
              className="bg-primary-700 rounded-2xl px-6 py-5 flex items-center justify-between shadow-[0_4px_20px_rgba(8,68,49,0.25)]"
            >
              <span className="text-white text-2xl font-bold opacity-80">합계</span>
              <span className="text-white text-[48px] font-black leading-none">
                {formatPrice(cartTotalPrice)}원
              </span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
