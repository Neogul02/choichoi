import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface OrderItemInput {
  id: number;
  name: string;
  price: number;
  count: number;
}

export interface WorkerInput {
  event_id: number;
  name: string;
  color?: string;
  phone?: string;
  bank_name?: string;
  bank_account?: string;
  hourly_rate?: number;
  worker_role?: string;
}
