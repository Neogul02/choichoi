// 근로내용 확인신고서(일용근로자용) PDF 내려받기 — react-pdf와 서식 컴포넌트는 버튼을 누를 때만 불러온다.
import { createElement } from 'react'
import type { InsuranceReportRow } from '@/app/actions/payroll'
import { kstToday } from '@/lib/date'

export async function downloadLaborReportPdf(rows: InsuranceReportRow[], year: number, month: number): Promise<void> {
  const [{ pdf }, { default: LaborReportDocument }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('./LaborReportDocument'),
  ])
  const blob = await pdf(createElement(LaborReportDocument, { rows, year, month, reportDate: kstToday() }) as never).toBlob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `근로내용확인신고서_${year}년${month + 1}월분.pdf`
  a.click()
  URL.revokeObjectURL(url)
}
