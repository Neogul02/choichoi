import type { OrderLogEntry } from '@/types/api';

interface Props {
  logs: OrderLogEntry[];
  isLoading: boolean;
}

function formatTime(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  const h = String(d.getUTCHours()).padStart(2, '0');
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function formatQty(qty: number, unit: string): string {
  if (unit === 'g' && qty >= 1000) return `${(qty / 1000).toFixed(1)}kg`;
  return `${qty}${unit}`;
}

export default function LiveLog({ logs, isLoading }: Props) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm font-extrabold text-ink">차감 로그</h3>
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-xs text-ink-faint">실시간</span>
      </div>

      {isLoading && <p className="text-xs text-ink-faint">불러오는 중…</p>}
      {!isLoading && logs.length === 0 && (
        <p className="text-xs text-ink-faint">아직 차감 내역이 없습니다.</p>
      )}

      <ul className="space-y-2 max-h-56 overflow-y-auto">
        {logs.map((log) => {
          const menuStr = log.menuItems
            .map((m) => `${m.name} ${m.quantity}개`)
            .join(', ') || '주문';
          const deductStr = log.deductions
            .map((d) => `${d.name} ${formatQty(d.qty, d.unit)}`)
            .join(', ');

          return (
            <li key={log.orderId} className="flex gap-2.5 text-xs items-start">
              <span className="text-ink-faint tabular-nums shrink-0 mt-0.5">
                {formatTime(log.createdAt)}
              </span>
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="font-semibold text-ink-secondary truncate">{menuStr}</span>
                <span className="text-ink-faint truncate">{deductStr} 차감</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
