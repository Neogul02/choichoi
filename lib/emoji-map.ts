export const EMOJI_MAP: { keyword: string; emoji: string }[] = [
  { keyword: '딸기',   emoji: '🍓' },
  { keyword: '후르츠', emoji: '🥝' },
  { keyword: '망고',   emoji: '🥭' },
  { keyword: '멜론',   emoji: '🍈' },
  { keyword: '천혜향', emoji: '🍊' },
];

export function getEmoji(name: string): string {
  return EMOJI_MAP.find(({ keyword }) => name.includes(keyword))?.emoji ?? '✨';
}
