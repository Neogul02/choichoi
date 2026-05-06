'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_LINKS = [
  { href: '/', label: 'POS' },
  { href: '/stats', label: '통계' },
  { href: '/schedule', label: '일정' },
  { href: '/memo', label: '메모' },
  { href: '/settings', label: '설정' },
] as const;

export default function NavBar() {
  const pathname = usePathname();

  return (
    <header className="bg-white border-b border-gray-100 px-3 py-3 md:px-5 md:py-3 flex flex-col md:flex-row justify-between md:items-center shadow-[0_2px_8px_rgba(0,0,0,0.06)] mb-4 gap-3 md:gap-0">
      <h1 className="m-0 text-xl md:text-2xl font-extrabold text-[#161616]">ChoiChoi</h1>
      <nav>
        <ul className="flex gap-3 m-0 p-0 list-none w-full md:w-auto justify-start md:justify-end flex-nowrap overflow-x-auto pb-[2px] md:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
    </header>
  );
}
