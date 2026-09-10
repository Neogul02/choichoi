'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchMonthlyPayroll, fetchPopupPayroll, fetchPayrollSettlement, setPayrollPaid,
  type PayrollRow, type PopupPayrollResult, type PayrollSettlement,
} from '@/app/actions/payroll'
import { fetchPopupEvents } from '@/app/actions/schedule'
import type { StaffRole, PopupEvent } from '@/types/database'
import { showMsg } from '@/lib/toast'
import { formatPhoneNumber } from '@/lib/utils'
import { phoneMatches } from '@/lib/phone'
import ConfirmDialog from '@/components/ConfirmDialog'
import CopyText, { copyToClipboard } from '@/components/CopyText'
import { ROLE_LABELS } from './constants'
import PayrollDetailModal, { type PayrollPeriod } from './PayrollDetailModal'

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
            className="px-3 py-1.5 rounded-xl bg-canvas border border-hairline text-[12px] font-bold text-ink-muted cursor-pointer hover:bg-[#ececeb] transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            CSV
          </button>
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="이름/전화 검색"
            className="px-2.5 py-1.5 border border-hairline rounded-xl text-[12px] bg-canvas focus:outline-none focus:border-primary-700 w-[120px]"
          />
        </div>
      </div>

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
          onClose={() => setDetailTarget(null)}
        />
      )}
    </div>
  )
}
