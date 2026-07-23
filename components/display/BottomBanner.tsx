'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';

const BANNERS = [
  '4개 이상 구매하시면 보냉백에 담아드려요.',
  '현금결제와 상품권 결제는 미리 말씀해주세요.',
  '받은 산도는 냉장보관 해주세요.',
  '모든 산도는 당일 제조 상품이에요.',
  '유제품, 과일 등 알레르기가 있으시면 꼭 말씀해주세요.',
];

const bannerVariants: Variants = {
  enter: { rotateX: -90, opacity: 0 },
  center: { rotateX: 0, opacity: 1, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
  exit: { rotateX: 90, opacity: 0, transition: { duration: 0.25, ease: 'easeIn' } },
};

export default function BottomBanner() {
  const [bannerIndex, setBannerIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setBannerIndex((i) => (i + 1) % BANNERS.length), 3500);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-10 bg-primary-600 px-6 pt-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] flex items-center justify-center overflow-hidden"
      style={{ perspective: '800px' }}
    >
      <AnimatePresence mode="wait">
        <motion.p
          key={bannerIndex}
          variants={bannerVariants}
          initial="enter"
          animate="center"
          exit="exit"
          className="m-0 text-white text-lg font-bold tracking-wide text-center"
          style={{ transformOrigin: 'center center', backfaceVisibility: 'hidden' }}
        >
          {BANNERS[bannerIndex]}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}
