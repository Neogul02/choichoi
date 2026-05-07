'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const NAV_LINKS = [
  { href: '/', label: 'POS' },
  { href: '/stats', label: '통계' },
  { href: '/schedule', label: '일정' },
  { href: '/memo', label: '메모' },
  { href: '/settings', label: '설정' },
] as const;

function useTodayLabel(): string {
  const [label, setLabel] = useState('');
  useEffect(() => {
    const d = new Date();
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    setLabel(`${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`);
  }, []);
  return label;
}

export default function NavBar() {
  const pathname = usePathname();
  const todayLabel = useTodayLabel();

  return (
    <header className="bg-white border-b border-gray-100 px-3 py-3 md:px-5 md:py-3 flex flex-col md:flex-row justify-between md:items-center shadow-[0_2px_8px_rgba(0,0,0,0.06)] mb-4 gap-2 md:gap-0">
      <div className='flex content-between content-center'>
      <h1 className="m-0 text-xl md:text-2xl font-extrabold text-[#161616]">ChoiChoi</h1>
      
      </div>
      <div className="flex items-center gap-3 md:gap-4">
        <nav>
          <ul className="flex gap-2 md:gap-3 m-0 p-0 list-none flex-nowrap overflow-x-auto pb-[2px] md:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {NAV_LINKS.map(({ href, label }) => (
              <li key={href}>
                <Link
                  href={href}
                  className={`block px-3 py-1.5 md:px-4 md:py-2 text-[13px] md:text-sm rounded-lg no-underline font-semibold transition-all duration-200 whitespace-nowrap ${
                    pathname === href
                      ? 'bg-primary-700 text-white'
                      : 'bg-[#f5f6f7] text-[#161616] hover:bg-primary-700 hover:text-white'
                  }`}
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {todayLabel && (
          <span className="md:block md:relative md:top-0 md:right-0 absolute top-5 right-5 text-[11px] font-semibold text-[#bbb] md:whitespace-nowrap md:border-l md:border-[#eee] pl-4">
            {todayLabel}
          </span>
        )}
      </div>
      
    </header>
  );
}
