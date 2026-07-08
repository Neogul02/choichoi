import HrPageClient from './_components/HrPageClient';
import type { InitialRoster } from './_components/HrPageClient';
import { fetchStaffProfiles } from '@/app/actions/staff';
import { fetchAllUserProfiles } from '@/app/actions/workers';
import { fetchStores } from '@/app/actions/stores';
import { fetchAllRosterShifts, fetchRosterRange } from '@/app/actions/roster';
import type { RosterUnit } from '@/app/actions/roster';
import { fetchContractedStaffIds } from '@/app/actions/contracts';

// 서버 컴포넌트에서 서버 액션 함수를 직접 호출하면 HTTP 왕복 없이 in-process로 병렬 실행된다.
// 클라이언트 마운트 후 호출하던 기존 방식은 Next.js가 액션 POST를 직렬화하는 데다
// 요청마다 proxy.ts의 getUser() 인증 왕복이 붙어 초기 로딩이 수 초씩 걸렸다.
async function getHrBootstrap() {
  // 매장 목록은 달력 초기 단위(캐셔=첫 매장) 결정에 필요해 먼저 조회
  const storesRes = await fetchStores();
  const stores = storesRes.success ? (storesRes.data ?? []) : [];

  // RosterCalendar의 초기 상태와 동일한 단위·당월(KST)을 프리페치 — 단위·월이 어긋나면 클라이언트가 무시하고 직접 조회
  const initialUnit: RosterUnit = stores.length > 0
    ? { staffRole: 'cashier', storeId: stores[0].id }
    : { staffRole: 'kitchen', storeId: null };
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const y = kstNow.getUTCFullYear();
  const m = kstNow.getUTCMonth(); // 0-indexed — 클라이언트 cursor.m과 동일 기준
  const mm = String(m + 1).padStart(2, '0');
  const monthStart = `${y}-${mm}-01`;
  const monthEnd = `${y}-${mm}-${String(new Date(Date.UTC(y, m + 1, 0)).getUTCDate()).padStart(2, '0')}`;

  const [staffRes, profileRes, shiftsRes, contractedRes, rosterRes] = await Promise.all([
    fetchStaffProfiles(),
    fetchAllUserProfiles(),
    fetchAllRosterShifts(),
    fetchContractedStaffIds(),
    fetchRosterRange(initialUnit, monthStart, monthEnd),
  ]);

  const initialRoster: InitialRoster | null =
    rosterRes.success && rosterRes.data ? { unit: initialUnit, y, m, data: rosterRes.data } : null;

  return {
    initialStaff: staffRes.success ? (staffRes.data ?? []) : [],
    initialUserProfiles: profileRes.success ? (profileRes.data ?? []) : [],
    initialStores: stores,
    initialShifts: shiftsRes.success ? (shiftsRes.data ?? []) : [],
    initialContractedIds: contractedRes.success ? (contractedRes.data ?? []) : [],
    initialRoster,
  };
}

export default async function HrPage() {
  const bootstrap = await getHrBootstrap();
  return <HrPageClient {...bootstrap} />;
}
