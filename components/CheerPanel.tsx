'use client';

import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  totalToday: number;
  onCheer: () => void;
}

export default function CheerPanel({ totalToday, onCheer }: Props) {
  const [bumped, setBumped] = useState(0);

  const handleCheer = useCallback(() => {
    setBumped((k) => k + 1);
    onCheer();
  }, [onCheer]);

  return (
    <motion.button
      key={`fab-${bumped}`}
      initial={bumped ? { scale: 1.25 } : false}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 12 }}
      whileTap={{ scale: 0.88 }}
      onClick={handleCheer}
      className="fixed bottom-24 right-4 md:bottom-6 md:right-6 z-40 w-14 h-14 rounded-full bg-white text-rose-500 shadow-[0_4px_20px_rgba(244,63,94,0.3)] border border-rose-200 cursor-pointer flex items-center justify-center text-2xl select-none"
      aria-label="응원하기"
    >
      ❤️
      {totalToday > 0 && (
        <AnimatePresence>
          <motion.span
            key={totalToday}
            initial={{ scale: 1.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-white text-rose-500 text-[10px] font-black flex items-center justify-center shadow-sm border border-rose-200"
          >
            {totalToday > 999 ? '999+' : totalToday}
          </motion.span>
        </AnimatePresence>
      )}
    </motion.button>
  );
}
