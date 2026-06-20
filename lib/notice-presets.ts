import type { NoticeText, ScreenNotice } from '@/types/display';

export const DEFAULT_NOTICES: Record<ScreenNotice, NoticeText> = {
  away: { title: '잠시 자리를 비웠어요', subtitle: '곧 돌아올게요!', color: '#1a1a1a' },
  soldout: { title: '오늘 준비한 상품이 모두 소진됐어요', subtitle: '내일 다시 찾아주세요!', color: '#1a1a1a' },
};

const STORAGE_KEY = 'display-screen-notices';

export function loadNotices(): Record<ScreenNotice, NoticeText> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_NOTICES;
    const parsed = JSON.parse(raw) as Partial<Record<ScreenNotice, Partial<NoticeText>>>;
    return {
      away: { ...DEFAULT_NOTICES.away, ...parsed.away },
      soldout: { ...DEFAULT_NOTICES.soldout, ...parsed.soldout },
    };
  } catch {
    return DEFAULT_NOTICES;
  }
}

export function saveNotice(type: ScreenNotice, text: NoticeText): Record<ScreenNotice, NoticeText> {
  const next = { ...loadNotices(), [type]: text };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
