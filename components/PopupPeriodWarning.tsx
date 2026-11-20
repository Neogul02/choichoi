'use client';

import { usePopupEventsAll } from '@/hooks/usePopupDayCompare';
import { kstToday } from '@/lib/date';
import { POPUP_ID_KEY, POPUP_NAME_KEY, setPopupIdCookie } from '@/lib/storage-keys';

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;

/**
 * POS가 운영 기간이 아닌 팝업으로 결제하고 있으면 크게 경고한다.
 * 2026-11-20 대구 신세계 #3 첫날, 로그인 때 고른 '대구 신세계 #2'(11/5 종료)로 46건이 잘못 쌓였다.
 * 오늘 진행 중인 팝업으로 한 번에 바꾸는 버튼을 같이 둔다(로그인 화면에서 고르는 것과 같은 저장소를 고친다).
 */
export default function PopupPeriodWarning({ popupId }: { popupId: string }) {
  const { data: popups } = usePopupEventsAll(popupId !== '0');
  if (!popups || popupId === '0') return null;
  const today = kstToday();
  const current = popups.find(p => String(p.id) === popupId);
  if (!current || (current.start_date <= today && today <= current.end_date)) return null;

  const ongoing = popups.filter(p => p.start_date <= today && today <= p.end_date);
  const switchTo = (id: number, name: string) => {
    try {
      localStorage.setItem(POPUP_ID_KEY, String(id));
      localStorage.setItem(POPUP_NAME_KEY, name);
    } catch { /* ignore */ }
    setPopupIdCookie(String(id));
    // 실시간 구독·캐시·상단 팝업 이름이 모두 popupId에 묶여 있어 새로 띄우는 게 가장 확실하다
    window.location.reload();
  };

  return (
    <div role="alert" className="mb-3 rounded-xl border-2 border-rose-400 bg-rose-50 px-3.5 py-3">
      <p className="m-0 text-[13px] font-extrabold text-rose-700">
        ⚠️ 지금 결제는 &lsquo;{current.name}&rsquo;({md(current.start_date)}~{md(current.end_date)})로 저장됩니다
      </p>
      <p className="m-0 mt-0.5 text-[12px] text-rose-700">
        {today > current.end_date ? '이미 끝난 팝업이에요.' : '아직 시작 전인 팝업이에요.'} 오늘 운영 중인 팝업으로 바꿔 주세요.
      </p>
      {ongoing.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ongoing.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => switchTo(p.id, p.name)}
              className="px-3 py-1.5 rounded-lg border-none bg-rose-600 text-white text-[12px] font-bold cursor-pointer hover:bg-rose-700 transition"
            >
              {p.name}(으)로 바꾸기
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
