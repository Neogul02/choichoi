import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#f5f6f7] flex flex-col items-center justify-center p-8">
      <div className="text-center mb-12">
        <div className="w-16 h-16 rounded-2xl bg-primary-700 flex items-center justify-center mx-auto mb-5 shadow-[0_4px_24px_rgba(8,68,49,0.3)]">
          <span className="text-white text-xl font-black tracking-tight">CC</span>
        </div>
        <h1 className="text-4xl font-black text-[#1a1a1a] mb-2 m-0">CHOICHOI</h1>
        <p className="text-[#999] text-base m-0">이용할 화면을 선택해주세요</p>
      </div>

      <div className="flex flex-col gap-4 w-full max-w-xs">
        <Link
          href="/pos"
          className="block bg-primary-700 text-white text-center px-6 py-6 rounded-2xl no-underline shadow-[0_4px_20px_rgba(8,68,49,0.25)] hover:bg-primary-800 active:scale-[0.98] transition-all duration-200"
        >
          <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center mx-auto mb-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <path d="M8 21h8M12 17v4" />
            </svg>
          </div>
          <div className="text-lg font-black mb-0.5">캐셔 화면</div>
          <div className="text-sm font-normal opacity-70">주문 접수 및 결제</div>
        </Link>

        <Link
          href="/display"
          className="block bg-white text-[#1a1a1a] text-center px-6 py-6 rounded-2xl no-underline shadow-[0_4px_16px_rgba(0,0,0,0.08)] hover:shadow-[0_6px_24px_rgba(0,0,0,0.13)] active:scale-[0.98] transition-all duration-200"
        >
          <div className="w-10 h-10 rounded-xl bg-[#f0f0f0] flex items-center justify-center mx-auto mb-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="13" rx="2" />
              <path d="M8 21h8M12 16v5" />
              <circle cx="12" cy="9.5" r="2.5" />
            </svg>
          </div>
          <div className="text-lg font-black mb-0.5">고객 화면</div>
          <div className="text-sm font-normal text-[#999]">주문 확인 및 메뉴 선택</div>
        </Link>
      </div>
    </div>
  );
}
