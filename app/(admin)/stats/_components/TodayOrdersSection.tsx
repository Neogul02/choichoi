'use client';

import type { OrderRecordWithItems } from '@/types/api';

interface Props {
  orders: OrderRecordWithItems[];
  todayRevenue: number;
  isLoading: boolean;
  isResetting: boolean;
  onReset: () => void;
}

function formatKSTTime(isoString: string): string {
  const s = isoString.replace(' ', 'T');
  const hasOffset = s.endsWith('Z') || /[+-]\d{2}(?::\d{2})?$/.test(s);
  const utcMs = new Date(hasOffset ? s : s + 'Z').getTime();
  const kst = new Date(utcMs + 9 * 3600 * 1000);
  return `${String(kst.getUTCHours()).padStart(2, '0')}:${String(kst.getUTCMinutes()).padStart(2, '0')}`;
}

export default function TodayOrdersSection({ orders, todayRevenue, isLoading, isResetting, onReset }: Props) {
  return (
    <div className="mb-4 md:mb-5">
      <div className="bg-[#f9f9f9] rounded-xl p-4">
        <h3 className="m-0 mb-3 text-lg font-bold">오늘 주문 내역</h3>
        <div className="bg-white rounded-lg p-3 mb-3 border border-[#eee]">
          <p className="m-0 mb-1 text-[#555] text-sm">오늘 총 주문: {orders.length}건</p>
          <strong className="text-xl text-primary-700 font-bold">오늘 총매출: ₩{todayRevenue.toLocaleString('ko-KR')}</strong>
        </div>
        <div className="bg-[#fff4f4] border border-[#ffdddd] rounded-lg p-3 mb-3">
          <p className="m-0 mb-2.5 text-[#8a1f1f] text-[13px] leading-[1.4]">주의: 아래 버튼은 오늘 주문/매출 데이터를 전부 삭제합니다. 되돌릴 수 없습니다.</p>
          <button
            className="border-none bg-[#c62828] text-white rounded-lg px-3.5 py-2.5 text-[13px] font-bold cursor-pointer transition-all duration-200 hover:bg-[#b71c1c] disabled:opacity-60 disabled:cursor-not-allowed"
            onClick={onReset}
            disabled={isResetting || isLoading || orders.length === 0}
          >
            {isResetting ? '초기화 중...' : '오늘 매출 전체 초기화'}
          </button>
        </div>
        <div>
          <h4 className="m-0 mb-2 text-sm">주문 내역 (시각 / 메뉴 / 가격)</h4>
          {isLoading ? (
            <p>주문 내역을 불러오는 중입니다...</p>
          ) : orders.length === 0 ? (
            <p className="m-0 text-[#999] text-sm">오늘 주문 내역이 없습니다.</p>
          ) : (
            <ul className="m-0 p-0 list-none border border-[#ececec] rounded-lg bg-white max-h-[320px] overflow-y-auto">
              {orders.map((order) => (
                <li key={order.id} className="p-2.5 md:p-3 border-b border-[#f3f3f3] last:border-b-0">
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="text-[#888] text-xs font-medium">{formatKSTTime(order.created_at)}</span>
                    <strong className="text-sm font-bold">₩{Number(order.total_price).toLocaleString('ko-KR')}</strong>
                  </div>
                  <p className="m-0 text-[#555] text-xs truncate">
                    {order.items.length > 0 ? order.items.map((item) => `${item.name} × ${item.quantity}`).join(', ') : '-'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
