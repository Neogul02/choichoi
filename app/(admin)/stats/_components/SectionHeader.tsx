import type { ReactNode } from 'react';

interface Props {
  title: string;
  right?: ReactNode;
}

export default function SectionHeader({ title, right }: Props) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <h3 className="m-0 text-lg font-bold text-ink">{title}</h3>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}
