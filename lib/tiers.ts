export type Tier = {
  threshold: number;
  lv: number;
  name: string;
  ko: string;
  bg: string;
  accent: string;
  shadow: string;
  labelText: string;
  mute: string;
};

export const TIERS: Tier[] = [
  { threshold:       0, lv: 1, name: 'BRONZE',     ko: '브론즈',
    bg: 'linear-gradient(135deg,#5c2d10 0%,#a0531f 45%,#cd7f32 80%,#e0a36b 100%)',
    accent: '#f4d4b0', shadow: '0 8px 32px rgba(160,83,31,0.40)',
    labelText: '#f4d4b0', mute: 'rgba(255,255,255,0.7)' },
  { threshold: 100_000, lv: 2, name: 'SILVER',     ko: '실버',
    bg: 'linear-gradient(135deg,#3f4b5b 0%,#6b7785 45%,#a8b1bd 80%,#cfd5dd 100%)',
    accent: '#f3f4f6', shadow: '0 8px 32px rgba(75,85,99,0.40)',
    labelText: '#e5e7eb', mute: 'rgba(255,255,255,0.75)' },
  { threshold: 500_000, lv: 3, name: 'GOLD',       ko: '골드',
    bg: 'linear-gradient(135deg,#7c2d12 0%,#c2410c 25%,#f59e0b 60%,#fcd34d 90%,#fef3c7 100%)',
    accent: '#fef3c7', shadow: '0 10px 36px rgba(217,119,6,0.45)',
    labelText: '#fef3c7', mute: 'rgba(255,255,255,0.80)' },
  { threshold: 1_000_000, lv: 4, name: 'PLATINUM', ko: '플래티넘',
    bg: 'linear-gradient(135deg,#064e3b 0%,#0d9488 40%,#2dd4bf 70%,#99f6e4 100%)',
    accent: '#ccfbf1', shadow: '0 10px 36px rgba(15,118,110,0.45)',
    labelText: '#ccfbf1', mute: 'rgba(255,255,255,0.85)' },
  { threshold: 2_000_000, lv: 5, name: 'DIAMOND',  ko: '다이아',
    bg: 'linear-gradient(135deg,#1e3a8a 0%,#2563eb 35%,#60a5fa 70%,#bfdbfe 100%)',
    accent: '#dbeafe', shadow: '0 12px 40px rgba(59,130,246,0.50)',
    labelText: '#dbeafe', mute: 'rgba(255,255,255,0.85)' },
  { threshold: 3_000_000, lv: 6, name: 'MASTER',   ko: '마스터',
    bg: 'linear-gradient(135deg,#3b0764 0%,#7c3aed 35%,#a78bfa 70%,#ede9fe 100%)',
    accent: '#ede9fe', shadow: '0 12px 40px rgba(124,58,237,0.50)',
    labelText: '#ede9fe', mute: 'rgba(255,255,255,0.88)' },
  { threshold: 5_000_000, lv: 7, name: 'CHALLENGER', ko: '챌린저',
    bg: 'linear-gradient(135deg,#0f172a 0%,#475569 18%,#fbbf24 45%,#fde68a 60%,#f59e0b 78%,#dc2626 100%)',
    accent: '#fde68a', shadow: '0 14px 48px rgba(220,38,38,0.45), 0 0 60px rgba(251,191,36,0.30)',
    labelText: '#fde68a', mute: 'rgba(255,255,255,0.92)' },
];

export const WORKER_TIER_THRESHOLDS = [0, 500_000, 2_000_000, 5_000_000, 10_000_000, 20_000_000, 50_000_000]
export const WORKER_TIERS = TIERS.map((t, i) => ({ ...t, threshold: WORKER_TIER_THRESHOLDS[i] }))

const TIER_DOT_COLORS   = ['#cd7f32','#a8b1bd','#f59e0b','#2dd4bf','#60a5fa','#a78bfa','#fbbf24']
const TIER_BG_COLORS    = ['#f4d4b020','#f3f4f620','#fef3c720','#ccfbf120','#dbeafe20','#ede9fe20','#fde68a20']
const TIER_BORDER_COLORS= ['#cd7f3260','#a8b1bd60','#f59e0b60','#2dd4bf60','#60a5fa60','#a78bfa60','#fbbf2460']

export function getWorkerTier(revenue: number) {
  let idx = 0
  for (let i = 0; i < WORKER_TIER_THRESHOLDS.length; i++) {
    if (revenue >= WORKER_TIER_THRESHOLDS[i]) idx = i
  }
  return {
    current: WORKER_TIERS[idx],
    next: WORKER_TIERS[idx + 1] ?? null,
    idx,
    dot: TIER_DOT_COLORS[idx],
    bg: TIER_BG_COLORS[idx],
    border: TIER_BORDER_COLORS[idx],
  }
}

export function getTier(revenue: number): { tier: Tier | null; next: Tier | null } {
  let current: Tier | null = null;
  let next: Tier | null = null;
  for (let i = 0; i < TIERS.length; i++) {
    if (revenue >= TIERS[i].threshold) current = TIERS[i];
    else { next = TIERS[i]; break; }
  }
  return { tier: current, next };
}
