'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchMonthlyPayroll, fetchPopupPayroll, type PayrollRow, type PopupPayrollResult } from '@/app/actions/payroll'
import { fetchPopupEvents } from '@/app/actions/schedule'
import type { StaffRole, PopupEvent } from '@/types/database'
import { showMsg } from '@/lib/toast'
import { formatPhoneNumber } from '@/lib/utils'
import ConfirmDialog from '@/components/ConfirmDialog'
import { ROLE_LABELS } from './constants'
import PayrollDetailModal, { type PayrollPeriod } from './PayrollDetailModal'

interface Props {
  defaultRole: StaffRole
  /** 지급 완료 체크 시 퇴사 전환 — 성공 여부 반환 (좌측 직원 목록 동기화는 부모가 담당) */
  onRetire?: (staffId: number) => Promise<boolean>
}

type ViewMode = 'month' | 'popup'

export default function PayrollPanel({ defaultRole, onRetire }: Props) {
  const [role, setRole] = useState<StaffRole>(defaultRole)
  // 월별(달력 기준) 또는 팝업별(행사 기간 기준, 월 경계를 넘어도 한 번에 정산) — 주방은 팝업이 없어 항상 월별
  const [mode, setMode] = useState<ViewMode>('month')
  const [cursor, setCursor] = useState<{ y: number; m: number } | null>(null)
  const [selectedPopupId, setSelectedPopupId] = useState<number | null>(null)
  const [detailTarget, setDetailTarget] = useState<PayrollRow | null>(null)
  // 급여 지급 완료 표시 — 월/팝업별로 localStorage에 보관, 체크된 행은 회색 처리
  const [paidIds, setPaidIds] = useState<Set<number>>(new Set())
  const [retireTarget, setRetireTarget] = useState<PayrollRow | null>(null)
  const [retiring, setRetiring] = useState(false)

  useEffect(() => {
    if (role === 'kitchen') setMode('month')
  }, [role])

  const paidKey = mode === 'month'
    ? (cursor ? `payroll_paid_${cursor.y}-${cursor.m}` : null)
    : (selectedPopupId != null ? `payroll_paid_popup_${selectedPopupId}` : null)
  useEffect(() => {
    if (!paidKey) return
    try {
      setPaidIds(new Set(JSON.parse(localStorage.getItem(paidKey) ?? '[]') as number[]))
    } catch {
      setPaidIds(new Set())
    }
  }, [paidKey])

  const setPaid = (staffId: number, paid: boolean) => {
    const next = new Set(paidIds)
    if (paid) next.add(staffId)
    else next.delete(staffId)
    setPaidIds(next)
    if (paidKey) try { localStorage.setItem(paidKey, JSON.stringify([...next])) } catch { /* ignore */ }
  }

  const handleRetire = async () => {
    if (!retireTarget || !onRetire) return
    setRetiring(true)
    const ok = await onRetire(retireTarget.staffId)
    setRetiring(false)
    if (ok) showMsg(`${retireTarget.name}님이 퇴사 처리되었습니다`)
    setRetireTarget(null)
  }

  useEffect(() => {
    try {
      const saved = localStorage.getItem('payroll_ym')
      if (saved) {
        const { y, m } = JSON.parse(saved) as { y: number; m: number }
        setCursor({ y, m })
        return
      }
    } catch { /* ignore */ }
    const now = new Date()
    setCursor({ y: now.getFullYear(), m: now.getMonth() })
  }, [])

  useEffect(() => {
    if (cursor) localStorage.setItem('payroll_ym', JSON.stringify(cursor))
  }, [cursor])

  useEffect(() => {
    setRole(defaultRole)
  }, [defaultRole])

  // react-query 캐시 — 탭을 떠났다 돌아와도 같은 월·역할이면 재조회 없이 즉시 표시 (staleTime 5분 전역 기본값)
  const monthlyQuery = useQuery<PayrollRow[]>({
    queryKey: ['payroll', role, cursor?.y, cursor?.m],
    queryFn: async () => {
      const res = await fetchMonthlyPayroll(role, cursor!.y, cursor!.m)
      return res.success && res.data ? res.data : []
    },
    enabled: mode === 'month' && cursor != null,
  })

  const popupsQuery = useQuery<PopupEvent[]>({
    queryKey: ['popupEventsForPayroll'],
    queryFn: async () => {
      const res = await fetchPopupEvents()
      return res.success && res.data ? res.data : []
    },
    enabled: mode === 'popup',
  })

  // 팝업별 모드 진입 시 가장 최근 팝업을 기본 선택
  useEffect(() => {
    if (mode === 'popup' && selectedPopupId == null && popupsQuery.data && popupsQuery.data.length > 0) {
      setSelectedPopupId(popupsQuery.data[0].id)
    }
  }, [mode, selectedPopupId, popupsQuery.data])

  const popupQuery = useQuery<PopupPayrollResult | null>({
    queryKey: ['payroll-popup', selectedPopupId],
    queryFn: async () => {
      const res = await fetchPopupPayroll(selectedPopupId!)
      return res.success && res.data ? res.data : null
    },
    enabled: mode === 'popup' && selectedPopupId != null,
  })

  const rows = mode === 'month' ? (monthlyQuery.data ?? []) : (popupQuery.data?.rows ?? [])
  const isLoading = mode === 'month'
    ? (cursor == null || monthlyQuery.isPending)
    : (selectedPopupId == null || popupQuery.isPending)

  const prevMonth = () => setCursor(c => !c ? c : c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 })
  const nextMonth = () => setCursor(c => !c ? c : c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 })

  const totalHours = Math.round(rows.reduce((s, r) => s + r.totalHours, 0) * 10) / 10
  const totalPay = rows.reduce((s, r) => s + (r.totalPay ?? 0), 0)
  const hasPayRate = rows.some(r => r.totalPay != null)

  const periodLabel = mode === 'month'
    ? (cursor ? `${cursor.y}년${cursor.m + 1}월` : '')
    : (popupQuery.data?.popup.name ?? '')

  // 엑셀 한글 호환을 위해 UTF-8 BOM을 붙여 CSV 다운로드
  const handleExportCsv = () => {
    if (!periodLabel || rows.length === 0) return
    const esc = (v: string) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
    const lines = [
      ['이름', '전화', '근무일', '총 시간(h)', '시급(원)', '총 급여(원)'].join(','),
      ...rows.map(r => [
        esc(r.name), esc(r.phone ?? ''), String(r.days), String(r.totalHours),
        r.hourlyRate != null ? String(r.hourlyRate) : '',
        r.totalPay != null ? String(r.totalPay) : '',
      ].join(',')),
    ]
    const bom = String.fromCharCode(0xFEFF)
    const blob = new Blob([bom + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `급여정산_${periodLabel}_${ROLE_LABELS[role]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const detailPeriod: PayrollPeriod | null = mode === 'month'
    ? (cursor ? { type: 'month', year: cursor.y, month: cursor.m } : null)
    : (popupQuery.data ? { type: 'popup', popupId: popupQuery.data.popup.id, popupName: popupQuery.data.popup.name, startDate: popupQuery.data.popup.startDate, endDate: popupQuery.data.popup.endDate } : null)

  return (
    <div className="bg-canvas rounded-2xl border border-hairline shadow-level-1 overflow-hidden">
      {/* 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 border-b border-hairline bg-canvas-soft">
        {mode === 'month' ? (
          <div className="flex items-center gap-1.5">
            <button
              onClick={prevMonth}
              className="w-7 h-7 rounded-lg bg-canvas border border-hairline text-ink-muted hover:bg-[#ececeb] text-base cursor-pointer flex items-center justify-center transition"
            >‹</button>
            <span className="text-[13px] font-bold text-ink min-w-[90px] text-center">
              {cursor ? `${cursor.y}년 ${cursor.m + 1}월` : '—'}
            </span>
            <button
              onClick={nextMonth}
              className="w-7 h-7 rounded-lg bg-canvas border border-hairline text-ink-muted hover:bg-[#ececeb] text-base cursor-pointer flex items-center justify-center transition"
            >›</button>
          </div>
        ) : (
          <select
            value={selectedPopupId ?? ''}
            onChange={e => setSelectedPopupId(e.target.value ? Number(e.target.value) : null)}
            className="text-[13px] font-bold text-ink px-2.5 py-1.5 rounded-lg border border-hairline bg-canvas cursor-pointer focus:outline-none focus:border-primary-700 max-w-[220px]"
          >
            {(popupsQuery.data ?? []).length === 0 && <option value="">팝업 없음</option>}
            {(popupsQuery.data ?? []).map(p => (
              <option key={p.id} value={p.id}>{p.name} ({p.start_date.slice(5)}~{p.end_date.slice(5)})</option>
            ))}
          </select>
        )}
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl overflow-hidden border border-hairline bg-canvas">
            {(['kitchen', 'cashier'] as StaffRole[]).map(r => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className={`px-3 py-1.5 text-[12px] font-bold border-none cursor-pointer transition ${
                  role === r ? 'bg-ink text-white' : 'bg-canvas text-ink-muted hover:bg-canvas-soft'
                }`}
              >
                {ROLE_LABELS[r]}
              </button>
            ))}
          </div>
          {/* 주방은 팝업에 속하지 않으므로 캐셔일 때만 팝업별 정산 옵션 노출 */}
          {role === 'cashier' && (
            <div className="flex rounded-xl overflow-hidden border border-hairline bg-canvas">
              {([['month', '월별'], ['popup', '팝업별']] as [ViewMode, string][]).map(([m, label]) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-3 py-1.5 text-[12px] font-bold border-none cursor-pointer transition ${
                    mode === m ? 'bg-primary-700 text-white' : 'bg-canvas text-ink-muted hover:bg-canvas-soft'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={handleExportCsv}
            disabled={rows.length === 0}
            className="px-3 py-1.5 rounded-xl bg-canvas border border-hairline text-[12px] font-bold text-ink-muted cursor-pointer hover:bg-[#ececeb] transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            CSV
          </button>
        </div>
      </div>

      {/* 본문 */}
      {isLoading ? (
        <p className="text-ink-faint text-sm p-6 text-center m-0">불러오는 중...</p>
      ) : rows.length === 0 ? (
        <p className="text-ink-faint text-sm p-6 text-center m-0">
          {mode === 'month' ? '이번 달 배정된 직원이 없습니다.' : '이 팝업에 배정된 직원이 없습니다.'}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-hairline bg-canvas-soft">
                  <th className="w-8 px-2 py-2 font-semibold text-ink-muted text-center" title="급여 지급 완료">✓</th>
                  <th className="text-left px-2 py-2 font-semibold text-ink-muted">이름</th>
                  <th className="text-center px-3 py-2 font-semibold text-ink-muted">근무일</th>
                  <th className="text-center px-3 py-2 font-semibold text-ink-muted">총 시간</th>
                  <th className="hidden md:table-cell text-right px-3 py-2 font-semibold text-ink-muted">시급</th>
                  <th className="text-right px-4 py-2 font-semibold text-ink-muted">총 급여</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const paid = paidIds.has(row.staffId)
                  return (
                  <tr
                    key={row.staffId}
                    onClick={() => setDetailTarget(row)}
                    className={`transition cursor-pointer ${paid ? 'bg-canvas-soft opacity-60' : 'hover:bg-canvas-soft'} ${i !== rows.length - 1 ? 'border-b border-hairline' : ''}`}
                  >
                    <td className="px-2 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                      <label className="inline-flex items-center justify-center p-3 -m-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={paid}
                          onChange={e => {
                            setPaid(row.staffId, e.target.checked)
                            if (e.target.checked && onRetire) setRetireTarget(row)
                          }}
                          title="급여 지급 완료"
                          className="w-4 h-4 accent-primary-700 cursor-pointer align-middle"
                        />
                      </label>
                    </td>
                    <td className="px-2 py-2.5">
                      <div className={`font-bold text-ink ${paid ? 'line-through' : ''}`}>{row.name}</div>
                      {row.phone && (
                        <div
                          onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(formatPhoneNumber(row.phone!)); showMsg('전화번호 복사됨') }}
                          title="클릭해서 복사"
                          className="text-[10px] text-ink-muted mt-0.5 w-fit cursor-pointer hover:underline"
                        >
                          {formatPhoneNumber(row.phone)}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center text-ink">{row.days}일</td>
                    <td className="px-3 py-2.5 text-center text-ink font-semibold">{row.totalHours}h</td>
                    <td className="hidden md:table-cell px-3 py-2.5 text-right text-ink-muted">
                      {row.hourlyRate != null
                        ? `${row.hourlyRate.toLocaleString('ko-KR')}원`
                        : <span className="text-ink-faint text-[11px]">미설정</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold text-ink">
                      {row.totalPay != null
                        ? `${row.totalPay.toLocaleString('ko-KR')}원`
                        : <span className="text-ink-faint text-[11px] font-normal">—</span>}
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* 합계 */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-hairline bg-canvas-soft">
            <span className="text-[12px] text-ink-muted">
              총 <span className="font-semibold text-ink">{rows.length}명</span>
              {' · '}
              <span className="font-semibold text-ink">{totalHours}h</span>
              {paidIds.size > 0 && (
                <>
                  {' · '}지급 완료 <span className="font-semibold text-emerald-600">{rows.filter(r => paidIds.has(r.staffId)).length}명</span>
                </>
              )}
            </span>
            <span className="text-[15px] font-extrabold text-ink">
              {hasPayRate ? `${totalPay.toLocaleString('ko-KR')}원` : '—'}
            </span>
          </div>
        </>
      )}

      {/* 지급 완료 체크 시 퇴사 전환 확인 팝업 — 취소해도 지급 완료 표시는 유지 */}
      <ConfirmDialog
        open={retireTarget != null}
        title={`${retireTarget?.name}님을 퇴사 상태로 변경하시겠습니까?`}
        description="급여 지급 완료로 표시됩니다. 퇴사 처리하면 직원 목록 상태가 퇴사로 바뀌고 이후 스케줄 배정 대상에서 제외됩니다."
        cancelLabel="지급 완료만"
        confirmLabel="퇴사 처리"
        danger
        busy={retiring}
        onConfirm={handleRetire}
        onClose={() => setRetireTarget(null)}
      />

      {detailTarget && detailPeriod && (
        <PayrollDetailModal
          staffId={detailTarget.staffId}
          name={detailTarget.name}
          phone={detailTarget.phone}
          bankName={detailTarget.bankName}
          bankAccount={detailTarget.bankAccount}
          hourlyRate={detailTarget.hourlyRate}
          period={detailPeriod}
          onClose={() => setDetailTarget(null)}
        />
      )}
    </div>
  )
}
