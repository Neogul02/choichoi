import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Utility functions for POS operations

export async function getMenuItems() {
  const { data, error } = await supabase
    .from('menu_items')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .order('id', { ascending: true });

  if (error) throw error;
  return data;
}

export async function getTodaysSales() {
  const { data, error } = await supabase
    .from('orders')
    .select('total_price')
    .gte('created_at', new Date().toISOString().split('T')[0])
    .lte('created_at', new Date().toISOString().split('T')[0] + 'T23:59:59Z');

  if (error) throw error;
  
  const totalRevenue = data?.reduce((sum, order) => sum + parseFloat(order.total_price), 0) || 0;
  return {
    totalOrders: data?.length || 0,
    totalRevenue: totalRevenue,
  };
}

export async function getTodaysOrderList() {
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('orders')
    .select('id,total_price,created_at,payment_status')
    .gte('created_at', `${today}T00:00:00Z`)
    .lte('created_at', `${today}T23:59:59Z`)
    .order('id', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function clearTodaysOrders() {
  const today = new Date().toISOString().split('T')[0];

  const { data: todayOrders, error: fetchError } = await supabase
    .from('orders')
    .select('id')
    .gte('created_at', `${today}T00:00:00Z`)
    .lte('created_at', `${today}T23:59:59Z`);

  if (fetchError) throw fetchError;

  if (!todayOrders || todayOrders.length === 0) {
    return { deletedCount: 0 };
  }

  const orderIds = todayOrders.map((order) => order.id);

  const { error: deleteError } = await supabase
    .from('orders')
    .delete()
    .in('id', orderIds);

  if (deleteError) throw deleteError;

  return { deletedCount: orderIds.length };
}

export async function createOrder(items, totalPrice) {
  // Insert order
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert([
      {
        total_price: totalPrice,
        payment_method: 'cash',
        payment_status: 'completed',
      },
    ])
    .select()
    .single();

  if (orderError) throw orderError;

  // Insert order items
  const orderItems = items
    .filter(item => item.count > 0)
    .map(item => ({
      order_id: order.id,
      menu_item_id: item.id,
      quantity: item.count,
      unit_price: item.price,
      subtotal: item.price * item.count,
    }));

  if (orderItems.length > 0) {
    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItems);

    if (itemsError) throw itemsError;
  }

  return order;
}

export async function addMenuItem(name, price, color) {
  const { data: lastItem, error: lastItemError } = await supabase
    .from('menu_items')
    .select('display_order')
    .order('display_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastItemError) throw lastItemError;

  const nextDisplayOrder = (lastItem?.display_order || 0) + 1;

  const { data, error } = await supabase
    .from('menu_items')
    .insert([
      {
        name,
        price,
        color,
        stock: 999,
        is_active: true,
        display_order: nextDisplayOrder,
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateMenuItem(id, name, price, color) {
  const { data, error } = await supabase
    .from('menu_items')
    .update({
      name,
      price,
      color,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteMenuItem(id) {
  const { error } = await supabase
    .from('menu_items')
    .update({ is_active: false })
    .eq('id', id);

  if (error) throw error;
}

export async function getAllMenuItems() {
  const { data, error } = await supabase
    .from('menu_items')
    .select('*')
    .order('display_order', { ascending: true })
    .order('id', { ascending: true });

  if (error) throw error;
  return data;
}

export async function getMonthlySalesByDate(year, month) {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59));

  const { data, error } = await supabase
    .from('orders')
    .select('created_at,total_price')
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString())
    .order('created_at', { ascending: true });

  if (error) throw error;

  const byDate = {};
  let monthTotal = 0;

  for (const order of data || []) {
    const dateKey = new Date(order.created_at).toISOString().slice(0, 10);
    const amount = Number(order.total_price || 0);
    byDate[dateKey] = (byDate[dateKey] || 0) + amount;
    monthTotal += amount;
  }

  return {
    byDate,
    monthTotal,
    totalOrders: (data || []).length,
  };
}

export async function updateMenuOrder(orderedIds) {
  const updates = orderedIds.map((id, index) =>
    supabase
      .from('menu_items')
      .update({ display_order: index + 1, updated_at: new Date().toISOString() })
      .eq('id', id)
  );

  const results = await Promise.all(updates);
  const failed = results.find((result) => result.error);

  if (failed?.error) throw failed.error;
}
