'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DEFAULT_NOTICES, loadNotices, saveNotice } from '@/lib/notice-presets';
import { hexWithAlpha } from '@/lib/utils';
import type { NoticeText, ScreenNotice } from '@/types/display';

const COLOR_PRESETS = ['#1a1a1a', '#084431', '#e11d48', '#b45309', '#1d4ed8'];

function NoticeToggle({ noticeType, setNoticeType }: { noticeType: ScreenNotice; setNoticeType: (t: ScreenNotice) => void }) {
  return (
    <div className="flex items-center gap-1 bg-[#f0f0f0] rounded-xl p-1">
      <button
        onClick={() => setNoticeType('away')}
        className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all duration-200 cursor-pointer border-none ${
          noticeType === 'away' ? 'bg-white text-[#1a1a1a] shadow-sm' : 'bg-transparent text-[#999] hover:text-[#555]'
        }`}
      >
        부재중
      </button>
      <button
        onClick={() => setNoticeType('soldout')}
        className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all duration-200 cursor-pointer border-none ${
          noticeType === 'soldout' ? 'bg-white text-[#1a1a1a] shadow-sm' : 'bg-transparent text-[#999] hover:text-[#555]'
        }`}
      >
        품절안내문
      </button>
    </div>
  );
}

export default function ScreenMode() {
  const [noticeType, setNoticeType] = useState<ScreenNotice>('away');
  const [notices, setNotices] = useState<Record<ScreenNotice, NoticeText>>(DEFAULT_NOTICES);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<NoticeText>(DEFAULT_NOTICES.away);

  useEffect(() => {
    setNotices(loadNotices());
  }, []);

  const current = notices[noticeType];

  const startEditing = () => {
    setDraft(current);
    setEditing(true);
  };

  const saveEditing = () => {
    const next = saveNotice(noticeType, draft);
    setNotices(next);
    setEditing(false);
  };

  return (
    <motion.div
      key="screen"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="flex-1 flex flex-col"
    >
      <div className="flex items-center justify-center gap-1.5 pt-5 pb-1">
        <NoticeToggle
          noticeType={noticeType}
          setNoticeType={(t) => {
            setNoticeType(t);
            setEditing(false);
          }}
        />
        <button
          onClick={startEditing}
          className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#f5f6f7] text-[#999] hover:bg-[#eee] hover:text-[#555] transition-all duration-200 border-none cursor-pointer"
          title="문구 수정"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <AnimatePresence mode="wait">
          {editing ? (
            <motion.div
              key="edit"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-md flex flex-col gap-3"
            >
              <input
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                placeholder="제목"
                className="w-full px-4 py-3 rounded-xl border border-[#e0e0e0] text-xl font-bold text-[#1a1a1a] outline-none focus:border-primary-700"
              />
              <input
                value={draft.subtitle}
                onChange={(e) => setDraft((d) => ({ ...d, subtitle: e.target.value }))}
                placeholder="부제목"
                className="w-full px-4 py-3 rounded-xl border border-[#e0e0e0] text-base text-[#555] outline-none focus:border-primary-700"
              />
              <div className="flex items-center gap-2.5 px-1">
                <span className="text-sm font-bold text-[#555] mr-0.5">문구 색상</span>
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setDraft((d) => ({ ...d, color: c }))}
                    className={`w-8 h-8 rounded-full border-2 cursor-pointer transition-all duration-150 ${
                      draft.color === c ? 'border-[#1a1a1a] scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                    aria-label={`색상 ${c}`}
                  />
                ))}
              </div>
              <div className="flex gap-2 mt-1">
                <button
                  onClick={() => setEditing(false)}
                  className="flex-1 py-3 rounded-xl bg-[#f0f0f0] text-[#555] text-base font-bold border-none cursor-pointer hover:bg-[#e5e5e5] transition-all"
                >
                  취소
                </button>
                <button
                  onClick={saveEditing}
                  className="flex-1 py-3 rounded-xl bg-primary-700 text-white text-base font-bold border-none cursor-pointer hover:bg-primary-800 transition-all"
                >
                  저장
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key={noticeType}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.25 }}
              className="text-center"
            >
              <h2 className="text-7xl font-black mb-4 m-0" style={{ color: current.color }}>{current.title}</h2>
              <p className="text-3xl m-0" style={{ color: hexWithAlpha(current.color, 0.6) }}>{current.subtitle}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
