import LoadingScreen from '@/components/LoadingScreen'

// 라우트 전환·서버 프리페치 대기 중 전역 폴백 — 흰 화면 대신 로딩 전용 화면
export default function Loading() {
  return <LoadingScreen />
}
