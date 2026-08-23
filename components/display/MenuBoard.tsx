'use client';

import { motion } from 'framer-motion';
import type { MenuItem } from '@/types/database';

interface Props {
  menuItems: MenuItem[];
}

// 아이패드 가로 화면 한 페이지에 스크롤 없이 정사각형에 가까운 격자로 채우기 위한 열 개수
function pickColumns(count: number): number {
  return Math.max(1, Math.round(Math.sqrt(count)));
}

export default function MenuBoard({ menuItems }: Props) {
  const photoItems = menuItems.filter((item) => item.image_url);

  return (
    <motion.div
      key="menu"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="flex-1 flex flex-col min-h-0"
    >
      {photoItems.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-ink-faint text-xl m-0">메뉴판 사진을 준비 중이에요</p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex p-1.5 md:p-2">
          <div
            className="flex-1 grid gap-1.5 md:gap-2"
            style={{ gridTemplateColumns: `repeat(${pickColumns(photoItems.length)}, minmax(0, 1fr))`, gridAutoRows: '1fr' }}
          >
            {photoItems.map((item) => (
              <div key={item.id} className="relative rounded-xl overflow-hidden bg-canvas-soft">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.image_url!}
                  alt={item.name}
                  className="w-full h-full object-cover"
                  style={item.is_sold_out ? { filter: 'grayscale(1) brightness(0.55)' } : undefined}
                />
                {item.is_sold_out && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span
                      className="-rotate-12 select-none border-[3px] border-white px-5 py-1.5 md:px-8 md:py-2 text-sm md:text-2xl font-black tracking-[0.2em] text-white"
                      style={{ textShadow: '0 1px 6px rgba(0,0,0,0.6)' }}
                    >
                      SOLD OUT
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
