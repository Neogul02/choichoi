'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchMonthlyPayroll, type PayrollRow } from '@/app/actions/payroll'
import type { StaffRole } from '@/types/database'
import { showMsg } from '@/lib/toast'
import { ROLE_LABELS } from './constants'
import PayrollDetailModal from './PayrollDetailModal'

interface Props {
  defaultRole: StaffRole
  /** 지급 완료 체크 시 퇴사 전환 — 성공 여부 반환 (좌측 직원 목록 동기화는 부모가 담당) */
  onRetire?: (staffId: number) => Promise<boolean>
}

export default function PayrollPanel({ defaultRole, onRetire }: Props) {
  const [role, setRole] = useState<StaffRole>(defaultRole)
  const [cursor, setCursor] = useState<{ y: number; m: number } | null>(null)
  const [detailTarget, setDetailTarget] = useState<PayrollRow | null>(null)
  // 급여 지급 완료 표시 — 월별로 localStorage에 보관, 체크된 행은 회색 처리
  const [paidIds, setPaidIds] = useState<Set<number>>(new Set())
  const [retireTarget, setRetireTarget] = useState<PayrollRow | null>(null)
  const [retiring, setRetiring] = useState(false)

  const paidKey = cursor ? `payroll_paid_${cursor.y}-${cursor.m}` : null
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
  const payrollQuery = useQuery<PayrollRow[]>({
    queryKey: ['payroll', role, cursor?.y, cursor?.m],
    queryFn: async () => {
      const res = await fetchMonthlyPayroll(role, cursor!.y, cursor!.m)
      return res.success && res.data ? res.data : []
    },
    enabled: cursor != null,
  })
  const rows = payrollQuery.data ?? []
  const isLoading = cursor == null || payrollQuery.isPending

  const prevMonth = () => setCursor(c => !c ? c : c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 })
  const nextMonth = () => setCursor(c => !c ? c : c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 })

  const totalHours = Math.round(rows.reduce((s, r) => s + r.totalHours, 0) * 10) / 10
  const totalPay = rows.reduce((s, r) => s + (r.totalPay ?? 0), 0)
  const hasPayRate = rows.some(r => r.totalPay != null)

  // 엑셀 한글 호환을 위해 UTF-8 BOM을 붙여 CSV 다운로드
  const handleExportCsv = () => {
    if (!cursor || rows.length === 0) return
    const esc = (v: string) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
    const lines = [
      ['이름', '전화', '근무일', '총 시간(h)', '시급(원)', '총 급여(원)'].join(','),
      ...rows.map(r => [
        esc(r.name), esc(r.phone ?? ''), String(r.days), String(r.totalHours),
        r.hourlyRate != null ? String(r.hourlyRate) : '',
        r.totalPay != null ? String(r.totalPay) : '',
      ].join(',')),
    ]
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `급여정산_${cursor.y}년${cursor.m + 1}월_${ROLE_LABELS[role]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="bg-canvas rounded-2xl border border-hairline shadow-level-1 overflow-hidden">
      {/* 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 border-b border-hairline bg-canvas-soft">
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
        <p className="text-ink-faint text-sm p-6 text-center m-0">이번 달 배정된 직원이 없습니다.</p>
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
                    </td>
                    <td className="px-2 py-2.5">
                      <div className={`font-bold text-ink ${paid ? 'line-through' : ''}`}>{row.name}</div>
                      {row.phone && <div className="text-[10px] text-ink-muted mt-0.5">{row.phone}</div>}
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
      {retireTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
          onClick={e => { if (e.target === e.currentTarget && !retiring) setRetireTarget(null) }}
        >
          <div className="bg-canvas w-full max-w-[320px] rounded-xl shadow-level-2 border border-hairline p-5">
            <h3 className="m-0 mb-1.5 text-[16px] font-bold text-ink">{retireTarget.name}님을 퇴사 상태로 변경하시겠습니까?</h3>
            <p className="m-0 mb-5 text-[13px] text-ink-muted">
              급여 지급 완료로 표시됩니다. 퇴사 처리하면 직원 목록 상태가 퇴사로 바뀌고 이후 스케줄 배정 대상에서 제외됩니다.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setRetireTarget(null)}
                disabled={retiring}
                className="flex-1 py-2.5 rounded-lg border border-hairline bg-canvas-soft text-ink-muted text-[13px] font-semibold cursor-pointer hover:bg-[#ececec] transition-colors disabled:opacity-50"
              >
                지급 완료만
              </button>
              <button
                onClick={handleRetire}
                disabled={retiring}
                className="flex-1 py-2.5 rounded-lg border-none bg-rose-500 text-white text-[13px] font-bold cursor-pointer hover:bg-rose-600 transition-colors disabled:opacity-50"
              >
                {retiring ? '처리 중...' : '퇴사 처리'}
              </button>
            </div>
          </div>
        </div>
      )}

      {detailTarget && cursor && (
        <PayrollDetailModal
          staffId={detailTarget.staffId}
          name={detailTarget.name}
          phone={detailTarget.phone}
          bankName={detailTarget.bankName}
          bankAccount={detailTarget.bankAccount}
          hourlyRate={detailTarget.hourlyRate}
          basePay={detailTarget.totalPay}
          totalHours={detailTarget.totalHours}
          year={cursor.y}
          month={cursor.m}
          onClose={() => setDetailTarget(null)}
        />
      )}
    </div>
  )
}
