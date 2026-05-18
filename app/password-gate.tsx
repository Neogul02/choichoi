'use client';

import { useEffect, useState } from 'react';

const AUTH_KEY = 'choichoi_popup_auth';
const AUTH_API_PATH = '/api/auth/verify';

export default function PasswordGate({ children }: { children: React.ReactNode }) {
  const [checked, setChecked] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setIsAuthed(localStorage.getItem(AUTH_KEY) === 'ok');
    setChecked(true);
  }, []);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!password) {
      setError('비밀번호를 입력해주세요.');
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      const res = await fetch(AUTH_API_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.message || '비밀번호가 올바르지 않습니다.');
        setIsSubmitting(false);
        return;
      }

      localStorage.setItem(AUTH_KEY, 'ok');
      setIsAuthed(true);
    } catch {
      setError('검증 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 하이드레이션 완료 전 — 빈 화면 (children도 auth form도 렌더링 안 함)
  if (!checked) return null;

  // 미인증 — auth form만 렌더링, children 마운트 안 됨 → DB 쿼리 없음
  if (!isAuthed) {
    return (
      <div className="min-h-screen bg-[#f5f6f7] flex items-center justify-center p-4">
        <div className="w-full max-w-[360px]">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-black text-[#1a1a1a] m-0 mb-1">ChoiChoi POS</h1>
            <p className="m-0 text-[#888] text-sm">운영 화면 접근을 위해 비밀번호를 입력해주세요.</p>
          </div>
          <form
            className="bg-white rounded-2xl p-5 shadow-[0_4px_24px_rgba(0,0,0,0.08)]"
            onSubmit={onSubmit}
          >
            <input
              type="password"
              className="w-full border border-[#ddd] rounded-lg px-3 py-2.5 text-[14px] focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-700/15 mb-3"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호"
              autoFocus
            />
            {error && <div className="text-[#b42318] text-[13px] mb-3">{error}</div>}
            <button
              type="submit"
              className="w-full border-none rounded-lg px-3 py-2.5 text-[14px] font-bold bg-primary-700 text-white cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={isSubmitting}
            >
              {isSubmitting ? '확인 중...' : '입장하기'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
