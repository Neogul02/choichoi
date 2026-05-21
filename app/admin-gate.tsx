'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';

const ADMIN_AUTH_KEY = 'choichoi_admin_token';
const ADMIN_AUTH_API_PATH = '/api/auth/admin';
const ADMIN_VALIDATE_API_PATH = '/api/auth/admin/validate';

export default function AdminGate({ children }: { children: React.ReactNode }) {
  const [checked, setChecked] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const storedToken = localStorage.getItem(ADMIN_AUTH_KEY);
    if (!storedToken) {
      setChecked(true);
      return;
    }
    axios.post(ADMIN_VALIDATE_API_PATH, { token: storedToken })
      .then(({ data }) => {
        if (data.valid) {
          setIsAuthed(true);
        } else {
          localStorage.removeItem(ADMIN_AUTH_KEY);
        }
      })
      .catch(() => localStorage.removeItem(ADMIN_AUTH_KEY))
      .finally(() => setChecked(true));
  }, []);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!password) { setError('비밀번호를 입력해주세요.'); return; }

    setError('');
    setIsSubmitting(true);

    try {
      const { data } = await axios.post(ADMIN_AUTH_API_PATH, { password });
      if (!data.success) {
        setError(data.message || '비밀번호가 올바르지 않습니다.');
        setIsSubmitting(false);
        return;
      }
      localStorage.setItem(ADMIN_AUTH_KEY, data.token);
      setIsAuthed(true);
    } catch (err) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.message : undefined;
      setError(msg || '검증 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 하이드레이션 완료 전 — 빈 화면
  if (!checked) return null;

  // 미인증 — auth form만 렌더링, children 마운트 안 됨 → DB 쿼리 없음
  if (!isAuthed) {
    return (
      <div className="min-h-screen bg-[#f5f6f7] flex items-center justify-center p-4">
        <div className="w-full max-w-[360px]">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-black text-[#1a1a1a] m-0 mb-1">관리자 인증</h1>
            <p className="m-0 text-[#888] text-sm">관리자 전용 페이지입니다.</p>
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
              placeholder="관리자 비밀번호"
              autoFocus
            />
            {error && <div className="text-[#b42318] text-[13px] mb-3">{error}</div>}
            <button
              type="submit"
              className="w-full border-none rounded-lg px-3 py-2.5 text-[14px] font-bold bg-primary-700 text-white cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={isSubmitting}
            >
              {isSubmitting ? '확인 중...' : '인증하기'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
