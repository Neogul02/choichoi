'use client'

import { useCallback, useEffect, useState } from 'react'
import NavBar from '@/components/NavBar'
import ConfirmDialog from '@/components/ConfirmDialog'
import { showMsg } from '@/lib/toast'
import { addDays, kstToday } from '@/lib/date'
import { formatTimeRange } from '@/lib/workhours'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'
import { ATTENDANCE_BREAK_OPTIONS, ATTENDANCE_LOG_DAYS as LOG_DAYS, type AttendanceBreak, kstHHMMSSOf, kstSlashDateOf } from '@/lib/attendance'
import { formatPhoneInput, isValidKoreanPhone } from '@/lib/phone'
import {
  clockIn, clockOut, fetchAttendanceBoard, fetchAttendanceLog, voidAttendance,
  type AttendanceBoard, type AttendanceBoardItem, type AttendanceLogEntry,
} from '@/app/actions/attendance'

const REFRESH_MS = 60 * 1000

const breakLabel = (m: number) => (m === 0 ? '없음' : m === 60 ? '1시간' : `${m}분`)

type Phase = 'before' | 'working' | 'done'
const phaseOf = (item: AttendanceBoardItem): Phase =>
  !item.record ? 'before' : item.record.status === 'open' ? 'working' : 'done'

interface Props {
  initialBoard: AttendanceBoard | null
  initialLog: AttendanceLogEntry[] | null
  isAdmin: boolean
}

export default function AttendanceClient({ initialBoard, initialLog, isAdmin }: Props) {
  const [board, setBoard] = useState(initialBoard)
  const [log, setLog] = useState(initialLog)
  const [selected, setSelected] = useState<AttendanceBoardItem | null>(null)

  const reload = useCallback(async () => {
    const r = await fetchAttendanceBoard()
    if (r.success && r.data) setBoard(r.data)
    if (isAdmin) {
      const today = kstToday()
      const l = await fetchAttendanceLog(addDays(today, -(LOG_DAYS - 1)), today)
      if (l.success && l.data) setLog(l.data)
    }
  }, [isAdmin])

  // 아이패드를 켜 둔 채로 하루를 넘기므로 주기적으로, 그리고 화면이 다시 보일 때 새로 고친다
  useEffect(() => {
    const id = window.setInterval(reload, REFRESH_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') reload() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', onVisible) }
  }, [reload])

  return (
    <>
      <NavBar />
      <main className="min-h-screen p-4 pb-10">
        <div className="max-w-[1100px] mx-auto space-y-5">
          <Clock />
          {!board ? (
            <p className="text-center text-ink-muted py-10">출근부를 불러오지 못했습니다. 새로고침 해주세요.</p>
          ) : board.items.length === 0 ? (
            <p className="text-center text-ink-muted py-10">등록된 주방 직원이 없습니다.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {board.items.map(item => (
                <StaffCard key={item.staffId} item={item} onPick={setSelected} />
              ))}
            </div>
          )}
          {isAdmin && log && <AdminLog entries={log} onChanged={reload} />}
        </div>
      </main>
      {selected && (
        <PunchDialog item={selected} onClose={() => { setSelected(null); reload() }} onDone={() => { setSelected(null); reload() }} />
      )}
    </>
  )
}

// 시계는 브라우저 시각이다(화면 안내용). 실제 기록 시각은 서버가 정한다
function Clock() {
  const now = useNow()
  return (
    <div className="text-center pt-2">
      <p className="m-0 text-[16px] font-semibold text-ink-muted tabular-nums">{now == null ? '\u00a0' : kstSlashDateOf(now)}</p>
      <p className="m-0 text-[48px] font-extrabold text-ink tabular-nums leading-tight">
        {now == null ? '--:--:--' : kstHHMMSSOf(now)}
      </p>
      <p className="m-0 text-[13px] text-ink-faint">이름을 눌러 출근·퇴근하세요. 출근과 퇴근은 각각 한 번만 누를 수 있습니다.</p>
    </div>
  )
}

// 1초마다 갱신되는 현재 시각 — 서버 렌더 때는 null(하이드레이션 불일치 방지)
function useNow(): number | null {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

function StaffCard({ item, onPick }: { item: AttendanceBoardItem; onPick: (i: AttendanceBoardItem) => void }) {
  const phase = phaseOf(item)
  const rec = item.record
  const tone =
    phase === 'working' ? 'border-emerald-400 bg-emerald-50 attendance-working'
    : phase === 'done' ? 'border-hairline bg-canvas-soft opacity-70'
    : 'border-hairline bg-canvas'
  return (
    <button
      type="button"
      disabled={phase === 'done'}
      onClick={() => onPick(item)}
      className={`text-left rounded-xl border-2 p-4 min-h-[120px] flex flex-col justify-between cursor-pointer transition-colors disabled:cursor-default ${tone}`}
    >
      <p className="m-0 text-[22px] font-bold text-ink">{item.name}</p>
      {phase === 'working' && rec ? (
        <div className="mt-3">
          <span className="inline-flex items-center gap-1.5 text-[14px] font-bold text-emerald-700">
            <span className="relative flex w-2.5 h-2.5">
              <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
              <span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-emerald-500" />
            </span>
            근무 중
          </span>
          <p className="m-0 mt-0.5 text-[13px] text-emerald-800 tabular-nums">{rec.clockIn} 출근</p>
        </div>
      ) : (
        <p className="m-0 mt-3 text-[14px] font-semibold text-ink-secondary tabular-nums">
          {phase === 'before' && '출근 전'}
          {phase === 'done' && rec && `퇴근 완료 · ${rec.clockIn}~${rec.clockOut} · 휴게 ${breakLabel(rec.breakMinutes ?? 0)}`}
        </p>
      )}
    </button>
  )
}

const KEYPAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'] as const

// 배경을 눌러도 닫히지 않는다 — 공용 아이패드에서 번호를 누르다 바깥을 스쳐 입력이 날아가지 않게.
// 닫기는 취소 버튼으로만.
function PunchDialog({ item, onClose, onDone }: { item: AttendanceBoardItem; onClose: () => void; onDone: () => void }) {
  useBodyScrollLock(true)
  const isOut = phaseOf(item) === 'working'
  const now = useNow()
  const [brk, setBrk] = useState<AttendanceBreak | null>(null)
  const [digits, setDigits] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const press = (k: (typeof KEYPAD)[number]) => {
    setError(null)
    if (k === 'clear') setDigits('')
    else if (k === 'back') setDigits(d => d.slice(0, -1))
    else setDigits(d => (d.length < 11 ? d + k : d))
  }

  const ready = isValidKoreanPhone(digits) && (!isOut || brk != null)

  const submit = async () => {
    if (busy || !ready) return
    setBusy(true)
    const r = isOut && item.record
      ? await clockOut(item.record.id, brk!, digits)
      : await clockIn(item.staffId, digits)
    setBusy(false)
    if (r.success && r.data) {
      showMsg(`${r.data.name}님 ${r.data.time} ${isOut ? '퇴근' : '출근'} 완료`)
      onDone()
      return
    }
    // 실패하면 창을 유지하고 번호만 지운다 — 번호를 잘못 눌렀으면 바로 다시 입력할 수 있게
    setError(r.error ?? '기록하지 못했습니다.')
    setDigits('')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-canvas w-full max-w-[460px] max-h-[100dvh] overflow-y-auto rounded-2xl shadow-level-2 border border-hairline p-6">
        <p className="m-0 text-[24px] font-bold text-ink">{item.name}님</p>
        <p className="m-0 mt-1 text-[18px] text-ink-secondary">
          <span className="font-bold text-ink tabular-nums">{now == null ? '--:--:--' : kstHHMMSSOf(now)}</span>에 {isOut ? '퇴근' : '출근'}합니다
        </p>
        {isOut && (
          <div className="mt-4">
            <p className="m-0 mb-2 text-[15px] font-semibold text-ink">쉬는시간이 있었나요?</p>
            <div className="grid grid-cols-3 gap-2">
              {ATTENDANCE_BREAK_OPTIONS.map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setBrk(m)}
                  className={`py-3 rounded-xl border-2 text-[16px] font-bold cursor-pointer transition-colors ${
                    brk === m ? 'border-primary-700 bg-primary-700 text-white' : 'border-hairline bg-canvas text-ink'
                  }`}
                >
                  {breakLabel(m)}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="mt-4">
          <p className="m-0 mb-2 text-[15px] font-semibold text-ink">본인 확인 — 전화번호를 입력하세요</p>
          <div className={`h-[52px] rounded-xl border-2 flex items-center justify-center text-[24px] font-bold tabular-nums tracking-wide ${
            error ? 'border-rose-400 text-rose-600' : 'border-hairline text-ink'
          }`}>
            {digits ? formatPhoneInput(digits) : <span className="text-[16px] font-medium text-ink-faint">010-0000-0000</span>}
          </div>
          {error && <p className="m-0 mt-1.5 text-[13px] font-semibold text-rose-600">{error}</p>}
          <div className="grid grid-cols-3 gap-2 mt-3">
            {KEYPAD.map(k => (
              <button
                key={k}
                type="button"
                onClick={() => press(k)}
                disabled={busy}
                className={`py-3 rounded-xl border border-hairline text-[20px] font-bold cursor-pointer active:bg-primary-50 disabled:opacity-50 ${
                  k === 'clear' || k === 'back' ? 'bg-canvas-soft text-ink-secondary text-[15px]' : 'bg-canvas text-ink'
                }`}
              >
                {k === 'clear' ? '전체 지움' : k === 'back' ? '←' : k}
              </button>
            ))}
          </div>
        </div>
        <p className="m-0 mt-4 text-[12px] text-ink-faint">
          {isOut ? '퇴근은 한 번만 기록됩니다.' : '출근은 한 번만 기록됩니다.'} 잘못 눌렀다면 관리자에게 알려주세요.
        </p>
        <div className="flex gap-2 mt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 py-3.5 rounded-xl border border-hairline bg-canvas-soft text-ink-secondary text-[16px] font-semibold cursor-pointer disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !ready}
            className="flex-1 py-3.5 rounded-xl border-none bg-primary-700 text-white text-[16px] font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? '기록 중…' : isOut ? '퇴근' : '출근'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 관리자: 최근 기록 확인·취소 ─────────────────────────────────────────────

function AdminLog({ entries, onChanged }: { entries: AttendanceLogEntry[]; onChanged: () => void }) {
  const [target, setTarget] = useState<AttendanceLogEntry | null>(null)
  const [busy, setBusy] = useState(false)

  const runVoid = async () => {
    if (!target) return
    setBusy(true)
    const r = await voidAttendance(target.id)
    setBusy(false)
    setTarget(null)
    if (r.success) showMsg(`${target.name}님 ${target.workDate} 기록을 취소했습니다`)
    else showMsg(`오류: ${r.error}`)
    onChanged()
  }

  return (
    <section className="rounded-xl border border-hairline bg-canvas p-4">
      <h2 className="m-0 mb-1 text-[16px] font-bold text-ink">최근 {LOG_DAYS}일 출퇴근 기록</h2>
      <p className="m-0 mb-3 text-[12px] text-ink-faint">
        퇴근을 찍으면 그날 근무표 시간이 실측으로 바뀝니다. 시간 정정은 인사 → 근무표에서, 잘못 누른 기록은 여기서 취소하세요.
      </p>
      {entries.length === 0 ? (
        <p className="m-0 text-[13px] text-ink-muted">기록이 없습니다.</p>
      ) : (
        <ul className="m-0 p-0 list-none divide-y divide-hairline">
          {entries.map(e => (
            <li key={e.id} className="py-2.5 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="m-0 text-[14px] font-semibold text-ink">
                  {e.workDate.slice(5)} · {e.name}
                </p>
                <p className="m-0 text-[12px] text-ink-muted tabular-nums">
                  출근 {e.clockIn} · 퇴근 {e.clockOut ?? '—'}
                  {e.breakMinutes != null && ` · 휴게 ${breakLabel(e.breakMinutes)}`}
                  {e.plannedStart && e.plannedEnd && ` · 계획 ${formatTimeRange(e.plannedStart, e.plannedEnd)}`}
                </p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {e.unscheduled && <Flag tone="amber">근무표 없이 출근</Flag>}
                  {e.missingClockOut && <Flag tone="rose">퇴근 누락 — 근무표는 계획값</Flag>}
                  {e.breakShort && <Flag tone="amber">법정 휴게 미달</Flag>}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTarget(e)}
                className="shrink-0 px-3 py-1.5 rounded-lg border border-hairline bg-canvas-soft text-[12px] font-semibold text-ink-secondary cursor-pointer hover:bg-rose-50 hover:text-rose-600"
              >
                기록 취소
              </button>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={!!target}
        title="출퇴근 기록을 취소할까요?"
        description={target ? `${target.name}님 ${target.workDate} 기록을 지웁니다. ${
          target.unscheduled ? '근무표 없이 출근해 생긴 근무도 함께 삭제됩니다.'
          : target.status === 'closed' ? '근무표 시간은 원래 계획값으로 돌아갑니다.'
          : '근무표는 그대로입니다.'
        } 취소하면 다시 출근할 수 있습니다.` : undefined}
        confirmLabel="기록 취소"
        danger
        busy={busy}
        dismissOnBackdrop={false}
        onConfirm={runVoid}
        onClose={() => setTarget(null)}
      />
    </section>
  )
}

function Flag({ tone, children }: { tone: 'amber' | 'rose'; children: React.ReactNode }) {
  const cls = tone === 'rose' ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-amber-50 text-amber-700 border-amber-200'
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>{children}</span>
}
