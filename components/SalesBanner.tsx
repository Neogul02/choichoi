'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useTransform, useAnimate, AnimatePresence, animate } from 'framer-motion';
import { getTier } from '@/lib/tiers';

function AnimatedCounter({ value, formatter }: { value: number; formatter: (n: number) => string }) {
  const mv = useMotionValue(0);
  const display = useTransform(mv, (v) => formatter(Math.round(v)));
  const isFirst = useRef(true);

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      animate(mv, value, { duration: 1.8, ease: [0.16, 1, 0.3, 1] });
      return;
    }
    animate(mv, value, { type: 'spring', stiffness: 130, damping: 22 });
  }, [value, mv]);

  return <motion.span>{display}</motion.span>;
}

interface Props {
  totalRevenue: number;
  totalOrders: number;
  flashKey: number;
  lastPayment: { amount: number; id: number } | null;
}

const UNRANKED_BG = 'linear-gradient(135deg, #084431 0%, #0d6b4e 55%, #3d9966 100%)';
const UNRANKED_SHADOW = '0 6px 28px rgba(8,68,49,0.45)';
const UNRANKED_LABEL = '#6ee7b7';
const HIDDEN_BG = 'linear-gradient(135deg, #1f2a26 0%, #2f3d36 55%, #3d4a43 100%)';
const HIDDEN_SHADOW = '0 6px 28px rgba(30,40,35,0.35)';

export default function SalesBanner({ totalRevenue, totalOrders, flashKey, lastPayment }: Props) {
  const [hidden, setHidden] = useState(true);
  const [bannerScope, animateBanner] = useAnimate();
  const [revenueScope, animateRevenue] = useAnimate();
  const isFirst = useRef(true);

  const { tier } = getTier(totalRevenue);

  const background = hidden ? HIDDEN_BG : tier ? tier.bg : UNRANKED_BG;
  const boxShadow = hidden ? HIDDEN_SHADOW : tier ? tier.shadow : UNRANKED_SHADOW;
  const labelColor = hidden ? 'rgba(255,255,255,0.4)' : tier ? tier.labelText : UNRANKED_LABEL;

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    if (hidden) return;
    animateBanner(
      bannerScope.current,
      {
        scale: [1, 1.06, 0.97, 1.02, 1],
        filter: ['brightness(1)', 'brightness(1.7)', 'brightness(1.2)', 'brightness(1.05)', 'brightness(1)'],
      },
      { duration: 0.65, ease: 'easeOut' }
    );
    animateRevenue(
      revenueScope.current,
      { color: ['#ffffff', '#fde68a', '#86efac', '#ffffff'] },
      { duration: 0.9, ease: 'easeOut' }
    );
  }, [flashKey, hidden, animateBanner, animateRevenue, bannerScope, revenueScope]);

  return (
    <button
      type="button"
      ref={bannerScope}
      onClick={() => setHidden((v) => !v)}
      aria-label={hidden ? '매출 보기' : '매출 가리기'}
      aria-pressed={hidden}
      className="group relative w-full text-left text-white rounded-2xl p-4 md:p-5 mb-3 md:mb-4 will-change-transform overflow-hidden cursor-pointer border-none active:scale-[0.997] transition-all duration-500"
      style={{ background, boxShadow }}
    >
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
      <div className="absolute -bottom-6 -right-6 w-32 h-32 rounded-full bg-white/5 pointer-events-none" />
      <div className="absolute -bottom-2 -right-2 w-16 h-16 rounded-full bg-white/5 pointer-events-none" />

      <div className="relative flex items-center justify-between">
        <div>
          <p className="m-0 text-[11px] font-bold tracking-[0.12em] uppercase mb-1.5 transition-colors duration-500" style={{ color: labelColor }}>
            오늘 매출
          </p>
          <div ref={revenueScope} className="text-[clamp(28px,7vw,46px)] font-black leading-none tabular-nums">
            {hidden ? (
              <span className="tracking-[0.18em] text-white/35 select-none">₩••••••</span>
            ) : (
              <>₩<AnimatedCounter value={totalRevenue} formatter={(n) => n.toLocaleString('ko-KR')} /></>
            )}
          </div>
        </div>

        <div className={`self-stretch w-px mx-4 md:mx-6 ${hidden ? 'bg-white/10' : 'bg-white/20'}`} />

        <div className="text-right">
          <p className="m-0 text-[11px] font-bold tracking-[0.12em] uppercase mb-1.5 transition-colors duration-500" style={{ color: labelColor }}>
            주문 수
          </p>
          <div className="text-[clamp(28px,7vw,46px)] font-black leading-none tabular-nums">
            {hidden ? (
              <span className="tracking-[0.18em] text-white/35 select-none">•••</span>
            ) : (
              <><AnimatedCounter value={totalOrders} formatter={(n) => String(n)} />건</>
            )}
          </div>
        </div>
      </div>

      <div className={`relative mt-3 flex items-center gap-1.5 text-[11px] font-semibold transition-colors duration-500 ${hidden ? 'text-white/55' : 'text-white/65 group-hover:text-white/90'}`}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          {hidden
            ? (<><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></>)
            : (<><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></>)}
        </svg>
        {hidden ? '탭해서 매출 보기' : '탭해서 가리기'}
      </div>

      <AnimatePresence>
        {!hidden && lastPayment && (
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
    </button>
  );
}
