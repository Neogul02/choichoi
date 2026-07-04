'use client'

import { useEffect, useState } from 'react'
import { fetchMonthlyPayroll, type PayrollRow } from '@/app/actions/payroll'
import type { StaffRole } from '@/types/database'
import { ROLE_LABELS } from './constants'
import PayrollDetailModal from './PayrollDetailModal'

interface Props {
  defaultRole: StaffRole
}

export default function PayrollPanel({ defaultRole }: Props) {
  const [role, setRole] = useState<StaffRole>(defaultRole)
  const [cursor, setCursor] = useState<{ y: number; m: number } | null>(null)
  const [rows, setRows] = useState<PayrollRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [detailTarget, setDetailTarget] = useState<PayrollRow | null>(null)

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

  useEffect(() => {
    if (!cursor) return
    setIsLoading(true)
    fetchMonthlyPayroll(role, cursor.y, cursor.m).then(res => {
      setRows(res.success && res.data ? res.data : [])
      setIsLoading(false)
    })
  }, [role, cursor])

  const prevMonth = () => setCursor(c => !c ? c : c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 })
  const nextMonth = () => setCursor(c => !c ? c : c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 })

  const totalHours = Math.round(rows.reduce((s, r) => s + r.totalHours, 0) * 10) / 10
  const totalPay = rows.reduce((s, r) => s + (r.totalPay ?? 0), 0)
  const hasPayRate = rows.some(r => r.totalPay != null)

  return (
    <div className="bg-canvas rounded-xl border border-hairline shadow-level-1 overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-hairline bg-canvas-soft">
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
                  <th className="text-left px-4 py-2 font-semibold text-ink-muted">이름</th>
                  <th className="text-center px-3 py-2 font-semibold text-ink-muted">근무일</th>
                  <th className="text-center px-3 py-2 font-semibold text-ink-muted">총 시간</th>
                  <th className="text-right px-3 py-2 font-semibold text-ink-muted">시급</th>
                  <th className="text-right px-4 py-2 font-semibold text-ink-muted">총 급여</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={row.staffId}
                    onClick={() => setDetailTarget(row)}
                    className={`hover:bg-canvas-soft transition cursor-pointer ${i !== rows.length - 1 ? 'border-b border-hairline' : ''}`}
                  >
                    <td className="px-4 py-2.5">
                      <div className="font-bold text-ink">{row.name}</div>
                      {row.phone && <div className="text-[10px] text-ink-muted mt-0.5">{row.phone}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-center text-ink">{row.days}일</td>
                    <td className="px-3 py-2.5 text-center text-ink font-semibold">{row.totalHours}h</td>
                    <td className="px-3 py-2.5 text-right text-ink-muted">
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
                ))}
              </tbody>
            </table>
          </div>

          {/* 합계 */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-hairline bg-canvas-soft">
            <span className="text-[12px] text-ink-muted">
              총 <span className="font-semibold text-ink">{rows.length}명</span>
              {' · '}
              <span className="font-semibold text-ink">{totalHours}h</span>
            </span>
            <span className="text-[15px] font-extrabold text-ink">
              {hasPayRate ? `${totalPay.toLocaleString('ko-KR')}원` : '—'}
            </span>
          </div>
        </>
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
