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

interface CustomDeduction {
  id: number
  label: string
  rate: number // 급여액(gross) 대비 비율 — 항상 gross 기준
}

const DEDUCTIONS: Deduction[] = [
  { key: 'employment', label: '고용보험', rate: 0.009, defaultChecked: true, base: 'gross' },
  { key: 'pension', label: '국민연금', rate: 0.045, defaultChecked: false, base: 'gross' },
  { key: 'health', label: '건강보험', rate: 0.03545, defaultChecked: false, base: 'gross' },
  { key: 'longTermCare', label: '장기요양보험', rate: 0.1295, defaultChecked: false, base: 'healthInsurance' },
]

let nextCustomId = 1

export default function PayCalculatorPanel() {
  const [grossInput, setGrossInput] = useState('')
  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(DEDUCTIONS.map(d => [d.key, d.defaultChecked])),
  )
  const [customDeductions, setCustomDeductions] = useState<CustomDeduction[]>([])
  const [newCustomLabel, setNewCustomLabel] = useState('')
  const [newCustomRate, setNewCustomRate] = useState('')
  const [copied, setCopied] = useState(false)

  const gross = Number(grossInput.replace(/[^0-9]/g, '')) || 0
  const healthInsuranceAmount = Math.round(gross * DEDUCTIONS.find(d => d.key === 'health')!.rate)

  const rows = useMemo(() => DEDUCTIONS.map(d => {
    const base = d.base === 'healthInsurance' ? healthInsuranceAmount : gross
    const amount = checked[d.key] ? Math.round(base * d.rate) : 0
    return { ...d, amount }
  }), [gross, checked, healthInsuranceAmount])

  const customRows = useMemo(() => customDeductions.map(d => ({
    ...d,
    amount: Math.round(gross * (d.rate / 100)),
  })), [customDeductions, gross])

  const totalDeduction = rows.reduce((s, r) => s + r.amount, 0) + customRows.reduce((s, r) => s + r.amount, 0)
  const netPay = gross - totalDeduction

  const handleGrossChange = (v: string) => {
    const digits = v.replace(/[^0-9]/g, '')
    setGrossInput(digits ? Number(digits).toLocaleString('ko-KR') : '')
  }

  const addCustomDeduction = () => {
    const rate = Number(newCustomRate)
    if (!newCustomLabel.trim() || isNaN(rate) || !newCustomRate.trim()) return
    setCustomDeductions(p => [...p, { id: nextCustomId++, label: newCustomLabel.trim(), rate }])
    setNewCustomLabel('')
    setNewCustomRate('')
  }

  const removeCustomDeduction = (id: number) => setCustomDeductions(p => p.filter(d => d.id !== id))

  const handleCopy = () => {
    const lines: string[] = [
      '💰 공제 계산 내역',
      '',
      `급여액: ${formatPrice(gross)}원`,
    ]
    for (const r of rows) {
      if (r.amount === 0 && !checked[r.key]) continue
      lines.push(`- ${r.label} (${(r.rate * 100).toLocaleString('ko-KR', { maximumFractionDigits: 4 })}%): -${formatPrice(r.amount)}원`)
    }
    for (const r of customRows) {
      lines.push(`- ${r.label} (${r.rate}%): -${formatPrice(r.amount)}원`)
    }
    lines.push(
      '',
      `공제 합계: -${formatPrice(totalDeduction)}원`,
      `✅ 실수령액: ${formatPrice(netPay)}원`,
    )
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
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

          {customRows.map(row => (
            <div
              key={row.id}
              className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-primary-200 bg-primary-50 group"
            >
              <span className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-ink">{row.label}</span>
                <span className="text-[11px] text-ink-faint">{row.rate}%</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="text-[13px] font-bold text-ink">-{formatPrice(row.amount)}원</span>
                <button
                  onClick={() => removeCustomDeduction(row.id)}
                  className="text-ink-faint text-[16px] bg-transparent border-none cursor-pointer hover:text-rose-500 transition opacity-0 group-hover:opacity-100 leading-none"
                >×</button>
              </span>
            </div>
          ))}

          <div className="flex gap-1.5 px-3 py-2 rounded-xl border border-dashed border-hairline bg-canvas-soft">
            <input
              type="text" value={newCustomLabel} onChange={e => setNewCustomLabel(e.target.value)}
              placeholder="항목명 (소득세, 지방소득세...)"
              className="flex-1 px-2 py-1.5 border border-hairline rounded-lg text-[11px] bg-canvas focus:outline-none focus:border-primary-700 min-w-0"
              onKeyDown={e => e.key === 'Enter' && addCustomDeduction()}
            />
            <input
              type="number" value={newCustomRate} onChange={e => setNewCustomRate(e.target.value)}
              placeholder="요율 %"
              className="w-[72px] px-2 py-1.5 border border-hairline rounded-lg text-[11px] bg-canvas focus:outline-none focus:border-primary-700"
              onKeyDown={e => e.key === 'Enter' && addCustomDeduction()}
            />
            <button
              onClick={addCustomDeduction}
              className="px-2.5 py-1.5 rounded-lg bg-primary-700 text-white text-[11px] font-bold border-none cursor-pointer hover:bg-primary-800 transition whitespace-nowrap"
            >
              + 추가
            </button>
          </div>
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
          4대보험 요율 기준 간이 계산이며, 소득세·지방소득세는 커스텀 항목으로 직접 추가해야 합니다. 실제 공제액은 소득 구간·부양가족 수 등에 따라 달라질 수 있습니다.
        </p>

        <button
          onClick={handleCopy}
          disabled={gross === 0}
          className="w-full py-3 rounded-xl border-none bg-amber-500 text-white text-[13px] font-bold cursor-pointer hover:bg-amber-600 active:bg-amber-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {copied ? '✓ 클립보드에 복사됨!' : '📋 공제 내역 복사 (카카오 / 문자 공유)'}
        </button>
      </div>
    </div>
  )
}
