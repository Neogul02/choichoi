'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { checkPopupAccess, fetchSwitchablePopups } from '@/app/actions/workers';
import { hardNavigate } from '@/lib/hardNavigate';
import { POPUP_ID_KEY, POPUP_NAME_KEY, WORKER_ROLE_KEY, setPopupIdCookie } from '@/lib/storage-keys';

/**
 * 상단 근무지 배지 — 누르면 로그아웃 없이 근무지를 바꾼다.
 * 목록은 이 계정이 갈 수 있는 곳만(관리자·매니저는 운영 중인 팝업 전부, 캐셔는 인사에서 배정된 팝업, 누구나 주방),
 * 바꾸기 직전에 서버(checkPopupAccess — 로그인과 같은 규칙)로 한 번 더 확인한다.
 */
export default function PopupSwitcher({ popupName }: { popupName: string }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<{ id: number | null; name: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // 상단 바가 접기 애니메이션 때문에 overflow-hidden이라 목록은 body에 띄우고 배지 아래로 위치를 잡는다
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    if (options == null) {
      fetchSwitchablePopups().then(res => {
        if (res.success && res.data) setOptions(res.data);
        else { setOptions([]); toast.error(res.success ? '근무지를 불러오지 못했습니다' : res.error); }
      });
    }
    const rect = ref.current?.getBoundingClientRect();
    if (rect) setPos({ left: Math.min(rect.left, window.innerWidth - 196), top: rect.bottom + 6 });
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, options]);

  const pick = async (opt: { id: number | null; name: string }) => {
    if (opt.name === popupName) { setOpen(false); return; }
    setBusy(true);
    const access = await checkPopupAccess(opt.id);
    if (!access.success || !access.data?.allowed) {
      setBusy(false);
      toast.error(access.success ? '이 근무지로 옮길 권한이 없습니다' : access.error);
      return;
    }
    const isKitchen = opt.id == null;
    try {
      localStorage.setItem(POPUP_ID_KEY, isKitchen ? '0' : String(opt.id));
      localStorage.setItem(POPUP_NAME_KEY, opt.name);
      localStorage.setItem(WORKER_ROLE_KEY, isKitchen ? 'kitchen' : '');
    } catch { /* ignore */ }
    setPopupIdCookie(isKitchen ? '0' : String(opt.id));
    // 실시간 구독·캐시·메뉴가 모두 근무지에 묶여 있어 새로 띄운다. 주방은 POS를 쓰지 않으니 내 일정으로
    const path = window.location.pathname;
    hardNavigate(isKitchen ? (path.startsWith('/pos') ? '/schedule' : path) : (path.startsWith('/schedule') ? '/pos' : path));
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="근무지 바꾸기"
        className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 border border-primary-200 cursor-pointer hover:bg-primary-100 transition-colors"
      >
        {popupName}
        <span className="text-[9px] opacity-70">▾</span>
      </button>
      {open && pos && createPortal(
        <div ref={menuRef} role="listbox" aria-label="근무지" style={{ position: 'fixed', left: Math.max(8, pos.left), top: pos.top }} className="z-[60] min-w-[180px] rounded-xl border border-hairline bg-canvas shadow-level-2 py-1">
          <p className="m-0 px-3 py-1.5 text-[10px] font-bold text-ink-faint">근무지 바꾸기</p>
          {options == null ? (
            <p className="m-0 px-3 py-2 text-[12px] text-ink-faint">불러오는 중…</p>
          ) : options.map(opt => {
            const current = opt.name === popupName;
            return (
              <button
                key={opt.id ?? 'kitchen'}
                type="button"
                role="option"
                aria-selected={current}
                disabled={busy}
                onClick={() => pick(opt)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 border-none bg-transparent text-left text-[13px] cursor-pointer hover:bg-canvas-soft disabled:opacity-50 ${current ? 'font-bold text-primary-700' : 'text-ink-secondary'}`}
              >
                {opt.name}
                {current && <span className="text-[11px]">✓</span>}
              </button>
            );
          })}
          {options != null && options.length <= 1 && (
            <p className="m-0 px-3 pt-1 pb-1.5 text-[10px] leading-snug text-ink-faint">다른 팝업은 인사 탭에서 배정돼야 옮길 수 있어요</p>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
