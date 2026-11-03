'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchMonthlyPayroll, fetchPopupPayroll, fetchPayrollSettlement, setPayrollPaid,
  fetchDefaultDeductions, addPayrollAdjustment, fetchPensionStatus, fetchInsuranceReport,
  type PayrollRow, type PopupPayrollResult, type PayrollSettlement, type PensionRow, type InsuranceReportRow,
} from '@/app/actions/payroll'
import { fetchPopupEvents } from '@/app/actions/schedule'
import { fetchMissingClockIns, type MissingClockIn } from '@/app/actions/attendance'
import type { StaffRole, PopupEvent } from '@/types/database'
import { showMsg } from '@/lib/toast'
import { formatPhoneNumber } from '@/lib/utils'
import { phoneMatches } from '@/lib/phone'
import { DAY_NAMES } from '@/lib/staffing'
import { pensionReportDeadline } from '@/lib/nationalPension'
import ConfirmDialog from '@/components/ConfirmDialog'
import { DEFAULT_DEDUCTIONS, isSameDeduction, quickDeductionAmount, type DefaultDeduction } from '@/lib/payroll-deductions'
import CopyText, { copyToClipboard } from '@/components/CopyText'
import { ROLE_LABELS } from './constants'
import PayrollDetailModal, { type PayrollPeriod } from './PayrollDetailModal'

// 근로 자료 미리보기 창은 react-pdf·exceljs를 끌고 오므로 버튼을 누를 때만 불러온다
const InsuranceExportModal = dynamic(() => import('./InsuranceExportModal'), { ssr: false })

interface Props {
  defaultRole: StaffRole
  /** 지급 완료 체크 시 퇴사 전환 — 성공 여부 반환 (좌측 직원 목록 동기화는 부모가 담당) */
  onRetire?: (staffId: number) => Promise<boolean>
}

type ViewMode = 'month' | 'popup'
type SortKey = 'name' | 'days' | 'totalHours' | 'hourlyRate' | 'totalPay'

const SORT_LABELS: Record<SortKey, string> = {
  name: '이름', days: '근무일', totalHours: '총 시간', hourlyRate: '시급', totalPay: '총 급여',
}

export default function PayrollPanel({ defaultRole, onRetire }: Props) {
  const [role, setRole] = useState<StaffRole>(defaultRole)
  // 월별(달력 기준) 또는 팝업별(행사 기간 기준, 월 경계를 넘어도 한 번에 정산) — 주방은 팝업이 없어 항상 월별
  const [mode, setMode] = useState<ViewMode>('month')
  const [cursor, setCursor] = useState<{ y: number; m: number } | null>(null)
  const [selectedPopupId, setSelectedPopupId] = useState<number | null>(null)
  const [detailTarget, setDetailTarget] = useState<PayrollRow | null>(null)
  const [retireTarget, setRetireTarget] = useState<PayrollRow | null>(null)
  const [retiring, setRetiring] = useState(false)
  // 이름·전화 검색 + 컬럼 정렬 — 인원이 늘면 특정 직원을 찾기 어려웠다
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' })
  const queryClient = useQueryClient()

  useEffect(() => {
    if (role === 'kitchen') setMode('month')
  }, [role])

  // 지급 완료·조정 항목은 DB에 보관한다 — localStorage에만 두면 기기를 바꾸면 사라지고
  // 다른 관리자에게는 보이지 않았다.
  const periodKey = mode === 'month'
    ? (cursor ? `month:${cursor.y}-${cursor.m}` : null)
    : (selectedPopupId != null ? `popup:${selectedPopupId}` : null)

  const settlementQuery = useQuery<PayrollSettlement>({
    queryKey: ['payroll-settlement', periodKey],
    queryFn: async () => {
      const res = await fetchPayrollSettlement(periodKey!)
      return res.success && res.data ? res.data : { paidStaffIds: [], adjustments: {} }
    },
    enabled: periodKey != null,
  })
  const settlement = settlementQuery.data
  const paidIds = useMemo(() => new Set(settlement?.paidStaffIds ?? []), [settlement])
  const adjustTotals = useMemo(() => {
    const map = new Map<number, number>()
    for (const [staffId, list] of Object.entries(settlement?.adjustments ?? {})) {
      map.set(Number(staffId), list.reduce((sum, a) => sum + a.amount, 0))
    }
    return map
  }, [settlement])

  // 예전 localStorage 표시를 DB로 한 번만 옮긴다 — 이미 체크해둔 이번 달 표시가 사라지지 않도록
  const legacyKey = mode === 'month'
    ? (cursor ? `payroll_paid_${cursor.y}-${cursor.m}` : null)
    : (selectedPopupId != null ? `payroll_paid_popup_${selectedPopupId}` : null)
  useEffect(() => {
    if (!legacyKey || !periodKey || !settlementQuery.isSuccess) return
    let legacy: number[] = []
    try { legacy = JSON.parse(localStorage.getItem(legacyKey) ?? '[]') as number[] } catch { return }
    if (!Array.isArray(legacy) || legacy.length === 0) return
    const missing = legacy.filter(id => !paidIds.has(id))
    Promise.all(missing.map(id => setPayrollPaid(periodKey, id, true)))
      .then(() => {
        try { localStorage.removeItem(legacyKey) } catch { /* ignore */ }
        if (missing.length > 0) queryClient.invalidateQueries({ queryKey: ['payroll-settlement', periodKey] })
      })
      .catch(() => { /* 이전 표시 이전 실패는 정산을 막지 않는다 */ })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legacyKey, periodKey, settlementQuery.isSuccess])

  const setPaid = async (staffId: number, paid: boolean) => {
    if (!periodKey) return
    const key = ['payroll-settlement', periodKey]
    const prev = queryClient.getQueryData<PayrollSettlement>(key)
    // 낙관적 반영 — 체크 반응이 서버 왕복을 기다리지 않게
    queryClient.setQueryData<PayrollSettlement>(key, old => {
      const base = old ?? { paidStaffIds: [], adjustments: {} }
      return {
        ...base,
        paidStaffIds: paid
          ? [...new Set([...base.paidStaffIds, staffId])]
          : base.paidStaffIds.filter(id => id !== staffId),
      }
    })
    const res = await setPayrollPaid(periodKey, staffId, paid)
    if (!res.success) {
      queryClient.setQueryData(key, prev)
      showMsg(`오류: ${res.error}`)
    }
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

  // 주방은 출근부로 실측한다 — 출근을 안 찍은 날은 급여가 계획값으로 잡혀 있으므로 지급 전에 알린다
  const missingQuery = useQuery<MissingClockIn[]>({
    queryKey: ['payrollMissingClockIns', cursor?.y, cursor?.m],
    queryFn: async () => {
      const pad = (n: number) => String(n).padStart(2, '0')
      const { y, m } = cursor!
      const from = `${y}-${pad(m + 1)}-01`
      const to = `${y}-${pad(m + 1)}-${pad(new Date(y, m + 1, 0).getDate())}`
      const res = await fetchMissingClockIns(from, to)
      return res.success && res.data ? res.data : []
    },
    enabled: mode === 'month' && role === 'kitchen' && cursor != null,
  })
  const missingByStaff = useMemo(() => {
    const map = new Map<number, MissingClockIn[]>()
    if (mode !== 'month' || role !== 'kitchen') return map
    for (const m of missingQuery.data ?? []) {
      if (!map.has(m.staffId)) map.set(m.staffId, [])
      map.get(m.staffId)!.push(m)
    }
    for (const list of map.values()) list.sort((a, b) => a.workDate.localeCompare(b.workDate))
    return map
  }, [missingQuery.data, mode, role])

  // 국민연금 가입 대상 — 사람 단위(주방·캐셔 합산) 판정이라 역할 탭과 무관하게 같은 달이면 같은 결과다
  const pensionQuery = useQuery<Record<number, PensionRow>>({
    queryKey: ['payroll-pension', cursor?.y, cursor?.m],
    queryFn: async () => {
      const res = await fetchPensionStatus(cursor!.y, cursor!.m)
      if (!res.success) throw new Error(res.error || '국민연금 판정 조회 실패')
      return res.data ?? {}
    },
    enabled: mode === 'month' && cursor != null,
  })
  const pension = mode === 'month' ? pensionQuery.data ?? null : null

  const defaultsQuery = useQuery<Record<number, DefaultDeduction>>({
    queryKey: ['payroll-default-deductions'],
    queryFn: async () => {
      const res = await fetchDefaultDeductions()
      return res.success && res.data ? res.data : {}
    },
  })
  const defaults = defaultsQuery.data ?? {}

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

  const monthlyRows = monthlyQuery.data
  const popupRows = popupQuery.data?.rows
  const allRows = useMemo(
    () => mode === 'month' ? (monthlyRows ?? []) : (popupRows ?? []),
    [mode, monthlyRows, popupRows],
  )

  // 조정 항목(식대·공제 등)이 있으면 목록의 총 급여도 실제 지급액으로 보이게 한다 —
  // 상세 모달을 열어야만 최종 금액을 알 수 있던 문제 해결
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = q === ''
      ? allRows
      : allRows.filter(r => r.name.toLowerCase().includes(q) || phoneMatches(r.phone, q))
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      if (sort.key === 'name') return a.name.localeCompare(b.name, 'ko') * dir
      const av = a[sort.key] ?? -1
      const bv = b[sort.key] ?? -1
      return av === bv ? a.name.localeCompare(b.name, 'ko') : (av - bv) * dir
    })
  }, [allRows, search, sort])

  const finalPayOf = (r: PayrollRow) => r.totalPay == null ? null : r.totalPay + (adjustTotals.get(r.staffId) ?? 0)

  // 기본 공제를 정해둔 직원 중 이번 구간에 아직 안 넣었고 지급 전인 사람 — 기본급(시간×시급) 기준으로 한 번에 넣는다
  // 직원 기본 공제 + 이 달 국민연금·건강보험 가입 대상이면 국민연금·건강보험·장기요양 — 이미 넣은 항목(같은 종류)·지급 완료한 직원은 건너뛴다.
  // 4대보험은 서버가 사람 단위(주방·캐셔 합산)로 한 번 계산해 프로필별로 나눈 금액을 쓴다(fetchPensionStatus deductions).
  const pendingDefaults = allRows.flatMap(r => {
    if (r.totalPay == null || r.totalPay <= 0 || paidIds.has(r.staffId)) return []
    const saved = settlement?.adjustments[r.staffId] ?? []
    const items: { label: string; amount: number }[] = []
    if (defaults[r.staffId]) {
      const label = DEFAULT_DEDUCTIONS[defaults[r.staffId]]
      items.push({ label, amount: quickDeductionAmount(label, r.totalPay)! })
    }
    if (pension?.[r.staffId]?.status === 'eligible') items.push(...pension[r.staffId].deductions)
    return items
      .filter(d => d.amount !== 0 && !saved.some(a => isSameDeduction(a.label, d.label)))
      .map(d => ({ row: r, ...d }))
  })
  const [applyingDefaults, setApplyingDefaults] = useState(false)
  // 세무사에게 보내는 월별 4대보험 자료 — 역할 탭과 무관하게 그 달 일한 모든 사람(주방·캐셔 합산)
  const [exportingInsurance, setExportingInsurance] = useState<'excel' | 'pdf' | null>(null)
  const [exportTarget, setExportTarget] = useState<{ kind: 'excel' | 'pdf'; rows: InsuranceReportRow[]; y: number; m: number } | null>(null)
  const handleExportInsurance = async (kind: 'excel' | 'pdf') => {
    if (!cursor) return
    setExportingInsurance(kind)
    try {
      const res = await fetchInsuranceReport(cursor.y, cursor.m)
      if (!res.success || !res.data) { showMsg(`오류: ${res.error}`); return }
      if (res.data.length === 0) { showMsg('이 달 근무 기록이 없습니다'); return }
      // 바로 내려받지 않고 미리보기 창에서 넣을 사람을 고른다(월 보수 50만 원 이하는 처음부터 빠져 있다)
      setExportTarget({ kind, rows: res.data, y: cursor.y, m: cursor.m })
    } catch (e) {
      showMsg(`근로 자료를 불러오지 못했습니다: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setExportingInsurance(null)
    }
  }
  const applyDefaults = async () => {
    if (!periodKey || pendingDefaults.length === 0) return
    setApplyingDefaults(true)
    let failed = 0
    for (const p of pendingDefaults) {
      const res = await addPayrollAdjustment(periodKey, p.row.staffId, p.label, p.amount, false)
      if (!res.success) failed += 1
    }
    setApplyingDefaults(false)
    await queryClient.invalidateQueries({ queryKey: ['payroll-settlement', periodKey] })
    showMsg(failed === 0
      ? `기본 공제 ${pendingDefaults.length}건을 넣었습니다`
      : `${pendingDefaults.length - failed}건 적용, ${failed}건 실패 — 다시 시도해주세요`)
  }

  const toggleSort = (key: SortKey) =>
    setSort(p => p.key === key ? { key, dir: p.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' })

  const isLoading = mode === 'month'
    ? (cursor == null || monthlyQuery.isPending)
    : (selectedPopupId == null || popupQuery.isPending)

  const prevMonth = () => setCursor(c => !c ? c : c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 })
  const nextMonth = () => setCursor(c => !c ? c : c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 })

  const totalHours = Math.round(rows.reduce((s, r) => s + r.totalHours, 0) * 10) / 10
  const totalPay = rows.reduce((s, r) => s + (finalPayOf(r) ?? 0), 0)
  const hasPayRate = rows.some(r => r.totalPay != null)

  const periodLabel = mode === 'month'
    ? (cursor ? `${cursor.y}년${cursor.m + 1}월` : '')
    : (popupQuery.data?.popup.name ?? '')

  // 엑셀 한글 호환을 위해 UTF-8 BOM을 붙여 CSV 다운로드
  const handleExportCsv = () => {
    if (!periodLabel || rows.length === 0) return
    const esc = (v: string) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
    const lines = [
      ['이름', '전화', '근무일', '총 시간(h)', '시급(원)', '기본급(원)', '조정(원)', '지급액(원)'].join(','),
      ...rows.map(r => [
        esc(r.name), esc(r.phone ?? ''), String(r.days), String(r.totalHours),
        r.hourlyRate != null ? String(r.hourlyRate) : '',
        r.totalPay != null ? String(r.totalPay) : '',
        String(adjustTotals.get(r.staffId) ?? 0),
        finalPayOf(r) != null ? String(finalPayOf(r)) : '',
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

  // 엑셀·구글시트에 바로 붙여넣을 수 있게 탭 구분 텍스트로 표 전체를 클립보드에 복사
  const handleCopyTable = async () => {
    if (rows.length === 0) return
    const lines = [
      ['이름', '전화', '은행', '계좌', '근무일', '총 시간(h)', '시급', '기본급', '조정', '지급액'].join('\t'),
      ...rows.map(r => [
        r.name, r.phone ? formatPhoneNumber(r.phone) : '', r.bankName ?? '', r.bankAccount ?? '',
        String(r.days), String(r.totalHours),
        r.hourlyRate != null ? String(r.hourlyRate) : '',
        r.totalPay != null ? String(r.totalPay) : '',
        String(adjustTotals.get(r.staffId) ?? 0),
        finalPayOf(r) != null ? String(finalPayOf(r)) : '',
      ].join('\t')),
    ]
    if (await copyToClipboard(lines.join('\n'))) showMsg(`${rows.length}명 표 복사됨 (엑셀에 붙여넣기)`)
    else showMsg('복사에 실패했습니다. CSV 내려받기를 이용해주세요')
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
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl overflow-hidden border border-hairline bg-canvas shrink-0">
            {(['kitchen', 'cashier'] as StaffRole[]).map(r => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className={`px-3 py-1.5 text-[12px] font-bold border-none cursor-pointer transition whitespace-nowrap ${
                  role === r ? 'bg-ink text-white' : 'bg-canvas text-ink-muted hover:bg-canvas-soft'
                }`}
              >
                {ROLE_LABELS[r]}
              </button>
            ))}
          </div>
          {/* 주방은 팝업에 속하지 않으므로 캐셔일 때만 팝업별 정산 옵션 노출 */}
          {role === 'cashier' && (
            <div className="flex rounded-xl overflow-hidden border border-hairline bg-canvas shrink-0">
              {([['month', '월별'], ['popup', '팝업별']] as [ViewMode, string][]).map(([m, label]) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-3 py-1.5 text-[12px] font-bold border-none cursor-pointer transition whitespace-nowrap ${
                    mode === m ? 'bg-primary-700 text-white' : 'bg-canvas text-ink-muted hover:bg-canvas-soft'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={handleCopyTable}
            disabled={rows.length === 0}
            title="표 전체를 탭 구분 텍스트로 복사 — 엑셀/구글시트에 그대로 붙여넣기"
            className="px-3 py-1.5 rounded-xl bg-canvas border border-hairline text-[12px] font-bold text-ink-muted cursor-pointer hover:bg-[#ececeb] transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            표 복사
          </button>
          <button
            onClick={handleExportCsv}
            disabled={rows.length === 0}
            className="shrink-0 px-3 py-1.5 rounded-xl bg-canvas border border-hairline text-[12px] font-bold text-ink-muted cursor-pointer hover:bg-[#ececeb] transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            CSV
          </button>
          {mode === 'month' && (
            <>
              <button
                onClick={() => handleExportInsurance('excel')}
                disabled={exportingInsurance != null || cursor == null}
                title="세무사 전달용 — 그 달 일한 모든 직원(주방·캐셔)의 1~31일 근무 표시, 근로일수·시간·보수, 국민연금·건강보험 가입 대상 명단(주민번호 포함)"
                className="shrink-0 px-3 py-1.5 rounded-xl bg-canvas border border-hairline text-[12px] font-bold text-ink-muted cursor-pointer hover:bg-[#ececeb] transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {exportingInsurance === 'excel' ? '불러오는 중…' : '4대보험 자료(엑셀)'}
              </button>
              <button
                onClick={() => handleExportInsurance('pdf')}
                disabled={exportingInsurance != null || cursor == null}
                title="고용·산재 근로내용 확인신고서(일용근로자용) 서식 그대로 — 한 장에 4명, 그 달 일한 모든 직원(주민번호 포함)"
                className="shrink-0 px-3 py-1.5 rounded-xl bg-canvas border border-hairline text-[12px] font-bold text-ink-muted cursor-pointer hover:bg-[#ececeb] transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {exportingInsurance === 'pdf' ? '불러오는 중…' : '근로내용 확인신고서(PDF)'}
              </button>
            </>
          )}
          {pendingDefaults.length > 0 && (
            <button
              onClick={applyDefaults}
              disabled={applyingDefaults}
              title={pendingDefaults.map(p => `${p.row.name}: ${p.label} ${p.amount.toLocaleString('ko-KR')}원`).join('\n')}
              className="shrink-0 px-3 py-1.5 rounded-xl bg-primary-50 border border-primary-700/30 text-[12px] font-bold text-primary-700 cursor-pointer hover:bg-primary-100 transition disabled:opacity-50"
            >
              {applyingDefaults ? '적용 중…' : `기본 공제 일괄 적용 (${pendingDefaults.length}건)`}
            </button>
          )}
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="이름/전화 검색"
            className="px-2.5 py-1.5 border border-hairline rounded-xl text-[12px] bg-canvas focus:outline-none focus:border-primary-700 w-[120px]"
          />
        </div>
      </div>

      {/* 국민연금 가입 대상 — 월별 정산에서만. 판정 규칙은 lib/nationalPension.ts */}
      {pension && cursor && !isLoading && (() => {
        const eligible = rows.filter(r => pension[r.staffId]?.status === 'eligible')
        const firstMonth = rows.filter(r => pension[r.staffId]?.status === 'first-month')
        if (eligible.length === 0 && firstMonth.length === 0) return null
        const deadline = pensionReportDeadline(cursor.y, cursor.m)
        return (
          <div className="mx-3 mb-2 rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-2 text-[12px] text-ink-secondary">
            <b className="text-indigo-700">국민연금·건강보험 가입 대상 {eligible.length}명</b>
            {eligible.length > 0 && <span className="text-ink-muted"> · {eligible.map(r => r.name).join(', ')}</span>}
            {firstMonth.length > 0 && (
              <span className="text-ink-muted"> · 첫 달이라 이번 달 제외 {firstMonth.length}명({firstMonth.map(r => r.name).join(', ')}) — 다음 달도 일하면 대상</span>
            )}
            {eligible.length > 0 && (
              <p className="m-0 mt-0.5 text-[11px] text-ink-muted">
                자격취득신고 기한 {Number(deadline.slice(5, 7))}월 {Number(deadline.slice(8))}일 · 국민연금 의정부지사(동두천 담당) 031-828-3613 · 건강보험공단 1577-1000
              </p>
            )}
          </div>
        )
      })()}

      {/* 본문 */}
      {isLoading ? (
        <p className="text-ink-faint text-sm p-6 text-center m-0">불러오는 중...</p>
      ) : rows.length === 0 ? (
        <p className="text-ink-faint text-sm p-6 text-center m-0">
          {search.trim()
            ? `"${search.trim()}" 검색 결과가 없습니다.`
            : mode === 'month' ? '이번 달 배정된 직원이 없습니다.' : '이 팝업에 배정된 직원이 없습니다.'}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12px] select-text">
              <thead>
                <tr className="border-b border-hairline bg-canvas-soft">
                  <th className="w-8 px-2 py-2 font-semibold text-ink-muted text-center" title="급여 지급 완료">✓</th>
                  {(['name', 'days', 'totalHours', 'hourlyRate', 'totalPay'] as SortKey[]).map(key => (
                    <th
                      key={key}
                      onClick={() => toggleSort(key)}
                      className={`px-2 py-2 font-semibold text-ink-muted cursor-pointer select-none hover:text-ink transition whitespace-nowrap ${
                        key === 'name' ? 'text-left' :
                        key === 'totalPay' ? 'text-right px-4' :
                        key === 'hourlyRate' ? 'hidden md:table-cell text-right px-3' : 'text-center px-3'
                      }`}
                    >
                      {SORT_LABELS[key]}
                      <span className={`ml-0.5 text-[10px] ${sort.key === key ? 'text-primary-700' : 'text-ink-faint'}`}>
                        {sort.key === key ? (sort.dir === 'asc' ? '↑' : '↓') : '⇅'}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const paid = paidIds.has(row.staffId)
                  const adjust = adjustTotals.get(row.staffId) ?? 0
                  const finalPay = finalPayOf(row)
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
                      <div className={`font-bold text-ink ${paid ? 'line-through' : ''}`}>
                        <CopyText value={row.name} label="이름">{row.name}</CopyText>
                      </div>
                      {defaults[row.staffId] && (
                        <span className="mt-0.5 mr-1 inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full border bg-primary-50 text-primary-700 border-primary-700/30">
                          {DEFAULT_DEDUCTIONS[defaults[row.staffId]]}
                        </span>
                      )}
                      {pension?.[row.staffId] && pension[row.staffId].status !== 'none' && (
                        <PensionBadge row={pension[row.staffId]} />
                      )}
                      {missingByStaff.has(row.staffId) && (
                        // 날짜를 툴팁에만 두면 폰에선 볼 수 없었다 — 배지에 바로 적고, 누르면 상세 모달에서 날짜별 계획 시간을 보여준다
                        <div className="mt-0.5 inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-lg border bg-rose-50 text-rose-600 border-rose-200">
                          출근 기록 없음 {missingByStaff.get(row.staffId)!.length}일
                          <span className="ml-1 font-normal">· {formatMissingDates(missingByStaff.get(row.staffId)!)}</span>
                        </div>
                      )}
                      {/* 송금할 때 필요한 값(전화·계좌)을 상세 모달을 열지 않고 목록에서 바로 복사 */}
                      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5 text-[10px] text-ink-muted">
                        {row.phone && (
                          <CopyText value={formatPhoneNumber(row.phone)} label="전화번호">{formatPhoneNumber(row.phone)}</CopyText>
                        )}
                        {row.bankAccount && (
                          <CopyText value={row.bankAccount} label="계좌번호" toastValue={row.bankName ?? undefined}>
                            {row.bankName ? `${row.bankName} ${row.bankAccount}` : row.bankAccount}
                          </CopyText>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center text-ink">{row.days}일</td>
                    <td className="px-3 py-2.5 text-center text-ink font-semibold">
                      <CopyText value={String(row.totalHours)} label="총 시간" toastValue={`${row.totalHours}h`}>{row.totalHours}h</CopyText>
                    </td>
                    <td className="hidden md:table-cell px-3 py-2.5 text-right text-ink-muted">
                      {row.hourlyRate != null
                        ? <CopyText value={row.hourlyRate.toLocaleString('ko-KR')} label="시급" toastValue={`${row.hourlyRate.toLocaleString('ko-KR')}원`}>{row.hourlyRate.toLocaleString('ko-KR')}원</CopyText>
                        : <span className="text-ink-faint text-[11px]">미설정</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold text-ink">
                      {finalPay != null ? (
                        <>
                          <CopyText value={finalPay.toLocaleString('ko-KR')} label="총 급여" toastValue={`${finalPay.toLocaleString('ko-KR')}원`}>{finalPay.toLocaleString('ko-KR')}원</CopyText>
                          {adjust !== 0 && (
                            <span
                              title={`기본급 ${row.totalPay!.toLocaleString('ko-KR')}원 + 조정 ${adjust >= 0 ? '+' : ''}${adjust.toLocaleString('ko-KR')}원`}
                              className={`block text-[10px] font-semibold ${adjust >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}
                            >
                              {adjust >= 0 ? '+' : ''}{adjust.toLocaleString('ko-KR')} 조정
                            </span>
                          )}
                        </>
                      ) : <span className="text-ink-faint text-[11px] font-normal">—</span>}
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* 합계 */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-hairline bg-canvas-soft">
            <span className="text-[12px] text-ink-muted select-text">
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
              {hasPayRate
                ? <CopyText value={totalPay.toLocaleString('ko-KR')} label="합계 급여" toastValue={`${totalPay.toLocaleString('ko-KR')}원`}>{totalPay.toLocaleString('ko-KR')}원</CopyText>
                : '—'}
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

      {exportTarget && (
        <InsuranceExportModal kind={exportTarget.kind} rows={exportTarget.rows} year={exportTarget.y} month={exportTarget.m} onClose={() => setExportTarget(null)} />
      )}

      {detailTarget && detailPeriod && periodKey && (
        <PayrollDetailModal
          key={detailTarget.staffId}
          staffId={detailTarget.staffId}
          periodKey={periodKey!}
          initialAdjustments={settlement?.adjustments[detailTarget.staffId] ?? []}
          onAdjustmentsChanged={() => queryClient.invalidateQueries({ queryKey: ['payroll-settlement', periodKey] })}
          name={detailTarget.name}
          phone={detailTarget.phone}
          bankName={detailTarget.bankName}
          bankAccount={detailTarget.bankAccount}
          hourlyRate={detailTarget.hourlyRate}
          period={detailPeriod}
          defaultDeduction={defaults[detailTarget.staffId] ?? null}
          missingClockIns={missingByStaff.get(detailTarget.staffId) ?? []}
          pension={pension?.[detailTarget.staffId] ?? null}
          onDefaultDeductionChanged={() => queryClient.invalidateQueries({ queryKey: ['payroll-default-deductions'] })}
          onClose={() => setDetailTarget(null)}
        />
      )}
    </div>
  )
}

/** "10/14(화), 10/21(화) 외 2일" — 목록 배지가 한 줄에 들어가도록 앞의 3일만 적는다 */
function formatMissingDates(list: MissingClockIn[]): string {
  const label = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}(${DAY_NAMES[new Date(d + 'T00:00:00').getDay()]})`
  const shown = list.slice(0, 3).map(m => label(m.workDate)).join(', ')
  return list.length > 3 ? `${shown} 외 ${list.length - 3}일` : shown
}

/** 국민연금 판정 배지 — 근거(충족 조건)와 합산 값을 바로 보이게 적는다(주방·캐셔 근무를 합친 값) */
function PensionBadge({ row }: { row: PensionRow }) {
  const eligible = row.status === 'eligible'
  return (
    <span
      className={`mt-0.5 mr-1 inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-lg border ${
        eligible ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-canvas-soft text-ink-muted border-hairline'
      }`}
      title={`${row.days}일 · ${row.hours}h · ${row.pay.toLocaleString('ko-KR')}원 (주방·캐셔 합산)`}
    >
      {eligible ? '국민연금·건강보험 대상' : '국민연금·건강보험 첫 달(다음 달부터)'}
      <span className="ml-1 font-normal">· {row.reasons.join(', ')}</span>
    </span>
  )
}
