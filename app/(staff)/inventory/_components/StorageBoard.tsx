'use client';

import { useRef, useState, useCallback } from 'react';
import type { StorageObjectWithItems } from '@/types/database';
import { storageIconMeta } from './storageIcons';

interface Props {
  objects: StorageObjectWithItems[];
  canEdit: boolean;
  onSelect: (object: StorageObjectWithItems) => void;
  onMove: (id: string, posX: number, posY: number) => void;
  onAddClick: () => void;
}

function clampPct(n: number): number {
  return Math.min(100, Math.max(0, n));
}

export default function StorageBoard({ objects, canEdit, onSelect, onMove, onAddClick }: Props) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);
  // pointerdown 시점의 (오브젝트 위치 - 포인터 위치) 오프셋 — 이게 없으면 드래그 시작과 동시에
  // 오브젝트 중심이 커서 위치로 순간이동해버린다
  const grabOffsetRef = useRef({ x: 0, y: 0 });

  const posFromPointer = useCallback((clientX: number, clientY: number) => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    };
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent, id: string, objPos: { x: number; y: number }) => {
    if (!canEdit) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    movedRef.current = false;
    const pointerPos = posFromPointer(e.clientX, e.clientY);
    grabOffsetRef.current = pointerPos ? { x: objPos.x - pointerPos.x, y: objPos.y - pointerPos.y } : { x: 0, y: 0 };
    setDraggingId(id);
    setDragPos(objPos);
  }, [canEdit, posFromPointer]);

  const handlePointerMove = useCallback((e: React.PointerEvent, id: string) => {
    if (draggingId !== id) return;
    const pos = posFromPointer(e.clientX, e.clientY);
    if (!pos) return;
    movedRef.current = true;
    setDragPos({
      x: clampPct(pos.x + grabOffsetRef.current.x),
      y: clampPct(pos.y + grabOffsetRef.current.y),
    });
  }, [draggingId, posFromPointer]);

  const handlePointerUp = useCallback((e: React.PointerEvent, id: string) => {
    if (draggingId !== id) return;
    const pos = posFromPointer(e.clientX, e.clientY);
    const wasMoved = movedRef.current;
    setDraggingId(null);
    setDragPos(null);
    if (pos && wasMoved) {
      onMove(id, clampPct(pos.x + grabOffsetRef.current.x), clampPct(pos.y + grabOffsetRef.current.y));
    }
  }, [draggingId, posFromPointer, onMove]);

  const handlePointerCancel = useCallback((id: string) => {
    if (draggingId !== id) return;
    setDraggingId(null);
    setDragPos(null);
    movedRef.current = false;
  }, [draggingId]);

  const handleClick = useCallback((object: StorageObjectWithItems) => {
    if (movedRef.current) { movedRef.current = false; return; }
    onSelect(object);
  }, [onSelect]);

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={boardRef}
        className="relative w-full min-h-[420px] md:min-h-[520px] rounded-2xl border-2 border-dashed border-hairline bg-canvas-soft overflow-hidden select-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      >
        {objects.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-ink-faint text-[12px] px-6 text-center">
            <span>아직 배치된 오브젝트가 없습니다.</span>
            {canEdit && <span>&quot;+ 오브젝트 추가&quot;로 냉장고·선반 등을 배치해보세요.</span>}
          </div>
        )}

        {objects.map((obj) => {
          const meta = storageIconMeta(obj.icon);
          const isDragging = draggingId === obj.id;
          const pos = isDragging && dragPos ? dragPos : { x: Number(obj.pos_x), y: Number(obj.pos_y) };
          return (
            <button
              key={obj.id}
              type="button"
              onPointerDown={(e) => handlePointerDown(e, obj.id, { x: Number(obj.pos_x), y: Number(obj.pos_y) })}
              onPointerMove={(e) => handlePointerMove(e, obj.id)}
              onPointerUp={(e) => handlePointerUp(e, obj.id)}
              onPointerCancel={() => handlePointerCancel(obj.id)}
              onClick={() => handleClick(obj)}
              className={`absolute flex flex-col items-center gap-1 -translate-x-1/2 -translate-y-1/2 rounded-xl px-2.5 py-2 bg-canvas shadow-level-1 border border-hairline transition-transform ${
                canEdit ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
              } ${isDragging ? 'scale-110 shadow-[0_8px_24px_rgba(0,0,0,0.18)] z-10' : 'hover:scale-105 z-0'}`}
              style={{ left: `${pos.x}%`, top: `${pos.y}%`, touchAction: canEdit ? 'none' : 'auto' }}
            >
              <span className="text-2xl leading-none">{meta.emoji}</span>
              <span className="text-[10px] font-bold text-ink whitespace-nowrap max-w-[72px] truncate">{obj.name}</span>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary-50 text-primary-700">
                {obj.ingredient_ids.length}종
              </span>
            </button>
          );
        })}
      </div>

      {canEdit && (
        <button
          type="button"
          onClick={onAddClick}
          className="self-start px-3.5 py-2 rounded-xl border-none bg-primary-700 text-white text-[13px] font-bold cursor-pointer hover:bg-primary-800 transition"
        >
          + 오브젝트 추가
        </button>
      )}
    </div>
  );
}
