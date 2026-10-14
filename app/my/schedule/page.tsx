import { redirect } from 'next/navigation'

// 2026-08-24 MY 페이지 탭으로 흡수했다가, 2026-10-09 다시 /schedule 독립 라우트로 분리했다
// (메모탭을 지우면서 nav에 자리가 생겼고, 근무자가 가장 자주 보는 화면이라 한 번에 닿게 했다).
// 그 사이에 생긴 북마크/링크가 끊기지 않도록 얇은 리다이렉트만 유지한다.
export default function MySchedulePage() {
  redirect('/schedule')
}
