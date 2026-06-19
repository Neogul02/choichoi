const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

const COLOR = {
  add:     0x43b581,
  edit:    0x5865f2,
  delete:  0xed4245,
  reorder: 0x747f8d,
  order:   0xf2c94c,
} as const;

type EventType = keyof typeof COLOR;

export async function notifyDiscord(
  type: EventType,
  title: string,
  description: string,
  fields?: { name: string; value: string; inline?: boolean }[],
): Promise<void> {
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
          ...(fields && fields.length > 0 ? { fields } : {}),
          timestamp: new Date().toISOString(),
          footer: { text: 'ChoiChoi POS' },
        }],
      }),
    });
  } catch {
    // Discord 실패가 메인 작업에 영향 없도록 silently ignore
  }
}
