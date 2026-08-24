import { redirect } from 'next/navigation'

// 2026-08-24 MY 페이지의 "근무 일정" 탭으로 흡수됨 (탭이 많아 헷갈린다는 피드백).
// 기존 북마크/링크 호환을 위해 얇은 리다이렉트만 유지.
export default function MySchedulePage() {
  redirect('/my')
}
