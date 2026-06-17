'use server';

import { notifyDiscord } from '@/lib/discord';

export async function notifyLoginEvent(name: string, email: string): Promise<void> {
  await notifyDiscord('edit', '🔑 직원 로그인', `**${name}** (${email})`);
}
