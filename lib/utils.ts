const KRW_FORMATTER = new Intl.NumberFormat('ko-KR');

export function toLocalDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatPrice(price: number): string {
  return KRW_FORMATTER.format(price);
}

export function getShortcutBadgeColors(color: string): { backgroundColor: string; color: string } {
  if (!color || typeof color !== 'string') return { backgroundColor: '#111', color: '#fff' };

  const hex = color.trim();
  const match = hex.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
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
