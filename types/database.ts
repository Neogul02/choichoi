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
  break_time: boolean;
  worker_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface Memo {
  id: number;
  title: string | null;
  content: string;
  color: string;
  created_at: string;
  updated_at: string;
}
