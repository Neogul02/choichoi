'use client'

import { useMemo, useState } from 'react'
import { formatPrice } from '@/lib/utils'

interface Deduction {
  key: string
  label: string
  rate: number // 급여액 대비 비율
  defaultChecked: boolean
  base?: 'gross' | 'healthInsurance' // 장기요양보험은 건강보험료 기준으로 계산
}

const DEDUCTIONS: Deduction[] = [
  { key: 'employment', label: '고용보험', rate: 0.009, defaultChecked: true, base: 'gross' },
  { key: 'pension', label: '국민연금', rate: 0.045, defaultChecked: false, base: 'gross' },
  { key: 'health', label: '건강보험', rate: 0.03545, defaultChecked: false, base: 'gross' },
  { key: 'longTermCare', label: '장기요양보험', rate: 0.1295, defaultChecked: false, base: 'healthInsurance' },
]

export default function PayCalculatorPanel() {
  const [grossInput, setGrossInput] = useState('')
  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(DEDUCTIONS.map(d => [d.key, d.defaultChecked])),
  )

  const gross = Number(grossInput.replace(/[^0-9]/g, '')) || 0
  const healthInsuranceAmount = Math.round(gross * DEDUCTIONS.find(d => d.key === 'health')!.rate)

  const rows = useMemo(() => DEDUCTIONS.map(d => {
    const base = d.base === 'healthInsurance' ? healthInsuranceAmount : gross
    const amount = checked[d.key] ? Math.round(base * d.rate) : 0
    return { ...d, amount }
  }), [gross, checked, healthInsuranceAmount])

  const totalDeduction = rows.reduce((s, r) => s + r.amount, 0)
  const netPay = gross - totalDeduction

  const handleGrossChange = (v: string) => {
    const digits = v.replace(/[^0-9]/g, '')
    setGrossInput(digits ? Number(digits).toLocaleString('ko-KR') : '')
  }

  return (
    <div className="bg-canvas rounded-2xl border border-hairline shadow-level-1 overflow-hidden">
      <div className="px-4 py-3 border-b border-hairline bg-canvas-soft">
        <span className="text-[13px] font-bold text-ink">공제 계산기</span>
      </div>

      <div className="p-4 flex flex-col gap-4">
        <div>
          <label className="block text-[12px] font-semibold text-ink-muted mb-1.5">급여액 (원)</label>
          <input
            type="text"
            inputMode="numeric"
            value={grossInput}
            onChange={e => handleGrossChange(e.target.value)}
            placeholder="예: 2,000,000"
            className="w-full px-3 py-2 border border-hairline rounded-xl text-[15px] font-bold text-right bg-canvas focus:outline-none focus:border-primary-700"
          />
        </div>

        <div className="flex flex-col gap-2">
          {rows.map(row => (
            <label
              key={row.key}
              className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-hairline bg-canvas-soft cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={checked[row.key]}
                  onChange={e => setChecked(p => ({ ...p, [row.key]: e.target.checked }))}
                  className="w-4 h-4 accent-primary-700 cursor-pointer"
                />
                <span className="text-[13px] font-semibold text-ink">{row.label}</span>
                <span className="text-[11px] text-ink-faint">
                  {row.base === 'healthInsurance' ? '건강보험료의 ' : ''}{(row.rate * 100).toLocaleString('ko-KR', { maximumFractionDigits: 4 })}%
                </span>
              </span>
              <span className={`text-[13px] font-bold ${checked[row.key] ? 'text-ink' : 'text-ink-faint'}`}>
                {checked[row.key] ? `-${formatPrice(row.amount)}원` : '—'}
              </span>
            </label>
          ))}
        </div>

        <div className="flex flex-col gap-1.5 pt-3 border-t border-hairline">
          <div className="flex items-center justify-between text-[12px] text-ink-muted">
            <span>급여액</span>
            <span>{formatPrice(gross)}원</span>
          </div>
          <div className="flex items-center justify-between text-[12px] text-ink-muted">
            <span>공제 합계</span>
            <span>-{formatPrice(totalDeduction)}원</span>
          </div>
          <div className="flex items-center justify-between text-[15px] font-extrabold text-ink pt-1">
            <span>실수령액</span>
            <span>{formatPrice(netPay)}원</span>
          </div>
        </div>

        <p className="text-[11px] text-ink-faint leading-relaxed m-0">
          4대보험 요율 기준 간이 계산이며, 소득세·지방소득세는 포함되지 않습니다. 실제 공제액은 소득 구간·부양가족 수 등에 따라 달라질 수 있습니다.
        </p>
      </div>
    </div>
  )
}
