import type { DeductionEvent } from '@/types/database';

interface Props {
  logs: DeductionEvent[];
  isLoading: boolean;
}

function formatTime(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  const h = String(d.getUTCHours()).padStart(2, '0');
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export default function LiveLog({ logs, isLoading }: Props) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm font-extrabold text-[#161616]">차감 로그</h3>
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-xs text-[#999]">실시간</span>
      </div>
      {isLoading && <p className="text-xs text-[#bbb]">불러오는 중…</p>}
      {!isLoading && logs.length === 0 && (
        <p className="text-xs text-[#bbb]">아직 차감 내역이 없습니다.</p>
      )}
      <ul className="space-y-1.5 max-h-48 overflow-y-auto">
        {logs.map((log) => (
          <li key={log.id} className="flex items-center gap-2 text-xs">
            <span className="text-[#bbb] tabular-nums shrink-0">{formatTime(log.created_at)}</span>
            <span className="font-semibold text-[#444]">
              {log.ingredients?.name ?? log.ingredient_id}
            </span>
            <span className="text-[#888]">
              {log.qty_deducted}{log.ingredients?.base_unit ?? ''} 차감
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
