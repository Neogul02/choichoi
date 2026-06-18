const KRW_FORMATTER = new Intl.NumberFormat('ko-KR');
const KST_TIME_FORMATTER = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});
const HEX_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function formatKSTTime(isoString: string): string {
  const s = isoString.replace(' ', 'T');
  const hasOffset = s.endsWith('Z') || /[+-]\d{2}(?::\d{2})?$/.test(s);
  return KST_TIME_FORMATTER.format(new Date(hasOffset ? s : s + 'Z'));
}

export function formatRevenueTick(value: number): string {
  if (value >= 10000) return `${Math.round(value / 10000)}만`;
  if (value >= 1000) return `${Math.round(value / 1000)}천`;
  return String(value);
}

export function formatDateLabel(dateStr: string): string {
  const parts = dateStr.split('-');
  return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
}

export const MIN_HOURLY_WAGE = 10_320;
export const EFFECTIVE_MIN_WAGE = Math.round(MIN_HOURLY_WAGE * 1.2);

// Supabase Auth 호출이 락 경합 등으로 무한정 멈추는 경우를 막기 위한 안전장치.
// 지정 시간 내에 끝나지 않으면 reject해서 UI가 영원히 로딩 상태에 갇히지 않도록 한다.
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} 응답이 없습니다 (시간 초과). 새로고침 후 다시 시도해주세요.`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

// breakMinutes: 0=없음, 30=30분, 60=1시간
export function parseWorkHours(workTime: string | null, breakMinutes: number = 0): number {
  if (!workTime) return 0;
  const m = workTime.match(/(\d{1,2})(?::(\d{2}))?[-~](\d{1,2})(?::(\d{2}))?/);
  if (!m) return 0;
  const raw = Math.max(0, (parseInt(m[3]) * 60 + parseInt(m[4] ?? '0') - parseInt(m[1]) * 60 - parseInt(m[2] ?? '0')) / 60);
  return Math.max(0, raw - breakMinutes / 60);
}

export function parseRawHours(workTime: string | null): number {
  return parseWorkHours(workTime, 0);
}

export type BreakCompliance = {
  rawHours: number;
  required: boolean;
  minBreak: number;
  compliant: boolean;
};

// breakMinutes: 0=없음, 30=30분, 60=1시간
export function checkBreakCompliance(workTime: string | null, breakMinutes: number): BreakCompliance {
  const raw = parseRawHours(workTime);
  if (raw < 4) return { rawHours: raw, required: false, minBreak: 0, compliant: true };
  if (raw < 8) return { rawHours: raw, required: true, minBreak: 0.5, compliant: breakMinutes >= 30 };
  return { rawHours: raw, required: true, minBreak: 1.0, compliant: breakMinutes >= 60 };
}

export function getISOWeekKey(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const tmp = new Date(d);
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
  const week1 = new Date(tmp.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((tmp.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${tmp.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

export type WeeklyHolidayPayInfo = {
  weekKey: string;
  hours: number;
  eligible: boolean;
  amount: number;
};

export function calcWeeklyHolidayPay(
  entries: Array<{ date: string; hours: number }>,
  hourlyRate: number,
): WeeklyHolidayPayInfo[] {
  const weekMap = new Map<string, number>();
  for (const e of entries) {
    const key = getISOWeekKey(e.date);
    weekMap.set(key, (weekMap.get(key) ?? 0) + e.hours);
  }
  return Array.from(weekMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekKey, hours]) => ({
      weekKey,
      hours,
      eligible: hours >= 15,
      amount: hours >= 15 ? Math.floor((hours / 40) * 8 * hourlyRate) : 0,
    }));
}

export function formatHours(h: number): string {
  return h === 0 ? '-' : Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`;
}

export function toLocalDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatPrice(price: number): string {
  return KRW_FORMATTER.format(price);
}

export function hexWithAlpha(hex: string, alpha: number): string {
  const match = hex.trim().match(HEX_REGEX);
  if (!match) return hex;
  let normalized = match[1];
  if (normalized.length === 3) normalized = normalized.split('').map((ch) => ch + ch).join('');
  return `#${normalized}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;
}

export function getShortcutBadgeColors(color: string): { backgroundColor: string; color: string } {
  if (!color || typeof color !== 'string') return { backgroundColor: '#111', color: '#fff' };

  const hex = color.trim();
  const match = hex.match(HEX_REGEX);
  if (!match) return { backgroundColor: color, color: '#fff' };

  let normalized = match[1];
  if (normalized.length === 3) {
    normalized = normalized.split('').map((ch) => ch + ch).join('');
  }

  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return {
    backgroundColor: `#${normalized}`,
    color: luminance > 0.62 ? '#111' : '#fff',
  };
}
