// 목록이 비었을 때의 공용 표시 — 회색 한 줄짜리 안내 대신 "다음에 뭘 하면 되는지"를 보여준다.
// 빈 화면은 대부분 처음 쓰는 사람이 마주치는 화면이라, 설명보다 행동 버튼이 더 중요하다.

interface Props {
  /** 상단 아이콘 (이모지 한 글자 권장) */
  icon?: string;
  /** 한 줄 제목 — 왜 비었는지 */
  title: string;
  /** 보조 설명 (선택) */
  description?: string;
  /** 다음 행동 버튼 (선택) — 조회 전용 화면에서는 생략한다 */
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyState({ icon, title, description, actionLabel, onAction }: Props) {
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center text-center gap-2 rounded-2xl border border-dashed border-hairline bg-canvas-soft px-5 py-10"
    >
      {icon && <span aria-hidden="true" className="text-[28px] leading-none">{icon}</span>}
      <p className="m-0 text-[14px] font-bold text-ink-secondary break-keep">{title}</p>
      {description && <p className="m-0 text-[12px] text-ink-muted break-keep max-w-[280px]">{description}</p>}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-1.5 px-4 py-2 rounded-xl border-none bg-primary-700 text-white text-[13px] font-bold cursor-pointer hover:bg-primary-800 transition"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
