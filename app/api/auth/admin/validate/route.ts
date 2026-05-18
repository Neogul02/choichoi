import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

function computeToken(password: string): string {
  const seed = process.env.VERCEL_DEPLOYMENT_ID ?? 'local-dev';
  return createHash('sha256').update(password + seed).digest('hex');
}

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();
    const expected = process.env.ADMIN_PASSWORD;

    if (!expected || !token) {
      return NextResponse.json({ valid: false });
    }

    return NextResponse.json({ valid: token === computeToken(expected) });
  } catch {
    return NextResponse.json({ valid: false });
  }
}
