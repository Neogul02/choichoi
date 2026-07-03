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

export interface OrderItem {
  id: number;
  order_id: number;
  menu_item_id: number;
  quantity: number;
  unit_price: number;
  subtotal: number;
  menu_items?: Pick<MenuItem, 'id' | 'name' | 'price' | 'color'>;
}

export interface PopupEvent {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  created_at: string;
}

export interface Worker {
  id: number;
  event_id: number;
  name: string;
  color: string;
  phone: string | null;
  bank_name: string | null;
  bank_account: string | null;
  hourly_rate: number;
  payment_done: boolean;
  worker_role: string | null;
  user_profile_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScheduleSlot {
  id: number;
  event_id: number;
  schedule_date: string;
  role: string;
  person_name: string;
  work_time: string | null;
  break_time: number;
  worker_id: number | null;
  created_at: string;
  updated_at: string;
}

// ── HR (인사관리) ─────────────────────────────────────────────────────────────

export interface AvailabilityRange {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
}

export type StaffShift = 'AM' | 'PM' | 'ANY';
export type StaffStatus = 'candidate' | 'confirmed' | 'rejected' | 'inactive';
export type StaffRole = 'kitchen' | 'cashier';

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
  staff_role: StaffRole;
  store_id: number | null; // 캐셔만 사용, 주방은 null
  preferred_shift: StaffShift;
  preferred_days: number[]; // 0=일 ~ 6=토, 빈 배열 = 요일 무관
  available_ranges: AvailabilityRange[];
  has_health_cert: boolean;
  wants_insurance: boolean;
  hourly_rate: number | null;
  max_days_per_week: number | null; // null = 무제한
  status: StaffStatus;
  notes: string | null;
  user_profile_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface RosterSettings {
  id: number;
  staff_role: StaffRole;
  store_id: number | null;
  am_start: string;
  am_end: string;
  pm_start: string;
  pm_end: string;
  weekday_am_required: number;
  weekday_pm_required: number;
  weekend_am_required: number;
  weekend_pm_required: number;
  updated_at: string;
}

export interface RosterRequirement {
  id: number;
  work_date: string;
  staff_role: StaffRole;
  store_id: number | null;
  am_required: number;
  pm_required: number;
}

export interface RosterAssignment {
  id: number;
  work_date: string;
  shift: 'AM' | 'PM';
  staff_id: number;
  staff_role: StaffRole;
  store_id: number | null;
  start_time: string | null; // null이면 settings의 파트 기본 시간
  end_time: string | null;
  created_at: string;
  staff_profiles?: Pick<StaffProfile, 'id' | 'name' | 'phone' | 'preferred_shift' | 'status'>;
}

export interface Memo {
  id: number;
  title: string | null;
  content: string;
  color: string;
  is_pinned: boolean;
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

export interface Recipe {
  menu_id: number;
  ingredient_id: string;
  qty_per_unit: number;
  ingredients?: Ingredient;
  menu_items?: Pick<MenuItem, 'id' | 'name'>;
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

export interface DeductionEvent {
  id: number;
  order_id: number | null;
  ingredient_id: string;
  qty_deducted: number;
  created_at: string;
  ingredients?: Pick<Ingredient, 'id' | 'name' | 'base_unit'>;
}
