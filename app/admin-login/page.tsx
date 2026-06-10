'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!email.trim()) { setError('이메일을 입력해주세요.'); return; }
    if (!password) { setError('비밀번호를 입력해주세요.'); return; }

    setError('');
    setIsSubmitting(true);

    const supabase = createSupabaseBrowserClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });

    if (authError) {
      setError('이메일 또는 비밀번호가 올바르지 않습니다.');
      setIsSubmitting(false);
      return;
    }

    router.push('/stats');
    router.refresh();
  };

  const inputClass =
    'w-full border border-hairline rounded-lg px-3 py-2.5 text-[14px] focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-700/15 mb-3 bg-canvas';

  return (
    <div className="min-h-screen bg-[#f5f6f7] flex items-center justify-center p-4">
      <div className="w-full max-w-[360px]">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-black text-ink m-0 mb-1">관리자 로그인</h1>
          <p className="m-0 text-ink-muted text-sm">관리자 전용 페이지입니다.</p>
        </div>
        <form className="bg-canvas rounded-xl p-5 shadow-level-1 border border-hairline" onSubmit={onSubmit}>
          <input
            type="email"
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="이메일"
            autoFocus
            autoComplete="email"
          />
          <input
            type="password"
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호"
            autoComplete="current-password"
          />
          {error && <div className="text-[#b42318] text-[13px] mb-3">{error}</div>}
          <button
            type="submit"
            className="w-full border-none rounded-lg px-3 py-2.5 text-[14px] font-bold bg-primary-700 text-white cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            disabled={isSubmitting}
          >
            {isSubmitting ? '로그인 중...' : '로그인'}
          </button>
        </form>
        <p className="text-center text-[12px] text-ink-faint mt-4">
          일반 직원이라면{' '}
          <a href="/" className="text-primary-700 hover:underline font-semibold">
            홈으로 이동
          </a>
        </p>
      </div>
    </div>
  );
}
