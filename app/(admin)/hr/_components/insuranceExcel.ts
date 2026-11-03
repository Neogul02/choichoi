// 세무사에게 보내는 월별 4대보험 자료 엑셀 — 급여정산의 '4대보험 자료' 버튼이 쓴다.
// 1장: 근로내용 확인신고서(일용근로자용)처럼 1~31일 근무에 ㅇ 표시, 2장: 국민연금·건강보험 가입 대상자 명단.
// exceljs는 무거워서 버튼을 누를 때만 불러온다.
import type { InsuranceReportRow } from '@/app/actions/payroll'
import { BUSINESS_INFO } from '@/lib/insuranceReport'
import { DAY_NAMES } from '@/lib/staffing'

/** 신고서에 써 온 이직사유 코드 — 일용근로라 매달 '1' */
const LEAVE_REASON_CODE = '1'

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5EFE1' } } as const
const WEEKEND_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCEBEB' } } as const
const OFF_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDEDED' } } as const
const THIN = { style: 'thin', color: { argb: 'FFBFBFBF' } } as const
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN }
const WON = '#,##0"원"'

export async function downloadInsuranceExcel(rows: InsuranceReportRow[], year: number, month: number): Promise<void> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  const lastDay = new Date(year, month + 1, 0).getDate()
  const label = `${year}년 ${month + 1}월`

  // ── 1장: 근로내용 (일용근로자) ───────────────────────────────────────────────
  const ws = wb.addWorksheet('근로내용(일용)', { views: [{ state: 'frozen', xSplit: 2, ySplit: 4 }] })
  ws.addRow([`근로내용 확인신고 자료 (일용근로자) — ${label}분`]).font = { bold: true, size: 14 }
  ws.addRow([`명칭 ${BUSINESS_INFO.name} · 사업장관리번호 ${BUSINESS_INFO.managementNo} · 사업자등록번호 ${BUSINESS_INFO.registrationNo} · ${BUSINESS_INFO.address}`])
  ws.addRow([])

  const dayCols = Array.from({ length: 31 }, (_, i) => i + 1)
  const header = [
    '번호', '성명', '주민등록번호', '전화번호', '직종부호',
    ...dayCols.map(String),
    '근로일수', '일평균 근로시간', '총 근로시간', '보수지급기초일수', '보수총액', '이직사유코드', '입사일', '국민연금·건강보험',
  ]
  const headerRow = ws.addRow(header)
  const firstDayCol = 6
  headerRow.eachCell((cell, col) => {
    cell.font = { bold: true }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = BORDER
    cell.fill = HEADER_FILL
    const day = col - firstDayCol + 1
    if (day >= 1 && day <= 31) {
      if (day > lastDay) cell.fill = OFF_FILL
      else {
        const dow = new Date(year, month, day).getDay()
        if (dow === 0 || dow === 6) cell.fill = WEEKEND_FILL
        cell.note = DAY_NAMES[dow]
      }
    }
  })

  rows.forEach((r, i) => {
    const worked = new Set(r.workDays)
    const row = ws.addRow([
      i + 1, r.name, r.residentId ?? '(미등록)', r.phone ?? '', r.jobCode,
      ...dayCols.map(d => (d <= lastDay && worked.has(d) ? 'ㅇ' : '')),
      r.days, r.avgDailyHours, r.hours, r.days, r.pay, LEAVE_REASON_CODE, r.startDate ?? '',
      r.pension.status === 'eligible' ? `대상 (${r.pension.reasons.join(', ')})` : r.pension.status === 'first-month' ? '첫 달 — 다음 달부터' : '',
    ])
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.border = BORDER
      cell.alignment = { horizontal: col === 2 || col > firstDayCol + 30 + 7 ? 'left' : 'center', vertical: 'middle' }
      if (col - firstDayCol + 1 > lastDay && col >= firstDayCol && col < firstDayCol + 31) cell.fill = OFF_FILL
    })
    row.getCell(firstDayCol + 31 + 4).numFmt = WON
    if (!r.residentId) row.getCell(3).font = { color: { argb: 'FFC0392B' } }
  })

  ws.getColumn(1).width = 5
  ws.getColumn(2).width = 9
  ws.getColumn(3).width = 16
  ws.getColumn(4).width = 14
  ws.getColumn(5).width = 7
  for (let c = firstDayCol; c < firstDayCol + 31; c++) ws.getColumn(c).width = 3.6
  ;[8, 9, 9, 9, 12, 8, 11, 26].forEach((w, i) => { ws.getColumn(firstDayCol + 31 + i).width = w })
  ws.getRow(4).height = 30

  // ── 2장: 국민연금·건강보험 가입 대상 ───────────────────────────────────────
  const ws2 = wb.addWorksheet('4대보험 가입대상')
  ws2.addRow([`국민연금·건강보험 가입 대상 — ${label} (자격취득신고 기한 ${month === 11 ? year + 1 : year}년 ${month === 11 ? 1 : month + 2}월 15일)`]).font = { bold: true, size: 14 }
  ws2.addRow(['판정: 한 달에 근무 8일 이상·유급 60시간 이상·세전 220만 원 이상 중 하나, 단 전 달부터 이어서 근무한 경우'])
  ws2.addRow([])
  const h2 = ws2.addRow(['번호', '성명', '주민등록번호', '입사일', '월 보수(세전)', '월 근로시간', '근로일수', '전화번호', '판정 근거'])
  h2.eachCell(cell => { cell.font = { bold: true }; cell.fill = HEADER_FILL; cell.border = BORDER; cell.alignment = { horizontal: 'center' } })
  const eligible = rows.filter(r => r.pension.status === 'eligible')
  if (eligible.length === 0) ws2.addRow(['', '이번 달 가입 대상자가 없습니다'])
  eligible.forEach((r, i) => {
    const row = ws2.addRow([i + 1, r.name, r.residentId ?? '(미등록)', r.startDate ?? '', r.pay, r.hours, r.days, r.phone ?? '', r.pension.reasons.join(', ')])
    row.eachCell(cell => { cell.border = BORDER })
    row.getCell(5).numFmt = WON
  })
  ;[5, 9, 16, 12, 14, 11, 9, 14, 30].forEach((w, i) => { ws2.getColumn(i + 1).width = w })

  const buf = await wb.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `초이초이_4대보험자료_${year}년${month + 1}월.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
