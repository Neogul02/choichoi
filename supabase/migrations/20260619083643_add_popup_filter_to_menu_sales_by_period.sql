CREATE OR REPLACE FUNCTION public.get_menu_sales_by_period(p_start timestamp with time zone, p_end timestamp with time zone, p_popup_id bigint DEFAULT NULL)
 RETURNS TABLE(menu_item_id bigint, item_name character varying, item_price numeric, item_color character varying, total_quantity bigint, total_revenue numeric)
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  SELECT
    oi.menu_item_id,
    mi.name AS item_name,
    mi.price AS item_price,
    mi.color AS item_color,
    SUM(oi.quantity) AS total_quantity,
    SUM(oi.subtotal) AS total_revenue
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  JOIN public.menu_items mi ON mi.id = oi.menu_item_id
  WHERE o.created_at >= p_start AND o.created_at <= p_end
    AND (p_popup_id IS NULL OR o.popup_id = p_popup_id)
  GROUP BY oi.menu_item_id, mi.name, mi.price, mi.color
  ORDER BY total_revenue DESC;
$function$
