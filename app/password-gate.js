'use client';

import { useEffect, useState } from 'react';

const AUTH_KEY = 'choichoi_popup_auth';

export default function PasswordGate({ children }) {
  const [checked, setChecked] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem(AUTH_KEY) : null;
    if (stored === 'ok') {
      setIsAuthed(true);
    }
    setChecked(true);
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!password) {
      setError('비밀번호를 입력해주세요.');
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/auth/verify', {
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

  if (!checked) {
    return null;
  }

  return (
    <>
      {children}
      {!isAuthed && (
        <div className="auth-overlay" role="dialog" aria-modal="true" aria-labelledby="auth-title">
          <form className="auth-modal" onSubmit={onSubmit}>
            <h2 id="auth-title">접속 비밀번호</h2>
            <p>운영 화면 접근을 위해 비밀번호를 입력해주세요.</p>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호"
              autoFocus
            />
            {error && <div className="auth-error">{error}</div>}
            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? '확인 중...' : '입장하기'}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
