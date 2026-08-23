import type { StorageObjectIcon } from '@/types/database';

export const STORAGE_ICONS: { value: StorageObjectIcon; label: string; emoji: string }[] = [
  { value: 'fridge', label: '냉장고', emoji: '🧊' },
  { value: 'freezer', label: '냉동고', emoji: '❄️' },
  { value: 'shelf', label: '선반', emoji: '🗄️' },
  { value: 'box', label: '박스', emoji: '📦' },
  { value: 'other', label: '기타', emoji: '🏷️' },
];

export function storageIconMeta(icon: StorageObjectIcon) {
  return STORAGE_ICONS.find((i) => i.value === icon) ?? STORAGE_ICONS[STORAGE_ICONS.length - 1];
}
