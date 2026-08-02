// 프로덕션 오류를 Discord 웹훅으로 수집한다 — 서버 전용.
// 같은 오류가 반복돼도 채널이 도배되지 않도록 (컨텍스트+메시지) 키당 5분에 1건만 보낸다.
// 스로틀 Map은 서버리스 인스턴스별 메모리라 완벽하진 않지만, 폭주 방지 목적으로는 충분하다.
import { notifyDiscord } from './discord';

const THROTTLE_MS = 5 * 60 * 1000;
const MAX_KEYS = 200;
const lastSentAt = new Map<string, number>();

const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max) + '…' : s);

export async function reportError(
  context: string,
  message: string,
  fields?: { name: string; value: string }[],
): Promise<void> {
  const key = `${context}|${message}`;
  const now = Date.now();
  const last = lastSentAt.get(key);
  if (last !== undefined && now - last < THROTTLE_MS) return;

  if (lastSentAt.size >= MAX_KEYS) {
    for (const [k, t] of lastSentAt) if (now - t >= THROTTLE_MS) lastSentAt.delete(k);
    if (lastSentAt.size >= MAX_KEYS) lastSentAt.clear();
  }
  lastSentAt.set(key, now);

  await notifyDiscord(
    'error',
    `⚠️ ${clip(context, 200)}`,
    clip(message, 1500),
    fields?.map((f) => ({ name: clip(f.name, 100), value: clip(f.value, 500) })),
  );
}
