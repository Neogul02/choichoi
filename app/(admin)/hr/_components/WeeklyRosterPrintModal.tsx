'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePDF } from '@react-pdf/renderer'
import { WeeklyRosterDocument } from './WeeklyRosterDocument'
import { fetchWeeklyRosterForPrint } from '@/app/actions/roster'
import type { WeeklyRosterEntry } from '@/app/actions/roster'
import { showMsg } from '@/lib/toast'

interface Props {
  onClose: () => void
}

const DAY_KR = ['일', '월', '화', '수', '목', '금', '토']

function pad(n: number) { return String(n).padStart(2, '0') }

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function getThisMonday(): string {
  const d = new Date()
  d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1))
  return toDateStr(d)
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return toDateStr(d)
}

function formatRangeLabel(from: string, to: string): string {
  const s = new Date(from + 'T00:00:00')
  const e = new Date(to + 'T00:00:00')
  const sd = `${s.getMonth() + 1}월 ${s.getDate()}일(${DAY_KR[s.getDay()]})`
  const ed = `${e.getMonth() + 1}월 ${e.getDate()}일(${DAY_KR[e.getDay()]})`
  const prefix = s.getFullYear() === e.getFullYear() ? `${s.getFullYear()}년 ` : ''
  return from === to ? `${s.getFullYear()}년 ${sd}` : `${prefix}${sd} ~ ${ed}`
}

function getInitialRange(): { from: string; to: string } {
  try {
    const rf = localStorage.getItem('roster_rangeFrom') ?? ''
    const rt = localStorage.getItem('roster_rangeTo') ?? ''
    if (rf && rt) return { from: rf, to: rt }

    const raw = localStorage.getItem('roster_cursor')
    if (raw) {
      const { y, m } = JSON.parse(raw) as { y: number; m: number }
      const from = `${y}-${String(m + 1).padStart(2, '0')}-01`
      const lastDay = new Date(y, m + 1, 0).getDate()
      const to = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
      return { from, to }
    }
  } catch { /* ignore */ }
  const monday = getThisMonday()
  return { from: monday, to: addDays(monday, 6) }
}

export default function RosterPrintModal({ onClose }: Props) {
  const monday = getThisMonday()
  const init = getInitialRange()
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [staffRole, setStaffRole] = useState<'kitchen' | 'cashier'>('kitchen')
  const [entries, setEntries] = useState<WeeklyRosterEntry[]>([])
  const [fetched, setFetched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [displayUrl, setDisplayUrl] = useState<string | null>(null)

  const rangeLabel = formatRangeLabel(from, to)
  const roleLabel = staffRole === 'kitchen' ? '주방' : '캐셔'
  const weekLabel = `[${roleLabel}] ${rangeLabel}`
  const isValidRange = from <= to

  const [pdfInstance, updatePdf] = usePDF({
    document: <WeeklyRosterDocument weekLabel={weekLabel} entries={entries} />,
  })

  useEffect(() => {
    updatePdf(<WeeklyRosterDocument weekLabel={weekLabel} entries={entries} />)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, weekLabel])

  useEffect(() => {
    if (!pdfInstance.loading && pdfInstance.url) setDisplayUrl(pdfInstance.url)
  }, [pdfInstance.loading, pdfInstance.url])

  const resetPreview = () => {
    setFetched(false)
    setEntries([])
    setDisplayUrl(null)
  }

  const handleFromChange = (v: string) => { setFrom(v); resetPreview() }
  const handleToChange = (v: string) => { setTo(v); resetPreview() }
  const handleRoleChange = (role: 'kitchen' | 'cashier') => { setStaffRole(role); resetPreview() }

  const applyWeekPreset = (offsetWeeks: number) => {
    const base = new Date(monday + 'T00:00:00')
    base.setDate(base.getDate() + offsetWeeks * 7)
    const newFrom = toDateStr(base)
    const newTo = addDays(newFrom, 6)
    setFrom(newFrom)
    setTo(newTo)
    resetPreview()
  }

  const handleLoad = async () => {
    if (!isValidRange) { showMsg('시작일이 종료일보다 늦습니다.'); return }
    setDisplayUrl(null)
    setLoading(true)
    const res = await fetchWeeklyRosterForPrint(from, to, staffRole)
    setLoading(false)
    if (res.success && res.data) {
      setEntries(res.data)
      setFetched(true)
    } else {
      showMsg(`오류: ${res.error}`)
    }
  }

  const uniqueDays = new Set(entries.map(e => e.work_date)).size

  const inputCls = 'w-full px-2.5 py-1.5 border border-hairline rounded-lg text-[12px] bg-canvas focus:outline-none focus:border-primary-700'

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
    >
      <div className="bg-canvas w-full max-w-[1600px] h-[95vh] rounded-xl shadow-level-2 border border-hairline flex flex-col overflow-hidden">

        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-hairline bg-canvas-soft shrink-0">
          <h3 className="m-0 text-[15px] font-bold text-ink">근무표 인쇄</h3>
          <button onClick={onClose} className="bg-transparent border-none text-ink-faint text-[22px] cursor-pointer hover:text-ink transition leading-none">×</button>
        </div>

        {/* 본문 */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* 좌측: 설정 */}
          <div className="w-[270px] shrink-0 overflow-y-auto p-4 flex flex-col gap-4 border-r border-hairline">

            {/* 역할 선택 */}
            <div>
              <p className="m-0 mb-1.5 text-[11px] font-bold text-ink-muted uppercase tracking-wide">파트 선택</p>
              <div className="flex rounded-lg border border-hairline overflow-hidden">
                {(['kitchen', 'cashier'] as const).map((role) => (
                  <button
                    key={role}
                    onClick={() => handleRoleChange(role)}
                    className={`flex-1 py-1.5 text-[12px] font-semibold border-none cursor-pointer transition ${staffRole === role ? 'bg-primary-700 text-white' : 'bg-canvas text-ink-muted hover:bg-canvas-soft'}`}
                  >
                    {role === 'kitchen' ? '주방' : '캐셔'}
                  </button>
                ))}
              </div>
            </div>

            {/* 날짜 범위 */}
            <div>
              <p className="m-0 mb-2 text-[11px] font-bold text-ink-muted uppercase tracking-wide">기간 설정</p>
              <div className="flex flex-col gap-1.5">
                <div>
                  <label className="text-[10px] font-semibold text-ink-muted mb-0.5 block">시작일</label>
                  <input
                    type="date"
                    value={from}
                    onChange={e => handleFromChange(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-ink-muted mb-0.5 block">종료일</label>
                  <input
                    type="date"
                    value={to}
                    onChange={e => handleToChange(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>
              {!isValidRange && (
                <p className="m-0 mt-1.5 text-[11px] text-red-500">시작일이 종료일보다 늦습니다.</p>
              )}
            </div>

            {/* 주 단위 빠른 선택 */}
            <div>
              <p className="m-0 mb-1.5 text-[11px] font-bold text-ink-muted uppercase tracking-wide">빠른 선택</p>
              <div className="flex gap-1.5 flex-wrap">
                {([[-1, '저번 주'], [0, '이번 주'], [1, '다음 주']] as [number, string][]).map(([offset, label]) => (
                  <button
                    key={offset}
                    onClick={() => applyWeekPreset(offset)}
                    className="px-2.5 py-1 rounded-lg border border-hairline bg-canvas text-[11px] font-semibold text-ink-muted cursor-pointer hover:bg-canvas-soft transition"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* 불러오기 */}
            <button
              onClick={handleLoad}
              disabled={loading || !isValidRange}
              className="w-full py-2 rounded-lg bg-primary-700 text-white text-[12px] font-bold border-none cursor-pointer hover:bg-primary-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {loading ? '불러오는 중...' : '불러오기'}
            </button>

            {/* 결과 요약 */}
            {fetched && (
              <div className="rounded-lg bg-canvas-soft border border-hairline px-3 py-2.5">
                <p className="m-0 text-[11px] font-semibold text-ink-muted">{rangeLabel}</p>
                <p className="m-0 text-[13px] font-bold text-ink mt-1">총 {entries.length}명 배정</p>
                <p className="m-0 text-[11px] text-ink-muted mt-0.5">{uniqueDays}일 근무일</p>
                {entries.length === 0 && (
                  <p className="m-0 text-[11px] text-amber-600 mt-1">배정된 근무자가 없습니다.</p>
                )}
              </div>
            )}

            <div className="text-[10px] text-ink-faint leading-relaxed">
              <p className="m-0">확정(재직중) 상태 근무자만 표시됩니다.</p>
              <p className="m-0 mt-1">실 출근/퇴근 칸은 수기 기입용 빈칸입니다.</p>
            </div>
          </div>

          {/* 우측: PDF 미리보기 */}
          <div className="flex-1 min-w-0 bg-canvas-soft flex flex-col">
            <div className="px-4 py-2 border-b border-hairline bg-canvas text-[11px] text-ink-muted font-semibold shrink-0">미리보기</div>
            <div className="flex-1 min-h-0">
              {!fetched ? (
                <div className="flex items-center justify-center h-full text-ink-faint text-sm">
                  기간을 설정 후 불러오기를 눌러주세요
                </div>
              ) : pdfInstance.error ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 px-6">
                  <span className="text-red-500 text-sm font-semibold">PDF 렌더링 오류</span>
                  <span className="text-red-400 text-xs text-center break-all">{String(pdfInstance.error)}</span>
                </div>
              ) : !displayUrl ? (
                <div className="flex flex-col items-center justify-center h-full gap-2">
                  <div className="w-6 h-6 border-2 border-primary-700 border-t-transparent rounded-full animate-spin" />
                  <span className="text-ink-muted text-sm">PDF 렌더링 중...</span>
                </div>
              ) : (
                <div className="relative w-full h-full">
                  <iframe src={displayUrl} className="w-full h-full border-none" title="근무표 미리보기" />
                  {pdfInstance.loading && (
                    <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-canvas/90 border border-hairline rounded-full px-2.5 py-1 shadow text-[10px] text-ink-muted">
                      <div className="w-3 h-3 border border-primary-700 border-t-transparent rounded-full animate-spin" />
                      갱신 중...
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-hairline bg-canvas-soft shrink-0">
          <p className="m-0 text-[11px] text-ink-faint">미리보기 우측 상단 다운로드 버튼으로 PDF를 저장할 수 있습니다</p>
          <div className="flex gap-2">
            {displayUrl && (
              <a
                href={displayUrl}
                download={`${roleLabel}_근무표_${from}_${to}.pdf`}
                className="px-4 py-2 rounded-lg bg-primary-700 text-white text-[12px] font-bold no-underline inline-block cursor-pointer hover:bg-primary-800 transition"
              >
                PDF 다운로드
              </a>
            )}
            <button onClick={onClose} className="px-4 py-2 rounded-lg bg-canvas border border-hairline text-[12px] font-semibold text-ink-secondary cursor-pointer hover:bg-canvas-soft transition">닫기</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
