SELECT setval('orders_id_seq', (SELECT MAX(id) FROM orders));
SELECT setval('order_items_id_seq', (SELECT MAX(id) FROM order_items));
SELECT setval('menu_items_id_seq', (SELECT MAX(id) FROM menu_items));
SELECT setval('workers_id_seq', (SELECT MAX(id) FROM workers));
SELECT setval('popup_events_id_seq', (SELECT MAX(id) FROM popup_events));
SELECT setval('memos_id_seq', (SELECT MAX(id) FROM memos));
SELECT setval('schedule_slots_id_seq', (SELECT MAX(id) FROM schedule_slots));
