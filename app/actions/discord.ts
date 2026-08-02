'use server';

import { after } from 'next/server';
import { notifyDiscord } from '@/lib/discord';

export async function notifyLoginEvent(name: string, email: string): Promise<void> {
  // 로그인 흐름이 웹훅 왕복을 기다리지 않도록 응답 후 전송
  after(() => notifyDiscord('edit', '🔑 직원 로그인', `**${name}** (${email})`));
}
