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

export function formatBreakMinutes(minutes: number): string {
  if (minutes % 60 === 0) return `${minutes / 60}시간`;
  if (minutes < 60) return `${minutes}분`;
  return `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`;
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
