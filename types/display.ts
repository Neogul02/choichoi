export type CartItem = { id: number; name: string; price: number; count: number; color?: string };
export type Mode = 'view' | 'order';
export type DisplayState = 'idle' | 'checkout' | 'thanks';
