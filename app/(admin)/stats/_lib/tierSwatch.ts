import { TIERS } from '@/lib/tiers';

interface TierSwatch {
  lv: number;
  name: string;
  bg: string;
  ring: string;
  text: string;
}

// TIERS(lib/tiers.ts)의 매출 구간을 그대로 재사용 — 오늘의 등급 카드와 동일한 기준으로
// 캘린더의 하루하루를 "그날 달성한 등급"으로 색칠한다.
const SWATCHES: Omit<TierSwatch, 'lv' | 'name'>[] = [
  { bg: '#f5ece0', ring: '#cd7f32', text: '#8a5a24' }, // BRONZE
  { bg: '#eef0f2', ring: '#9aa4b1', text: '#4b5563' }, // SILVER
  { bg: '#fdf3d6', ring: '#e0a72e', text: '#8a6410' }, // GOLD
  { bg: '#e2f6f1', ring: '#2dd4bf', text: '#0d7566' }, // PLATINUM
  { bg: '#e6edfd', ring: '#60a5fa', text: '#1e40af' }, // DIAMOND
  { bg: '#efe7fb', ring: '#a78bfa', text: '#5b21b6' }, // MASTER
  { bg: '#fdece0', ring: '#f59e0b', text: '#9a3412' }, // CHALLENGER
];

export function getDayTierSwatch(revenue: number): TierSwatch | null {
  if (revenue <= 0) return null;
  let idx = 0;
  for (let i = 0; i < TIERS.length; i++) {
    if (revenue >= TIERS[i].threshold) idx = i;
  }
  return { ...SWATCHES[idx], lv: TIERS[idx].lv, name: TIERS[idx].name };
}
