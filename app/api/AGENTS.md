# app/api/

**현재 HTTP 엔드포인트가 하나도 없다.** 이 디렉터리는 비어 있고, 모든 데이터 접근은
Server Actions(`app/actions/`)로 한다.

과거에 있었던 것들과 없어진 이유:

- `POST /api/auth/*` — 캐셔·관리자 비밀번호를 SHA256으로 토큰화하던 방식. **Supabase Auth로
  교체**되면서 삭제됐다. 역할은 `session.user.user_metadata.role`에 있고 세션 쿠키 갱신은
  `proxy.ts`(미들웨어)가 처리한다.
- `GET /api/cron/daily-schedule` — 익일 근무 배정을 디스코드로 보내던 Vercel Cron.
  알림을 핵심만 남기는 정리 과정에서 삭제됐고, `vercel.json`의 `crons` 설정도 함께 비웠다.

## 새로 만들기 전에

대부분의 경우 **Server Action이 맞다.** 라우트 핸들러는 다음 경우에만 만든다.

- 외부 시스템이 호출해야 한다 (웹훅, Vercel Cron, 결제사 콜백)
- React·세션이 준비되기 전에 호출해야 한다
- 응답이 JSON이 아니다 (파일 스트림, 리다이렉트)

만들 때:

- 핸들러는 얇게 — 비즈니스 로직은 `app/actions/` 또는 `lib/`에 두고 호출만 한다.
- **인증을 직접 검사한다.** 레이아웃 게이트는 라우트 핸들러에 적용되지 않는다.
  Cron이라면 `CRON_SECRET` 같은 공유 비밀을 헤더로 확인한다.
- Cron을 추가하면 `vercel.json`의 `crons`도 같이 갱신한다. 한쪽만 바꾸면 조용히 안 돌거나
  404를 호출한다.
- 응답은 `NextResponse.json()`.
- 라우트를 삭제하면 `rm -rf .next` 후 `npx tsc --noEmit` — 낡은 `.next/types/validator.ts`가
  삭제된 라우트를 찾으며 실패한다.
