'use client';

import { useState } from 'react';
import { showMsg } from '@/lib/toast';

const DEFAULT_REJECTION_MSG = `안녕하세요, [이름]님.

히요리산도 아르바이트에 관심 가져주셔서 감사합니다.

신중한 검토 끝에, 아쉽게도 이번에는 함께하기 어렵게 되었습니다.

소중한 시간 내어 면접에 참여해 주신 점 진심으로 감사드리며, 앞으로의 활동에 좋은 결과가 있으시길 바랍니다.

감사합니다.
초이초이 드림`;

/** 불합격 필터에서만 보이는 통지 메시지 편집·복사 박스 */
export default function RejectionNoticeBox() {
  const [rejectionMsg, setRejectionMsg] = useState(DEFAULT_REJECTION_MSG);

  return (
    <div className="mb-3 p-3 rounded-2xl bg-rose-50 border border-rose-200">
      <div className="flex items-center justify-between mb-1.5">
        <p className="m-0 text-[12px] font-bold text-rose-700">불합격 통지 메시지</p>
        <button
          onClick={async () => { await navigator.clipboard.writeText(rejectionMsg); showMsg('클립보드에 복사됐습니다!'); }}
          className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-bold border-none cursor-pointer hover:bg-rose-700 transition"
        >
          복사
        </button>
      </div>
      <textarea
        value={rejectionMsg}
        onChange={e => setRejectionMsg(e.target.value)}
        rows={8}
        className="w-full px-2.5 py-2 border border-rose-200 rounded-lg text-[12px] bg-white focus:outline-none focus:border-rose-400 resize-y leading-relaxed"
      />
      <button
        onClick={() => setRejectionMsg(DEFAULT_REJECTION_MSG)}
        className="mt-1 text-[10px] text-rose-500 bg-transparent border-none cursor-pointer hover:text-rose-700 transition"
      >
        기본 양식으로 초기화
      </button>
    </div>
  );
}
