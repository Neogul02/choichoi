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

export function parseWorkHours(workTime: string | null, breakTime = false): number {
  if (!workTime) return 0;
  const m = workTime.match(/(\d{1,2})(?::(\d{2}))?[-~](\d{1,2})(?::(\d{2}))?/);
  if (!m) return 0;
  const raw = Math.max(0, (parseInt(m[3]) * 60 + parseInt(m[4] ?? '0') - parseInt(m[1]) * 60 - parseInt(m[2] ?? '0')) / 60);
  return breakTime ? Math.max(0, raw - 1) : raw;
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
