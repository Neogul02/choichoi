'use client';

import { useRef, useState, useCallback, useMemo } from 'react';
import type { Ingredient, StorageObjectWithItems } from '@/types/database';
import { totalQty } from '../_hooks/useInventory';
import { storageIconMeta } from './storageIcons';

interface Props {
  objects: StorageObjectWithItems[];
  ingredients: Ingredient[];
  canEdit: boolean;
  onSelect: (object: StorageObjectWithItems) => void;
  onMove: (id: string, posX: number, posY: number) => void;
  onAddClick: () => void;
}

/** 오브젝트 박스 한 칸의 픽셀 크기 — 배경 격자 크기와 맞춰 레고 블럭처럼 칸에 딱 맞게 스냅 */
const CELL_PX = 84;

function snapToSlot(px: number, boardLength: number): number {
  const snapped = Math.round(px / CELL_PX) * CELL_PX;
  return Math.min(Math.max(snapped, 0), Math.max(0, boardLength - CELL_PX));
}

/** 말풍선에 넣을 "재료명 수량" 짧은 표기 (예: 생크림 20개, 딸기 1.5kg) */
function formatBubbleQty(ing: Ingredient): string {
  const qty = totalQty(ing);
  const amount = ing.unit_type === 'weight'
    ? (qty >= 1000 ? `${(qty / 1000).toFixed(1)}kg` : `${qty}g`)
    : `${qty}${ing.base_unit}`;
  return `${ing.name} ${amount}`;
}

const BUBBLE_MAX = 3;

function ContentsBubble({ object, ingredientMap }: { object: StorageObjectWithItems; ingredientMap: Map<string, Ingredient> }) {
  const linked = object.ingredient_ids.map((id) => ingredientMap.get(id)).filter((i): i is Ingredient => i != null);
  if (linked.length === 0) return null;
  const shown = linked.slice(0, BUBBLE_MAX);
  const restCount = linked.length - shown.length;

  return (
    <div className="absolute left-full top-1/2 -translate-y-1/2 ml-1.5 z-0 pointer-events-none">
      <div className="relative bg-canvas border border-hairline rounded-lg px-2 py-1 shadow-level-1 whitespace-nowrap">
        <span className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 bg-canvas border-l border-b border-hairline rotate-45" />
        <span className="text-[10px] font-bold text-ink-muted">
          {shown.map((ing) => formatBubbleQty(ing)).join(' · ')}
          {restCount > 0 && ` 외 ${restCount}`}
        </span>
      </div>
    </div>
  );
}

export default function StorageBoard({ objects, ingredients, canEdit, onSelect, onMove, onAddClick }: Props) {
  const boardRef = useRef<HTMLDivElement>(null);
  const ingredientMap = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);
  // pointerdown 시점의 (오브젝트 위치 - 포인터 위치) 오프셋 — 이게 없으면 드래그 시작과 동시에
  // 오브젝트 중심이 커서 위치로 순간이동해버린다
  const grabOffsetRef = useRef({ x: 0, y: 0 });

  const posPxFromPointer = useCallback((clientX: number, clientY: number) => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    return { x: clientX - rect.left, y: clientY - rect.top, width: rect.width, height: rect.height };
  }, []);

  /** 스냅된 (좌상단 기준) px 좌표 → 저장용 % 좌표로 변환 */
  const snappedPctFromPointer = useCallback((clientX: number, clientY: number) => {
    const p = posPxFromPointer(clientX, clientY);
    if (!p) return null;
    const rawX = p.x + grabOffsetRef.current.x;
    const rawY = p.y + grabOffsetRef.current.y;
    const snappedX = snapToSlot(rawX, p.width);
    const snappedY = snapToSlot(rawY, p.height);
    return { x: (snappedX / p.width) * 100, y: (snappedY / p.height) * 100 };
  }, [posPxFromPointer]);

  const handlePointerDown = useCallback((e: React.PointerEvent, id: string, objPos: { x: number; y: number }) => {
    if (!canEdit) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    movedRef.current = false;
    const p = posPxFromPointer(e.clientX, e.clientY);
    const objPx = p ? { x: (objPos.x / 100) * p.width, y: (objPos.y / 100) * p.height } : { x: 0, y: 0 };
    grabOffsetRef.current = p ? { x: objPx.x - p.x, y: objPx.y - p.y } : { x: 0, y: 0 };
    setDraggingId(id);
    setDragPos(objPos);
  }, [canEdit, posPxFromPointer]);

  const handlePointerMove = useCallback((e: React.PointerEvent, id: string) => {
    if (draggingId !== id) return;
    const pos = snappedPctFromPointer(e.clientX, e.clientY);
    if (!pos) return;
    movedRef.current = true;
    setDragPos(pos);
  }, [draggingId, snappedPctFromPointer]);

  const handlePointerUp = useCallback((e: React.PointerEvent, id: string) => {
    if (draggingId !== id) return;
    const pos = snappedPctFromPointer(e.clientX, e.clientY);
    const wasMoved = movedRef.current;
    setDraggingId(null);
    setDragPos(null);
    if (pos && wasMoved) {
      onMove(id, pos.x, pos.y);
    }
  }, [draggingId, snappedPctFromPointer, onMove]);

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
    <div
      ref={boardRef}
      className="relative w-full min-h-[420px] md:min-h-[520px] rounded-2xl border-2 border-dashed border-hairline bg-canvas-soft overflow-visible select-none"
      style={{
        backgroundImage: [
          `linear-gradient(rgba(0,0,0,0.14) 1px, transparent 1px)`,
          `linear-gradient(90deg, rgba(0,0,0,0.14) 1px, transparent 1px)`,
        ].join(', '),
        backgroundSize: `${CELL_PX}px ${CELL_PX}px, ${CELL_PX}px ${CELL_PX}px`,
      }}
    >
      {canEdit && (
        <button
          type="button"
          onClick={onAddClick}
          title="오브젝트 추가"
          aria-label="오브젝트 추가"
          className="absolute top-2.5 right-2.5 z-20 flex items-center justify-center w-8 h-8 rounded-full border-none bg-primary-700 text-white text-lg font-bold cursor-pointer hover:bg-primary-800 transition shadow-level-1 leading-none"
        >
          +
        </button>
      )}

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
            <div
              key={obj.id}
              className="absolute"
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            >
              <button
                type="button"
                onPointerDown={(e) => handlePointerDown(e, obj.id, { x: Number(obj.pos_x), y: Number(obj.pos_y) })}
                onPointerMove={(e) => handlePointerMove(e, obj.id)}
                onPointerUp={(e) => handlePointerUp(e, obj.id)}
                onPointerCancel={() => handlePointerCancel(obj.id)}
                onClick={() => handleClick(obj)}
                className={`relative flex flex-col items-center justify-center gap-1 w-[84px] h-[84px] rounded-xl bg-canvas shadow-level-1 border border-hairline transition-transform ${
                  canEdit ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                } ${isDragging ? 'scale-110 shadow-[0_8px_24px_rgba(0,0,0,0.18)] z-10' : 'hover:scale-105 z-0'}`}
                style={{ touchAction: canEdit ? 'none' : 'auto' }}
              >
                <span className="text-2xl leading-none">{meta.emoji}</span>
                <span className="text-[10px] font-bold text-ink whitespace-nowrap max-w-[72px] truncate">{obj.name}</span>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary-50 text-primary-700">
                  {obj.ingredient_ids.length}종
                </span>
              </button>
              {!isDragging && <ContentsBubble object={obj} ingredientMap={ingredientMap} />}
            </div>
          );
        })}
    </div>
  );
}
