'use client';

import { useEffect, useState } from 'react';

const ADMIN_AUTH_KEY = 'choichoi_admin_auth';
const ADMIN_AUTH_API_PATH = '/api/auth/admin';

export default function AdminGate({ children }: { children: React.ReactNode }) {
  const [checked, setChecked] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setIsAuthed(localStorage.getItem(ADMIN_AUTH_KEY) === 'ok');
    setChecked(true);
  }, []);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!password) { setError('비밀번호를 입력해주세요.'); return; }

    setError('');
    setIsSubmitting(true);

    try {
      const res = await fetch(ADMIN_AUTH_API_PATH, {
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

      localStorage.setItem(ADMIN_AUTH_KEY, 'ok');
      setIsAuthed(true);
    } catch {
      setError('검증 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!checked) return null;

  return (
    <>
      {children}
      {!isAuthed && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-auth-title"
        >
          <form
            className="w-full max-w-[360px] bg-white rounded-[14px] p-5 shadow-[0_8px_30px_rgba(0,0,0,0.2)]"
            onSubmit={onSubmit}
          >
            <h2 id="admin-auth-title" className="m-0 mb-2 text-[20px] font-bold">관리자 인증</h2>
            <p className="m-0 mb-3 text-[#555] text-[14px]">관리자 전용 페이지입니다. 관리자 비밀번호를 입력해주세요.</p>
            <input
              type="password"
              className="w-full border border-[#ddd] rounded-lg px-3 py-2.5 text-[14px] focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-700/15"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="관리자 비밀번호"
              autoFocus
            />
            {error && <div className="text-[#b42318] text-[13px] mt-2">{error}</div>}
            <button
              type="submit"
              className="w-full border-none rounded-lg mt-3 px-3 py-2.5 text-[14px] font-bold bg-primary-700 text-white cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={isSubmitting}
            >
              {isSubmitting ? '확인 중...' : '인증하기'}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
