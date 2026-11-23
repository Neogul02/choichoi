/** "어제 같은 시각 ▲ 12% (₩…)" — 같은 시각까지 누적끼리의 증감. 기준이 없으면 '—' */
export default function SalesDelta({ label, now, before }: { label: string; now: number; before: number | null }) {
  if (before == null || before === 0) {
    return <span className="text-ink-faint">{label} —</span>;
  }
  const diff = now - before;
  const pct = Math.round((diff / before) * 100);
  const up = diff >= 0;
  return (
    <span className="whitespace-nowrap">
      <span className="text-ink-faint">{label} </span>
      <span className={up ? 'font-bold text-emerald-600' : 'font-bold text-rose-500'}>
        {up ? '▲' : '▼'} {Math.abs(pct)}%
      </span>
      <span className="ml-1 text-ink-faint tabular-nums">(₩{before.toLocaleString('ko-KR')})</span>
    </span>
  );
}
