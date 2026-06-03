const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

const COLOR = {
  add:     0x43b581,
  edit:    0x5865f2,
  delete:  0xed4245,
  reorder: 0x747f8d,
} as const;

type EventType = keyof typeof COLOR;

export async function notifyDiscord(type: EventType, title: string, description: string): Promise<void> {
  if (!WEBHOOK_URL) return;
  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title,
          description,
          color: COLOR[type],
          timestamp: new Date().toISOString(),
          footer: { text: 'ChoiChoi POS · 설정 변경' },
        }],
      }),
    });
  } catch {
    // Discord 실패가 메인 작업에 영향 없도록 silently ignore
  }
}
