'use client';

import { useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { showMsg } from '@/lib/toast';

/**
 * 클립보드 복사 — Clipboard API가 막힌 환경(비보안 컨텍스트, 구형 웹뷰)에서는
 * 임시 textarea + execCommand로 폴백한다.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '0';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

interface Props {
  /** 실제로 클립보드에 들어갈 값 — 화면 표시와 다를 수 있다 (금액은 숫자만 등) */
  value: string;
  /** 토스트 문구에 쓰이는 항목 이름 — "이름 복사됨" */
  label: string;
  /** 토스트에 값까지 보여줄 때 사용 — "총 급여 1,240,000원 복사됨" */
  toastValue?: string;
  children?: ReactNode;
  className?: string;
  title?: string;
}

/**
 * 클릭하면 값이 클립보드로 복사되는 텍스트.
 * - 부모 행의 onClick(모달 열기 등)을 막기 위해 stopPropagation 한다.
 * - 드래그로 직접 선택한 직후의 클릭은 "선택" 의도이므로 복사하지 않는다.
 * - body에 걸린 user-select:none을 이 텍스트에 한해 풀어 드래그 선택도 가능하게 한다.
 */
export default function CopyText({ value, label, toastValue, children, className = '', title }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const [copied, setCopied] = useState(false);

  const handleClick = async (e: MouseEvent) => {
    e.stopPropagation();
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().trim() && ref.current && sel.containsNode(ref.current, true)) return;

    if (!await copyToClipboard(value)) {
      showMsg('복사에 실패했습니다. 직접 선택해서 복사해주세요');
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1000);
    showMsg(toastValue ? `${label} ${toastValue} 복사됨` : `${label} 복사됨`);
  };

  return (
    <span
      ref={ref}
      onClick={handleClick}
      title={title ?? `클릭해서 ${label} 복사`}
      className={`select-text cursor-pointer rounded px-0.5 -mx-0.5 underline-offset-2 decoration-dotted decoration-ink-faint transition-colors hover:underline hover:bg-primary-50 ${copied ? 'bg-primary-100' : ''} ${className}`}
    >
      {children ?? value}
    </span>
  );
}
