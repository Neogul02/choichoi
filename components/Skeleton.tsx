// 로딩 중 콘텐츠 자리를 잡아주는 스켈레톤 — 텍스트 "불러오는 중..." 대신 레이아웃 점프를 줄인다

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-lg bg-canvas-soft ${className}`} />;
}

/** 월 뷰 달력 그리드 자리 (7열 × 5주) */
export function CalendarGridSkeleton() {
  return (
    <div className="grid grid-cols-7 gap-1" role="status" aria-label="근무표 불러오는 중">
      {Array.from({ length: 7 }, (_, i) => <Skeleton key={`h-${i}`} className="h-6" />)}
      {Array.from({ length: 35 }, (_, i) => <Skeleton key={i} className="min-h-[64px]" />)}
    </div>
  );
}

/** 주간 매트릭스 자리 (헤더 + 근무자 행) */
export function MatrixSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-1" role="status" aria-label="근무표 불러오는 중">
      <Skeleton className="h-8" />
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-10" />)}
    </div>
  );
}
