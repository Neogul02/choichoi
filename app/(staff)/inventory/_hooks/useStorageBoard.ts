'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { fetchStorageBoard } from '@/app/actions/storage';
import type { StorageObjectWithItems } from '@/types/database';

/** initialObjects가 있으면(서버 프리페치) 마운트 시 재조회를 건너뛰고 실시간 구독만 연다 */
export function useStorageBoard(initialObjects?: StorageObjectWithItems[] | null) {
  const [objects, setObjects] = useState<StorageObjectWithItems[]>(initialObjects ?? []);
  const [isLoading, setIsLoading] = useState(initialObjects == null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    const res = await fetchStorageBoard();
    if (res.success && res.data) setObjects(res.data);
    else if (!res.success) toast.error(`보관함 조회 실패: ${res.error}`);
    if (!silent) setIsLoading(false);
  }, []);

  /** 드래그 종료 시 낙관적 반영 — 서버 응답을 기다리지 않고 즉시 위치를 반영한다 */
  const applyLocalPosition = useCallback((id: string, posX: number, posY: number) => {
    setObjects((prev) => prev.map((o) => (o.id === id ? { ...o, pos_x: posX, pos_y: posY } : o)));
  }, []);

  useEffect(() => {
    if (initialObjects == null) load();
    const suffix = Math.random().toString(36).slice(2);
    const channel = supabase
      .channel(`storage-board-${suffix}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'storage_objects' }, () => load(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'storage_object_items' }, () => load(true))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load, initialObjects]);

  return { objects, isLoading, reload: load, applyLocalPosition };
}
