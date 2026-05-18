'use client';

import { useEffect, useRef } from 'react';
import { motion, useSpring, useTransform, useAnimate, AnimatePresence } from 'framer-motion';

function AnimatedCounter({ value, formatter }: { value: number; formatter: (n: number) => string }) {
  const spring = useSpring(0, { stiffness: 45, damping: 12 });
  const display = useTransform(spring, (v) => formatter(Math.round(v)));

  useEffect(() => {
    spring.set(value);
  }, [value, spring]);

  return <motion.span>{display}</motion.span>;
}

interface Props {
  totalRevenue: number;
  totalOrders: number;
  flashKey: number;
  lastPayment: { amount: number; id: number } | null;
}

export default function SalesBanner({ totalRevenue, totalOrders, flashKey, lastPayment }: Props) {
  const [scope, animate] = useAnimate();
  const isFirst = useRef(true);

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    animate(
      scope.current,
      {
        scale: [1, 1.06, 0.97, 1.02, 1],
        filter: ['brightness(1)', 'brightness(1.7)', 'brightness(1.2)', 'brightness(1.05)', 'brightness(1)'],
      },
      { duration: 0.65, ease: 'easeOut' }
    );
  }, [flashKey, animate]);

  return (
    <div
      ref={scope}
      className="relative bg-gradient-to-r from-rose-500 via-rose-500 to-pink-600 text-white rounded-2xl p-4 md:p-5 mb-3 md:mb-4 shadow-[0_6px_28px_rgba(244,63,94,0.40)] will-change-transform overflow-hidden"
    >
      {/* 배경 shimmer 레이어 */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />

      <div className="relative flex items-center justify-between">
        <div>
          <p className="m-0 text-rose-100 text-[11px] font-bold tracking-[0.12em] uppercase mb-1.5">오늘 매출</p>
          <div className="text-[clamp(28px,7vw,46px)] font-black leading-none tabular-nums">
            ₩<AnimatedCounter value={totalRevenue} formatter={(n) => n.toLocaleString('ko-KR')} />
          </div>
        </div>

        <div className="self-stretch w-px bg-white/25 mx-4 md:mx-6" />

        <div className="text-right">
          <p className="m-0 text-rose-100 text-[11px] font-bold tracking-[0.12em] uppercase mb-1.5">주문 수</p>
          <div className="text-[clamp(28px,7vw,46px)] font-black leading-none tabular-nums">
            <AnimatedCounter value={totalOrders} formatter={(n) => String(n)} />건
          </div>
        </div>
      </div>

      {/* 결제 금액 플로팅 뱃지 */}
      <AnimatePresence>
        {lastPayment && (
          <motion.div
            key={lastPayment.id}
            initial={{ opacity: 1, y: 0, scale: 0.75 }}
            animate={{ opacity: [1, 1, 0.8, 0], y: -64, scale: [0.75, 1.25, 1.1, 0.9] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none whitespace-nowrap"
          >
            <span className="text-white font-black text-[22px] drop-shadow-[0_2px_8px_rgba(0,0,0,0.35)]">
              +₩{lastPayment.amount.toLocaleString('ko-KR')}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
