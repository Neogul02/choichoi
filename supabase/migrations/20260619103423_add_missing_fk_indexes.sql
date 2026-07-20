CREATE INDEX IF NOT EXISTS idx_orders_popup_id ON public.orders(popup_id);
CREATE INDEX IF NOT EXISTS idx_schedule_slots_event_id ON public.schedule_slots(event_id);
CREATE INDEX IF NOT EXISTS idx_workers_event_id ON public.workers(event_id);
