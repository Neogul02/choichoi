// 근로내용 확인신고서(일용근로자용) — 고용보험법 시행규칙 별지 제7호서식(2026. 7. 1. 개정) 1쪽을 그대로 그린다.
// 그동안 한글(hwp) 양식에 손으로 채워 온 것을 급여정산 데이터로 채운다. 칸 크기(pt)는 원본 PDF에서 잰 값이다.
// 한 장에 근로자 4명 — 넘으면 같은 양식을 다음 장으로 이어 붙인다.
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { F, type PdfStyle } from '@/components/popup-report/theme'
import type { InsuranceReportRow } from '@/app/actions/payroll'
import { BUSINESS_INFO } from '@/lib/insuranceReport'
import { formatPhoneNumber } from '@/lib/utils'

/** 신고서에 써 온 이직사유 코드 — 일용근로라 매달 '1' */
const LEAVE_REASON_CODE = '1'
const PER_PAGE = 4

/** '일평균 근로시간' 칸에 쓸 값 — 서식 이름대로 하루 평균, 또는 그동안 써 온 총 시간 */
export type LaborHoursMode = 'average' | 'total'

// 폭 — 본문 506pt = 왼쪽 항목칸 85 + 근로자 4명 × 105.25
const W = 506
const LABEL = 85
const COL = (W - LABEL) / PER_PAGE
const DAY = COL / 5
const LINE = '#7f7f7f'
const B = 0.6

const s = StyleSheet.create({
  page: { fontFamily: F, fontSize: 7.6, color: '#000', paddingTop: 58, paddingLeft: 43, paddingRight: 46 },
  row: { flexDirection: 'row', borderBottomWidth: B, borderColor: LINE },
  cell: { justifyContent: 'center', paddingHorizontal: 3, borderRightWidth: B, borderColor: LINE },
  center: { alignItems: 'center', textAlign: 'center' },
  right: { alignItems: 'flex-end', textAlign: 'right' },
  small: { fontSize: 6.2 },
})

function Cell({ w, h, children, style, last }: { w: number; h?: number; children?: React.ReactNode; style?: PdfStyle; last?: boolean }) {
  return (
    <View style={[s.cell, { width: w }, h != null ? { height: h } : {}, last ? { borderRightWidth: 0 } : {}, ...(style ? [style] : [])]}>
      {typeof children === 'string' ? <Text>{children}</Text> : children}
    </View>
  )
}

/** 근로자 4칸 줄 — 비는 칸은 빈칸으로 그린다 */
function WorkerRow({ label, h, workers, render, labelStyle }: {
  label: React.ReactNode
  h: number
  workers: (InsuranceReportRow | null)[]
  render: (w: InsuranceReportRow) => React.ReactNode
  labelStyle?: PdfStyle
}) {
  return (
    <View style={[s.row, { height: h }]}>
      <Cell w={LABEL} style={labelStyle}>{label}</Cell>
      {workers.map((w, i) => (
        <Cell key={i} w={COL} style={s.center} last={i === PER_PAGE - 1}>{w ? render(w) : null}</Cell>
      ))}
    </View>
  )
}

const formatRrn = (rrn: string | null) => {
  if (!rrn) return ''
  const d = rrn.replace(/\D/g, '')
  return d.length === 13 ? `${d.slice(0, 6)}-${d.slice(6)}` : rrn
}
const won = (n: number) => `${n.toLocaleString('ko-KR')} 원`

function FormPage({ workers, year, month, reportDate, hoursMode }: { workers: (InsuranceReportRow | null)[]; year: number; month: number; reportDate: string; hoursMode: LaborHoursMode }) {
  const [ry, rm, rd] = reportDate.split('-').map(Number)
  const lastDay = new Date(year, month + 1, 0).getDate()
  const dayGroups = [[1, 2, 3, 4, 5], [6, 7, 8, 9, 10], [11, 12, 13, 14, 15], [16, 17, 18, 19, 20], [21, 22, 23, 24, 25], [26, 27, 28, 29, 30]]

  return (
    <Page size="A4" style={s.page}>
      {/* 머리말 */}
      <Text style={{ fontSize: 7.5 }}>■ 고용보험법 시행규칙 [별지 제7호서식] <Text style={{ color: '#2f3fd6' }}>{'<개정 2026. 7. 1.>'}</Text></Text>
      <Text style={{ fontSize: 13.5, fontWeight: 700, textAlign: 'center', marginTop: 5 }}>
        [ v ]고용보험  [ v ]산재보험  근로내용 확인신고서(일용근로자용)( {String(year).slice(2)} 년 {month + 1} 월분)
      </Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 3, marginBottom: 3 }}>
        <Text style={{ fontSize: 6.8 }}>※ 2쪽의 유의사항과 작성방법을 읽고 작성하기 바라며, [  ]에는 해당되는 곳에 &quot;√&quot; 표시를 합니다.</Text>
        <Text style={{ fontSize: 6.8 }}>(3쪽 중 1쪽)</Text>
      </View>

      {/* 접수 */}
      <View style={[s.row, { height: 14, backgroundColor: '#d9d9d9', borderTopWidth: B, borderBottomWidth: 1.6, borderColor: '#000' }]}>
        <Cell w={48}>접수번호</Cell>
        <Cell w={246}>접수일</Cell>
        <Cell w={212} last>처리기간: 7일</Cell>
      </View>

      {/* 공통 사업장 */}
      <View style={[s.row, { height: 108 }]}>
        <Cell w={22} style={[s.center, { justifyContent: 'center' }]}><Text>공통{'\n'}사업{'\n'}장</Text></Cell>
        <View style={{ width: W - 22 }}>
          <View style={[s.row, { height: 13 }]}>
            <Cell w={208}><Text>사업장관리번호  {BUSINESS_INFO.managementNo}</Text></Cell>
            <Cell w={276} last><Text>명칭{'                  '}<Text style={{ fontWeight: 700 }}>초이초이</Text> (Choi Choi)</Text></Cell>
          </View>
          <View style={[s.row, { height: 36 }]}>
            <Cell w={208} style={{ justifyContent: 'flex-start', paddingTop: 2 }}>
              <Text>사업자등록번호  {BUSINESS_INFO.registrationNo}</Text>
              <Text style={[s.small, { marginTop: 9, paddingLeft: 4 }]}>※ 국세청 일용근로소득지급명세서 갈음하여 제출하는{'\n'}   경우에만 적습니다.</Text>
            </Cell>
            <View style={{ width: 276 }}>
              <View style={[s.row, { height: 20 }]}>
                <Cell w={276} last><Text>하수급인관리번호</Text><Text style={s.small}>(건설공사등 미승인 하수급인만 적습니다)</Text></Cell>
              </View>
              <View style={{ height: 16, justifyContent: 'center', paddingHorizontal: 3 }}><Text>공사명(유기사업명)</Text></View>
            </View>
          </View>
          <View style={[s.row, { height: 22 }]}>
            <Cell w={208} style={{ justifyContent: 'flex-start', paddingTop: 3 }}><Text>소재지 <Text style={{ fontWeight: 700 }}>{BUSINESS_INFO.address}</Text></Text></Cell>
            <Cell w={132} style={{ justifyContent: 'flex-start', paddingTop: 3 }}>보험사무대행기관 번호</Cell>
            <Cell w={144} last style={{ justifyContent: 'flex-start', paddingTop: 3 }}>보험사무대행기관 명칭</Cell>
          </View>
          <View style={[s.row, { height: 13, borderBottomWidth: 1 }]}>
            <Cell w={41}>전화번호</Cell>
            <Cell w={230}><Text>(유선){'                                    '}(휴대전화) {BUSINESS_INFO.mobile}</Text></Cell>
            <Cell w={213} last>팩스번호</Cell>
          </View>
          <View style={{ flexDirection: 'row', height: 24 }}>
            <Cell w={83} style={s.center}><Text>고용관리 책임자</Text><Text>(※건설업만 해당)</Text></Cell>
            <View style={{ width: W - 22 - 83 }}>
              <View style={{ flexDirection: 'row', height: 12, borderBottomWidth: B, borderStyle: 'dotted', borderColor: LINE }}>
                <Cell w={146} style={{ borderRightWidth: 0 }}>(성명)</Cell>
                <Cell w={156} style={{ borderRightWidth: 0 }}>(주민등록번호)</Cell>
                <Cell w={99} last>(직위)</Cell>
              </View>
              <View style={{ flexDirection: 'row', height: 12 }}>
                <Cell w={146} style={{ borderRightWidth: 0 }}>(직무내용)</Cell>
                <Cell w={255} last>(근무지)[  ]본사  [  ]해당 사업장(현장)  [  ]다른 사업장(현장)</Cell>
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* 근로자 */}
      <WorkerRow label="성명" h={15} workers={workers} render={w => <Text>{w.name}</Text>} />
      <WorkerRow label={<Text>주민등록번호{'\n'}(외국인등록번호)</Text>} h={24} workers={workers} render={w => <Text>{formatRrn(w.residentId)}</Text>} />
      <View style={[s.row, { height: 15 }]}>
        <Cell w={33}>국적</Cell>
        <Cell w={LABEL - 33}>체류자격</Cell>
        {workers.map((w, i) => (
          <View key={i} style={[s.cell, { width: COL, flexDirection: 'row', paddingHorizontal: 0 }, i === PER_PAGE - 1 ? { borderRightWidth: 0 } : {}]}>
            <View style={{ width: 50, borderRightWidth: B, borderColor: LINE, height: '100%', justifyContent: 'center', alignItems: 'center' }}><Text>{w ? '한국' : ''}</Text></View>
          </View>
        ))}
      </View>
      <WorkerRow label="전화번호(휴대전화)" h={15} workers={workers} render={w => <Text>{w.phone ? formatPhoneNumber(w.phone) : ''}</Text>} />
      <WorkerRow label="직종 부호" h={15} workers={workers} render={w => <Text>{w.jobCode}</Text>} />

      {/* 근로일수 ("o" 표시) */}
      <View style={s.row}>
        <Cell w={LABEL} style={s.center}><Text>근로일수{'\n'}(&quot;o&quot;표시)</Text></Cell>
        {workers.map((w, wi) => {
          const worked = new Set(w?.workDays ?? [])
          return (
            <View key={wi} style={[{ width: COL, borderRightWidth: wi === PER_PAGE - 1 ? 0 : B, borderColor: LINE }]}>
              {dayGroups.map((g, gi) => (
                <View key={gi}>
                  <View style={{ flexDirection: 'row', height: 14, borderBottomWidth: B, borderColor: '#bfbfbf' }}>
                    {g.map(d => <View key={d} style={{ width: DAY, borderRightWidth: d % 5 === 0 ? 0 : B, borderColor: '#bfbfbf', justifyContent: 'center', alignItems: 'center' }}><Text>{d}</Text></View>)}
                  </View>
                  <View style={{ flexDirection: 'row', height: 15, borderBottomWidth: B, borderColor: '#bfbfbf' }}>
                    {g.map(d => <View key={d} style={{ width: DAY, borderRightWidth: d % 5 === 0 ? 0 : B, borderColor: '#bfbfbf', justifyContent: 'center', alignItems: 'center' }}><Text>{d <= lastDay && worked.has(d) ? '○' : ''}</Text></View>)}
                  </View>
                </View>
              ))}
              {/* 31일 — 칸은 다섯이지만 날짜는 첫 칸뿐 */}
              <View style={{ flexDirection: 'row', height: 17, borderBottomWidth: B, borderColor: '#bfbfbf' }}>
                {[0, 1, 2, 3, 4].map(k => <View key={k} style={{ width: DAY, borderRightWidth: k === 4 ? 0 : B, borderColor: '#bfbfbf', justifyContent: 'center', alignItems: 'center' }}><Text style={s.small}>{k === 0 ? '31' : ''}</Text></View>)}
              </View>
              <View style={{ flexDirection: 'row', height: 14 }}>
                {[0, 1, 2, 3, 4].map(k => <View key={k} style={{ width: DAY, borderRightWidth: k === 4 ? 0 : B, borderColor: '#bfbfbf', justifyContent: 'center', alignItems: 'center' }}><Text>{k === 0 && lastDay >= 31 && worked.has(31) ? '○' : ''}</Text></View>)}
              </View>
            </View>
          )
        })}
      </View>

      <View style={[s.row, { height: 22 }]}>
        <Cell w={44} style={s.small}>근로일수</Cell>
        <Cell w={LABEL - 44} style={s.center}><Text style={s.small}>일평균{'\n'}근로시간</Text></Cell>
        {workers.map((w, i) => (
          <View key={i} style={[s.cell, { width: COL, flexDirection: 'row', paddingHorizontal: 0 }, i === PER_PAGE - 1 ? { borderRightWidth: 0 } : {}]}>
            <View style={{ width: 40, borderRightWidth: B, borderColor: LINE, height: '100%', justifyContent: 'center', alignItems: 'center' }}><Text>{w ? `${w.days} 일` : ''}</Text></View>
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><Text>{w ? `${hoursMode === 'total' ? w.hours : w.avgDailyHours} h` : ''}</Text></View>
          </View>
        ))}
      </View>
      <WorkerRow label="보수지급기초일수" h={15} workers={workers} render={w => <Text>{w.days} 일</Text>} />
      <WorkerRow label="보수총액" h={15} workers={workers} render={w => <Text>{won(w.pay)}</Text>} />
      <WorkerRow label="임금총액" h={15} workers={workers} render={w => <Text>{won(w.pay)}</Text>} />
      <WorkerRow label="이직사유 코드" h={15} workers={workers} render={() => <Text>{LEAVE_REASON_CODE}</Text>} />

      {/* 보험료부과구분 */}
      <View style={[s.row, { height: 14, justifyContent: 'center', alignItems: 'center' }]}><Text>보험료부과구분(해당하는 사람만 적습니다)</Text></View>
      <View style={[s.row, { height: 15, borderBottomWidth: 1 }]}>
        <Cell w={38} style={s.center}>부호</Cell>
        <Cell w={LABEL - 38} style={s.center}>사유</Cell>
        {workers.map((_, i) => (
          <View key={i} style={[s.cell, { width: COL, flexDirection: 'row', paddingHorizontal: 0 }, i === PER_PAGE - 1 ? { borderRightWidth: 0 } : {}]}>
            <View style={{ width: 45, borderRightWidth: B, borderColor: LINE, height: '100%' }} />
          </View>
        ))}
      </View>

      {/* 국세청 일용근로소득 신고 — 근로복지공단 신고로 갈음할 때만 적는 칸이라 비워 둔다 */}
      <View style={[s.row, { borderBottomWidth: B }]}>
        <Cell w={30} style={s.center}><Text>국세청{'\n'}일용{'\n'}근로{'\n'}소득{'\n'}신고</Text></Cell>
        <View style={{ width: W - 30 }}>
          {[
            { label: '지급월', unit: '월', h: 14 },
            { label: '총지급액\n(과세소득)', unit: '원', h: 22 },
            { label: '비과세소득', unit: '원', h: 15 },
          ].map(r => (
            <View key={r.label} style={[s.row, { height: r.h }]}>
              <Cell w={LABEL - 30} style={s.center}><Text style={s.small}>{r.label}</Text></Cell>
              {workers.map((_, i) => <Cell key={i} w={COL} style={s.right} last={i === PER_PAGE - 1}>{r.unit}</Cell>)}
            </View>
          ))}
          <View style={{ flexDirection: 'row' }}>
            <Cell w={22} style={s.center}><Text style={s.small}>원천{'\n'}징수액</Text></Cell>
            <View style={{ width: W - 30 - 22 }}>
              {[{ label: '소득세', h: 15 }, { label: '지방\n소득세', h: 19 }].map((r, ri) => (
                <View key={r.label} style={[{ flexDirection: 'row', height: r.h }, ri === 0 ? { borderBottomWidth: B, borderColor: LINE } : {}]}>
                  <Cell w={LABEL - 30 - 22} style={s.center}><Text style={s.small}>{r.label}</Text></Cell>
                  {workers.map((_, i) => <Cell key={i} w={COL} style={s.right} last={i === PER_PAGE - 1}>원</Cell>)}
                </View>
              ))}
            </View>
          </View>
        </View>
      </View>

      {/* 확인·신고 */}
      <Text style={{ marginTop: 5, lineHeight: 1.35, fontSize: 7.4 }}>
        {'    '}「고용보험법 시행령」 제7조제1항 후단, 같은 법 시행규칙 제5조제2항 및 「고용보험 및 산업재해보상보험의 보험료징수 등에 관한 법률 시행규칙」 제16조의7제2항제1호에 따라 위와 같이 확인하여 신고합니다.
      </Text>
      <Text style={{ textAlign: 'right', marginTop: 6 }}>{ry} 년{'        '}{rm} 월{'       '}{rd} 일</Text>
      <View style={{ flexDirection: 'row', marginTop: 4 }}>
        <Text style={{ width: W * 0.62, paddingLeft: 96, marginTop: 9 }}>신고인(사용자ㆍ대표자)</Text>
        <Text style={{ flex: 1, textAlign: 'right' }}><Text style={{ fontWeight: 700 }}>초이초이</Text> (서명 또는 인)</Text>
      </View>
      <View style={{ flexDirection: 'row', marginTop: 12 }}>
        <Text style={{ width: W * 0.62, paddingLeft: 96 }}>[  ] 보험사무대행기관</Text>
        <Text style={{ flex: 1, textAlign: 'right' }}>(서명 또는 인)</Text>
      </View>
      <Text style={{ fontSize: 11, marginTop: 2, paddingLeft: 12, paddingBottom: 2, borderBottomWidth: 1.6, borderColor: '#808080' }}>
        근로복지공단○○지역본부(지사)장 <Text style={{ fontSize: 8 }}>귀하</Text>
      </Text>
      <Text style={{ textAlign: 'right', fontSize: 6.5, marginTop: 2 }}>297mm×210mm[백상지(80g/㎡) 또는 중질지(80g/㎡)]</Text>
    </Page>
  )
}

export default function LaborReportDocument({ rows, year, month, reportDate, hoursMode = 'average' }: {
  rows: InsuranceReportRow[]
  year: number
  month: number // 0-indexed
  /** 신고일(YYYY-MM-DD) — 서식 아래 날짜 */
  reportDate: string
  hoursMode?: LaborHoursMode
}) {
  const pages: (InsuranceReportRow | null)[][] = []
  for (let i = 0; i < Math.max(rows.length, 1); i += PER_PAGE) {
    const chunk: (InsuranceReportRow | null)[] = rows.slice(i, i + PER_PAGE)
    while (chunk.length < PER_PAGE) chunk.push(null)
    pages.push(chunk)
  }
  return (
    <Document title={`근로내용 확인신고서(일용근로자용) ${year}년 ${month + 1}월분`}>
      {pages.map((workers, i) => <FormPage key={i} workers={workers} year={year} month={month} reportDate={reportDate} hoursMode={hoursMode} />)}
    </Document>
  )
}
