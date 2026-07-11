export interface MenuItem {
  id: number;
  name: string;
  price: number;
  color: string;
  stock: number;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: number;
  total_price: number;
  payment_method: string;
  payment_status: string;
  cashier_name: string | null;
  is_prepared: boolean;
  created_at: string;
}

export interface PopupEvent {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  store_id: number | null;
  created_at: string;
}

// ── HR (인사관리) ─────────────────────────────────────────────────────────────

export interface AvailabilityRange {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
}

export type StaffStatus = 'candidate' | 'confirmed' | 'rejected' | 'inactive';
export type StaffRole = 'kitchen' | 'cashier';

// 앱 권한 역할 — user_profiles.worker_role / auth user_metadata.role에 저장됨
// (근무 역할인 StaffRole과는 별개 개념)
export type UserAppRole = 'admin' | 'manager' | 'user';

export interface Store {
  id: number;
  name: string;
  sort_order: number;
  created_at: string;
}

export interface StaffProfile {
  id: number;
  name: string;
  phone: string | null;
  bank_name: string | null;
  bank_account: string | null;
  staff_role: StaffRole;
  store_id: number | null; // 캐셔만 사용, 주방은 null
  preferred_shift_ids: number[]; // roster_shifts.id 목록, 빈 배열 = 파트 무관
  preferred_days: number[]; // 0=일 ~ 6=토, 빈 배열 = 요일 무관
  available_ranges: AvailabilityRange[];
  has_health_cert: boolean;
  health_cert_url: string | null;
  wants_insurance: boolean;
  hourly_rate: number | null;
  max_days_per_week: number | null; // null = 무제한
  status: StaffStatus;
  notes: string | null;
  user_profile_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// 파트 — 단위(주방/매장)별로 자유롭게 추가하는 근무 구간 (오전, 오후, 과일손질, 배송 ...)
export interface RosterShift {
  id: number;
  staff_role: StaffRole;
  store_id: number | null;
  name: string;
  start_time: string;
  end_time: string;
  weekday_required: number;
  weekend_required: number;
  active_from: string | null; // YYYY-MM-DD, null = 제한 없음
  active_to: string | null;   // YYYY-MM-DD, null = 종료일 없음
  break_minutes: number;      // 이 파트의 고정 휴게시간(분) — 관리자가 파트관리에서 설정
  sort_order: number;
  created_at: string;
}

export interface RosterShiftRequirement {
  id: number;
  work_date: string;
  shift_id: number;
  required: number;
}

export interface RosterAssignment {
  id: number;
  work_date: string;
  shift_id: number;
  staff_id: number;
  staff_role: StaffRole;
  store_id: number | null;
  start_time: string | null; // null이면 파트 기본 시간
  end_time: string | null;
  created_at: string;
  staff_profiles?: Pick<StaffProfile, 'id' | 'name' | 'phone' | 'status'>;
}

export interface Memo {
  id: number;
  title: string | null;
  content: string;
  color: string;
  is_pinned: boolean;
  type: 'note' | 'checklist';
  created_at: string;
  updated_at: string;
}

// ── Inventory ─────────────────────────────────────────────────────────────────

export interface Ingredient {
  id: string;
  name: string;
  category: '빵' | '크림' | '과일' | '패키지';
  color: string;
  unit_type: 'count' | 'weight';
  base_unit: string;
  container_unit: string;
  container_size: number;
  sealed_count: number;
  opened_remaining: number;
  reorder_at_containers: number;
  vendor: string | null;
  lead_days: number | null;
  unit_price: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface RestockEvent {
  id: number;
  ingredient_id: string;
  sealed_delta: number;
  opened_delta: number;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

