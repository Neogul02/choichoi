-- storage_objects/storage_object_items를 supabase_realtime publication에 추가 —
-- 이게 없으면 클라이언트의 postgres_changes 구독이 이벤트를 받지 못해 보관함 보드가
-- 실시간으로 동기화되지 않는다.
alter publication supabase_realtime add table public.storage_objects, public.storage_object_items;
