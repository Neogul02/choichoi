'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { usePathname, useRouter } from 'next/navigation';
import { fetchPopupEvents } from '@/app/actions/schedule';
import type { PopupEvent } from '@/types/database';

const AUTH_KEY = 'choichoi_popup_token';
const CASHIER_NAME_KEY = 'choichoi_cashier_name';
const POPUP_ID_KEY = 'choichoi_popup_id';
const POPUP_NAME_KEY = 'choichoi_popup_name';
const AUTH_API_PATH = '/api/auth/verify';
const VALIDATE_API_PATH = '/api/auth/verify/validate';

export { POPUP_ID_KEY, POPUP_NAME_KEY };

export default function PasswordGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [popupEvents, setPopupEvents] = useState<PopupEvent[]>([]);
  const [selectedPopupId, setSelectedPopupId] = useState<number | ''>('');

  useEffect(() => {
    fetchPopupEvents().then((result) => {
      if (result.success && result.data) {
        setPopupEvents(result.data);
        if (result.data.length === 1) setSelectedPopupId(result.data[0].id);
      }
    });
  }, []);

  useEffect(() => {
    const storedToken = localStorage.getItem(AUTH_KEY);
    if (!storedToken) {
      setChecked(true);
      return;
    }
    axios.post(VALIDATE_API_PATH, { token: storedToken })
      .then(({ data }) => {
        if (data.valid) {
          setIsAuthed(true);
        } else {
          localStorage.removeItem(AUTH_KEY);
          localStorage.removeItem(CASHIER_NAME_KEY);
          localStorage.removeItem(POPUP_ID_KEY);
          localStorage.removeItem(POPUP_NAME_KEY);
        }
      })
      .catch(() => {
        localStorage.removeItem(AUTH_KEY);
        localStorage.removeItem(CASHIER_NAME_KEY);
        localStorage.removeItem(POPUP_ID_KEY);
        localStorage.removeItem(POPUP_NAME_KEY);
      })
      .finally(() => setChecked(true));
  }, []);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedPopupId) { setError('팝업을 선택해주세요.'); return; }
    if (!name.trim()) { setError('이름을 입력해주세요.'); return; }
    if (!password) { setError('비밀번호를 입력해주세요.'); return; }

    setError('');
    setIsSubmitting(true);

    try {
      const { data } = await axios.post(AUTH_API_PATH, { password });
      if (!data.success) {
        setError(data.message || '비밀번호가 올바르지 않습니다.');
        setIsSubmitting(false);
        return;
      }
      const popup = popupEvents.find((p) => p.id === selectedPopupId);
      localStorage.setItem(AUTH_KEY, data.token);
      localStorage.setItem(CASHIER_NAME_KEY, name.trim());
      localStorage.setItem(POPUP_ID_KEY, String(selectedPopupId));
      localStorage.setItem(POPUP_NAME_KEY, popup?.name ?? '');
      setIsAuthed(true);
      router.push('/pos');
    } catch (err) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.message : undefined;
      setError(msg || '검증 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (pathname === '/display' || pathname === '/') return <>{children}</>;

  if (!checked) return null;

  if (!isAuthed) {
    const inputClass = 'w-full border border-[#ddd] rounded-lg px-3 py-2.5 text-[14px] focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-700/15 mb-3 bg-white';
    return (
      <div className="min-h-screen bg-[#f5f6f7] flex items-center justify-center p-4">
        <div className="w-full max-w-[360px]">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-black text-[#1a1a1a] m-0 mb-1">ChoiChoi POS</h1>
            <p className="m-0 text-[#888] text-sm">운영 화면 접근을 위해 정보를 입력해주세요.</p>
          </div>
          <form className="bg-white rounded-2xl p-5 shadow-[0_4px_24px_rgba(0,0,0,0.08)]" onSubmit={onSubmit}>
            <div className="relative mb-3">
              <select
                className={`${inputClass} mb-0 appearance-none pr-8 cursor-pointer ${!selectedPopupId ? 'text-[#999]' : 'text-[#1a1a1a]'} ${popupEvents.length === 1 ? 'opacity-70 cursor-default' : ''}`}
                value={selectedPopupId}
                onChange={(e) => setSelectedPopupId(e.target.value ? Number(e.target.value) : '')}
                disabled={popupEvents.length === 1}
              >
                <option value="">팝업 선택</option>
                {popupEvents.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#999]">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </span>
            </div>
            <input
              type="text"
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="이름"
              autoFocus={popupEvents.length === 1}
              autoComplete="name"
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
              {isSubmitting ? '확인 중...' : '입장하기'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
