import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

function computeToken(password: string): string {
  const seed = process.env.VERCEL_DEPLOYMENT_ID ?? 'local-dev';
  return createHash('sha256').update(password + seed).digest('hex');
}

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();
    const expected = process.env.ADMIN_PASSWORD;

    if (!expected) {
      return NextResponse.json(
        { success: false, message: '관리자 비밀번호가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    if (password === expected) {
      return NextResponse.json({ success: true, token: computeToken(expected) });
    }

    return NextResponse.json(
      { success: false, message: '관리자 비밀번호가 올바르지 않습니다.' },
      { status: 401 }
    );
  } catch {
    return NextResponse.json(
      { success: false, message: '요청 처리 중 오류가 발생했습니다.' },
      { status: 400 }
    );
  }
}
