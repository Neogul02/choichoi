export type CartItem = { id: number; name: string; price: number; count: number; color?: string };
export type Mode = 'view' | 'order' | 'screen';
export type DisplayState = 'idle' | 'checkout' | 'thanks';
export type ScreenNotice = 'away' | 'soldout';
export type NoticeText = { title: string; subtitle: string; color: string };
