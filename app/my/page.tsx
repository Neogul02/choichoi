import { getMyProfile, getMyOrderStats } from '@/app/actions/workers'
import { getMyContracts } from '@/app/actions/contracts'
import { getMyRoster } from '@/app/actions/roster'
import MyPageClient, { type InitialMyData } from './MyPageClient'

// 요청마다 세션 기반 조회 — 정적 프리렌더 방지
export const dynamic = 'force-dynamic'

// 프로필·주문 통계·계약서·근무표를 서버에서 병렬 프리페치 (hr 패턴). 실패 시 null로 클라이언트 폴백.
export default async function MyPage() {
  const [profileRes, statsRes, contractsRes, rosterRes] = await Promise.all([
    getMyProfile(),
    getMyOrderStats(),
    getMyContracts(),
    getMyRoster(),
  ])
  if (!profileRes.success) return <MyPageClient initial={null} />

  const initial: InitialMyData = {
    profile: profileRes.data ?? null,
    stats: statsRes.success ? statsRes.data ?? null : null,
    contracts: contractsRes.success ? contractsRes.data ?? [] : [],
    shifts: rosterRes.success && rosterRes.data ? rosterRes.data.shifts : null,
  }
  return <MyPageClient initial={initial} />
}
