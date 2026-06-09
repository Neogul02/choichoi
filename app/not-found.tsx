import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#f5f6f7]">
      <h1 className="m-0 text-5xl font-black text-ink">404</h1>
      <p className="m-0 text-ink-muted text-base">페이지를 찾을 수 없습니다.</p>
      <Link
        href="/"
        className="mt-2 px-5 py-2.5 rounded-lg bg-primary-700 text-white font-bold text-sm no-underline hover:bg-primary-800 transition-colors"
      >
        홈으로 돌아가기
      </Link>
    </div>
  );
}
