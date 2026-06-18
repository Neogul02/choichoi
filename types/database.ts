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
