import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { password } = await request.json();
    const expected = process.env.POPUP_PASSWORD;

    if (!expected) {
      return NextResponse.json(
        { success: false, message: '서버 비밀번호가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    if (password === expected) {
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { success: false, message: '비밀번호가 올바르지 않습니다.' },
      { status: 401 }
    );
  } catch {
    return NextResponse.json(
      { success: false, message: '요청 처리 중 오류가 발생했습니다.' },
      { status: 400 }
    );
  }
}
