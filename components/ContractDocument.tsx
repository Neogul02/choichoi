import { Document, Page, Text, View, StyleSheet, Font, Image } from '@react-pdf/renderer'
import path from 'path'

Font.register({
  family: 'NotoSansKR',
  src:
    typeof window === 'undefined'
      ? path.join(process.cwd(), 'public', 'fonts', 'NotoSansKR-Regular.ttf')
      : '/fonts/NotoSansKR-Regular.ttf',
})

export type WorkDaySchedule = {
  day: string       // '월', '화', ...
  startTime: string // '09:00'
  endTime: string   // '18:00'
  breakStart: string
  breakEnd: string
}

export type SpecificWorkDate = {
  date: string     // YYYY-MM-DD
  dayName: string  // '월', '화', ...
  startTime: string
  endTime: string
  breakStart?: string
  breakEnd?: string
}

export type ContractData = {
  // 당사자
  employerName: string
  employerAddress: string
  employerRepresentative: string
  employerPhone: string
  workerName: string
  workerAddress?: string
  workerPhone?: string
  // 1. 근로개시일
  startDate: string
  endDate?: string
  // 2-3
  workplace: string
  jobDescription: string
  // 4. 근로일별 근로시간
  workDays: WorkDaySchedule[]
  specificWorkDates?: SpecificWorkDate[] // 단기간: 실제 근무일 목록
  weeklyHolidayDay: string
  // 5. 임금
  hourlyRate: number
  hasBonus: boolean
  bonusAmount?: number
  hasOtherAllowance: boolean
  otherAllowanceAmount?: number
  overtimeRate: number
  paymentDay: string
  paymentDirect: boolean
  paymentTransfer: boolean
  includesHolidayPay?: boolean
  // 7. 사회보험
  insuranceEmployment: boolean
  insuranceIndustrial: boolean
  insurancePension: boolean
  insuranceHealth: boolean
  // 특약사항
  specialTerms?: string
  // 서명
  employerSignatureBase64?: string
  workerSignatureBase64?: string
  issueDate: string
}

const F = 'NotoSansKR'

const s = StyleSheet.create({
  page: { fontFamily: F, fontSize: 9, padding: 40, color: '#111', lineHeight: 1.55 },
  titleBox: { border: '2px solid #111', textAlign: 'center', paddingVertical: 6, marginBottom: 14 },
  title: { fontSize: 16, fontFamily: F, fontWeight: 'bold', letterSpacing: 4 },
  partyLine: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12, fontSize: 9 },
  section: { marginBottom: 8 },
  sectionLabel: { fontFamily: F, fontWeight: 'bold', marginBottom: 3 },
  row: { flexDirection: 'row', marginBottom: 2 },
  note: { fontSize: 7.5, color: '#555', marginLeft: 8, marginBottom: 3 },
  // 테이블
  table: { border: '1px solid #888', marginBottom: 6 },
  tableRow: { flexDirection: 'row', borderBottom: '1px solid #888' },
  tableRowLast: { flexDirection: 'row' },
  tableHeader: { backgroundColor: '#f5f5f5', fontFamily: F },
  tableCell: { borderRight: '1px solid #888', padding: '3 4', fontSize: 8, flex: 1, textAlign: 'center' },
  tableCellLast: { padding: '3 4', fontSize: 8, flex: 1, textAlign: 'center' },
  tableLabelCell: { borderRight: '1px solid #888', padding: '3 4', fontSize: 8, width: 40, textAlign: 'center', fontFamily: F },
  // 사회보험
  checkRow: { flexDirection: 'row', gap: 12, marginTop: 2, marginLeft: 8 },
  checkItem: { flexDirection: 'row', gap: 3, alignItems: 'center' },
  checkbox: { width: 9, height: 9, border: '1px solid #555', marginRight: 2 },
  checkboxFilled: { width: 9, height: 9, border: '1px solid #555', backgroundColor: '#555', marginRight: 2 },
  // 서명
  signSection: { marginTop: 20 },
  signDate: { textAlign: 'center', marginBottom: 16, fontSize: 10 },
  signParty: { marginBottom: 14 },
  signRow: { flexDirection: 'row', marginBottom: 3 },
  signLabel: { width: 60, color: '#444' },
  signValue: { flex: 1, borderBottom: '0.5px solid #aaa', paddingBottom: 1 },
  signImg: { width: 110, height: 50, marginTop: 2 },
  divider: { borderBottom: '0.5px solid #ccc', marginVertical: 8 },
  clauseText: { marginLeft: 8, fontSize: 8.5, color: '#333' },
  bullet: { marginLeft: 8, marginBottom: 2 },
})

function Underline({ value, width }: { value: string; width?: number }) {
  return (
    <Text style={{ borderBottom: '0.5px solid #333', minWidth: width ?? 80, paddingBottom: 1 }}>
      {value || ' '}
    </Text>
  )
}

function CheckBox({ checked, label }: { checked: boolean; label: string }) {
  return (
    <View style={s.checkItem}>
      <View style={checked ? s.checkboxFilled : s.checkbox} />
      <Text>{label}</Text>
    </View>
  )
}

function todayStr(d?: string) {
  const date = d ? new Date(d) : new Date()
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`
}

function calcNetMins(startTime: string, endTime: string, breakStart?: string, breakEnd?: string): number {
  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime.split(':').map(Number)
  const rawMins = (eh * 60 + em) - (sh * 60 + sm)
  let brkMins = 0
  if (breakStart && breakEnd) {
    const [bsh, bsm] = breakStart.split(':').map(Number)
    const [beh, bem] = breakEnd.split(':').map(Number)
    brkMins = (beh * 60 + bem) - (bsh * 60 + bsm)
  }
  return Math.max(0, rawMins - brkMins)
}

function calcNetHours(d: WorkDaySchedule): number {
  return calcNetMins(d.startTime, d.endTime, d.breakStart, d.breakEnd) / 60
}

function calcNetHoursForDate(d: SpecificWorkDate): number {
  return calcNetMins(d.startTime, d.endTime, d.breakStart, d.breakEnd) / 60
}


export function ContractDocument(p: ContractData) {
  const days = p.workDays ?? []
  const totalWeeklyHours = days.reduce((sum, d) => sum + calcNetHours(d), 0)
  const specificDates = p.specificWorkDates ?? []
  const totalSpecificHours = specificDates.reduce((sum, d) => sum + calcNetHoursForDate(d), 0)

  return (
    <Document title='단시간근로자 표준근로계약서' author={p.employerName}>
      <Page size='A4' style={s.page}>

        {/* 제목 */}
        <View style={s.titleBox}>
          <Text style={s.title}>단시간근로자  표준근로계약서</Text>
        </View>

        {/* 당사자 */}
        <View style={s.partyLine}>
          <Underline value={p.employerName} width={120} />
          <Text>(이하 &quot;사업주&quot;라 함)과(와) </Text>
          <Underline value={p.workerName} width={80} />
          <Text>(이하 &quot;근로자&quot;라 함)은 다음과 같이 근로계약을 체결한다.</Text>
        </View>

        {/* 1. 근로개시일 */}
        <View style={s.section}>
          <View style={s.row}>
            <Text style={s.sectionLabel}>1. 근로개시일 : </Text>
            <Text>{p.startDate ? todayStr(p.startDate) : '__년 __월 __일'}부터</Text>
            {p.endDate && <Text>  {todayStr(p.endDate)}까지</Text>}
          </View>
          {p.endDate && (
            <Text style={s.note}>※ 근로계약기간: {p.startDate} ~ {p.endDate}</Text>
          )}
        </View>

        {/* 2. 근무장소 */}
        <View style={s.section}>
          <View style={s.row}>
            <Text style={s.sectionLabel}>2. 근 무 장 소 : </Text>
            <Underline value={p.workplace} width={200} />
          </View>
        </View>

        {/* 3. 업무의 내용 */}
        <View style={s.section}>
          <View style={s.row}>
            <Text style={s.sectionLabel}>3. 업무의 내용 : </Text>
            <Underline value={p.jobDescription} width={200} />
          </View>
        </View>

        {/* 4. 근로일 및 근로일별 근로시간 */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>4. 근로일 및 근로일별 근로시간</Text>
          {p.specificWorkDates && p.specificWorkDates.length > 0 ? (
            <>
              <View style={s.table}>
                <View style={[s.tableRow, s.tableHeader]}>
                  <Text style={[s.tableCell, { flex: 1.4, textAlign: 'left' }]}>날짜</Text>
                  <Text style={s.tableCell}>요일</Text>
                  <Text style={s.tableCell}>시업</Text>
                  <Text style={s.tableCell}>종업</Text>
                  <Text style={s.tableCellLast}>휴게</Text>
                </View>
                {p.specificWorkDates.map((d, i) => {
                  const isLast = i === p.specificWorkDates!.length - 1
                  const RowStyle = isLast ? s.tableRowLast : s.tableRow
                  const breakStr = d.breakStart && d.breakEnd ? `${d.breakStart}~${d.breakEnd}` : '-'
                  return (
                    <View key={i} style={RowStyle}>
                      <Text style={[s.tableCell, { flex: 1.4, textAlign: 'left' }]}>{d.date}</Text>
                      <Text style={s.tableCell}>{d.dayName}요일</Text>
                      <Text style={s.tableCell}>{d.startTime}</Text>
                      <Text style={s.tableCell}>{d.endTime}</Text>
                      <Text style={s.tableCellLast}>{breakStr}</Text>
                    </View>
                  )
                })}
              </View>
              <Text style={[s.note, { marginTop: 2 }]}>※ 총 {p.specificWorkDates!.length}일 근무 / 총 {totalSpecificHours}시간</Text>
            </>
          ) : days.length > 0 ? (
            <View style={s.table}>
              <View style={[s.tableRow, s.tableHeader]}>
                <Text style={s.tableLabelCell}></Text>
                {days.map((d, i) => (
                  <Text key={i} style={i === days.length - 1 ? s.tableCellLast : s.tableCell}>
                    ({d.day})요일
                  </Text>
                ))}
              </View>
              <View style={s.tableRow}>
                <Text style={s.tableLabelCell}>근로시간</Text>
                {days.map((d, i) => {
                  const net = calcNetHours(d)
                  return (
                    <Text key={i} style={i === days.length - 1 ? s.tableCellLast : s.tableCell}>
                      {net > 0 ? `${net}시간` : '-'}
                    </Text>
                  )
                })}
              </View>
              <View style={s.tableRow}>
                <Text style={s.tableLabelCell}>시업</Text>
                {days.map((d, i) => (
                  <Text key={i} style={i === days.length - 1 ? s.tableCellLast : s.tableCell}>
                    {d.startTime || '-'}
                  </Text>
                ))}
              </View>
              <View style={s.tableRow}>
                <Text style={s.tableLabelCell}>종업</Text>
                {days.map((d, i) => (
                  <Text key={i} style={i === days.length - 1 ? s.tableCellLast : s.tableCell}>
                    {d.endTime || '-'}
                  </Text>
                ))}
              </View>
              <View style={s.tableRowLast}>
                <Text style={s.tableLabelCell}>휴게시간</Text>
                {days.map((d, i) => (
                  <Text key={i} style={i === days.length - 1 ? s.tableCellLast : s.tableCell}>
                    {d.breakStart && d.breakEnd ? `${d.breakStart}~${d.breakEnd}` : '-'}
                  </Text>
                ))}
              </View>
            </View>
          ) : (
            <Text style={s.clauseText}>근로일 및 시간은 별도 협의에 따름</Text>
          )}
          {!p.specificWorkDates && days.length > 0 && (
            <View style={s.row}>
              <Text>  ○ 주간 총 근로시간 : </Text>
              <Text style={{ fontFamily: F, fontWeight: 'bold' }}>{totalWeeklyHours}시간</Text>
            </View>
          )}
          <View style={s.row}>
            <Text>  ○ 주휴일 : </Text>
            {p.weeklyHolidayDay
              ? <><Text>매주 </Text><Underline value={p.weeklyHolidayDay} width={24} /><Text>요일</Text></>
              : <Text>없음</Text>
            }
          </View>
        </View>

        {/* 5. 임금 */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>5. 임  금</Text>
          <View style={[s.bullet, s.row]}>
            <Text>- 시간(일, 월)급 : </Text>
            <Underline value={p.hourlyRate > 0 ? `${p.hourlyRate.toLocaleString('ko-KR')}` : ''} width={80} />
            <Text>원(해당사항에 ○표)</Text>
            {p.includesHolidayPay && (
              <Text style={{ marginLeft: 6, fontSize: 7.5, color: '#059669' }}> ※ 주휴수당 포함</Text>
            )}
          </View>
          <View style={[s.bullet, s.row]}>
            <Text>- 상여금 : 있음 ( {p.hasBonus ? '○' : ' '} ) </Text>
            <Underline value={p.hasBonus && p.bonusAmount ? p.bonusAmount.toLocaleString('ko-KR') : ''} width={60} />
            <Text>원,  없음 ( {!p.hasBonus ? '○' : ' '} )</Text>
          </View>
          <View style={[s.bullet, s.row]}>
            <Text>- 기타급여(제수당 등) : 있음 : </Text>
            <Underline value={p.hasOtherAllowance && p.otherAllowanceAmount ? p.otherAllowanceAmount.toLocaleString('ko-KR') : ''} width={50} />
            <Text>원(내역별 기재), 없음 ( {!p.hasOtherAllowance ? '○' : ' '} )</Text>
          </View>
          <View style={[s.bullet, s.row]}>
            <Text>- 초과근로에 대한 가산임금률 : </Text>
            <Underline value={String(p.overtimeRate || 50)} width={24} />
            <Text> %</Text>
          </View>
          <Text style={s.note}>
            ※ 단시간근로자와 사용자 사이에 근로하기로 정한 시간을 초과하여 근로하면 법정 근로시간 내라도{'\n'}
               통상임금의 100분의 50%이상의 가산임금 지급(&apos;14.9.19. 시행)
          </Text>
          <View style={[s.bullet, s.row]}>
            <Text>- 임금지급일 : 매월(매주 또는 매일) </Text>
            <Underline value={p.paymentDay} width={24} />
            <Text>일(휴일의 경우는 전일 지급)</Text>
          </View>
          <View style={[s.bullet, s.row]}>
            <Text>- 지급방법 : 근로자에게 직접지급( {p.paymentDirect ? '○' : ' '} ),  근로자 명의 예금통장에 입금( {p.paymentTransfer ? '○' : ' '} )</Text>
          </View>
          {specificDates.length > 0 && totalSpecificHours > 0 && (
            <View style={[s.bullet, s.row]}>
              <Text>- 계약기간 총 예상 급여 : {totalSpecificHours}시간 × {p.hourlyRate.toLocaleString('ko-KR')}원 = </Text>
              <Text style={{ fontFamily: F, fontWeight: 'bold' }}>{Math.round(totalSpecificHours * p.hourlyRate).toLocaleString('ko-KR')}원</Text>
            </View>
          )}
          {specificDates.length === 0 && days.length > 0 && (
            <View style={[s.bullet, s.row]}>
              <Text>- 최종 예상 지급임금(주 단위) : {totalWeeklyHours}시간 × {p.hourlyRate.toLocaleString('ko-KR')}원 = </Text>
              <Text style={{ fontFamily: F, fontWeight: 'bold' }}>{Math.round(totalWeeklyHours * p.hourlyRate).toLocaleString('ko-KR')}원</Text>
            </View>
          )}
        </View>

        {/* 6. 연차유급휴가 */}
        <View style={s.section}>
          <View style={s.row}>
            <Text style={s.sectionLabel}>6. 연차유급휴가: </Text>
            <Text>통상근로자의 근로시간에 비례하여 연차유급휴가 부여</Text>
          </View>
        </View>

        {/* 7. 사회보험 */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>7. 사회보험 적용여부(해당란에 체크)</Text>
          <View style={s.checkRow}>
            <CheckBox checked={p.insuranceEmployment} label='고용보험' />
            <CheckBox checked={p.insuranceIndustrial} label='산재보험' />
            <CheckBox checked={p.insurancePension} label='국민연금' />
            <CheckBox checked={p.insuranceHealth} label='건강보험' />
          </View>
        </View>

        {/* 8. 근로계약서 교부 */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>8. 근로계약서 교부</Text>
          <Text style={s.clauseText}>
            - &quot;사업주&quot;는 근로계약을 체결함과 동시에 본 계약서를 사본하여 &quot;근로자&quot;의 교부요구와 관계없이 &quot;근로자&quot;에게 교부함(근로기준법 제17조 이행)
          </Text>
        </View>

        {/* 9. 성실한 이행의무 */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>9. 근로계약, 취업규칙 등의 성실한 이행의무</Text>
          <Text style={s.clauseText}>
            - 사업주와 근로자는 각자가 근로계약, 취업규칙, 단체협약을 지키고 성실하게 이행하여야 함
          </Text>
        </View>

        {/* 10. 기타 */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>10. 기  타</Text>
          <Text style={s.clauseText}>- 이 계약에 정함이 없는 사항은 근로기준법령에 의함</Text>
        </View>

        {/* 특약사항 */}
        {p.specialTerms ? (
          <View style={s.section}>
            <Text style={s.sectionLabel}>특  약  사  항</Text>
            <Text style={[s.clauseText, { marginTop: 3 }]}>{p.specialTerms}</Text>
          </View>
        ) : null}

        <View style={s.divider} />

        {/* 서명 */}
        <View style={s.signSection}>
          <Text style={s.signDate}>{todayStr(p.issueDate)}</Text>

          {/* 사업주 */}
          <View style={s.signParty}>
            <View style={s.signRow}>
              <Text style={{ fontFamily: F, fontWeight: 'bold', width: 48 }}>(사업주)</Text>
              <Text style={{ width: 48 }}>사업체명 :</Text>
              <Underline value={p.employerName} width={120} />
              <Text>  (전화 : </Text>
              <Underline value={p.employerPhone} width={80} />
              <Text>)</Text>
            </View>
            <View style={[s.signRow, { marginLeft: 48 }]}>
              <Text style={{ width: 48 }}>주    소 :</Text>
              <Underline value={p.employerAddress} width={200} />
            </View>
            <View style={[s.signRow, { marginLeft: 48, alignItems: 'center' }]}>
              <Text style={{ width: 48 }}>대 표 자 :</Text>
              <Underline value={p.employerRepresentative} width={80} />
              <Text>  (서명)</Text>
              {p.employerSignatureBase64 && (
                // react-pdf의 Image는 DOM <img>가 아니라 alt prop이 없음
                // eslint-disable-next-line jsx-a11y/alt-text
                <Image src={p.employerSignatureBase64} style={s.signImg} />
              )}
            </View>
          </View>

          {/* 근로자 */}
          <View style={s.signParty}>
            <View style={s.signRow}>
              <Text style={{ fontFamily: F, fontWeight: 'bold', width: 48 }}>(근로자)</Text>
              <Text style={{ width: 48 }}>주    소 :</Text>
              <Underline value={p.workerAddress ?? ''} width={200} />
            </View>
            <View style={[s.signRow, { marginLeft: 48 }]}>
              <Text style={{ width: 48 }}>연 락 처 :</Text>
              <Underline value={p.workerPhone ?? ''} width={120} />
            </View>
            <View style={[s.signRow, { marginLeft: 48, alignItems: 'center' }]}>
              <Text style={{ width: 48 }}>성    명 :</Text>
              <Underline value={p.workerName} width={80} />
              <Text>  (서명)</Text>
              {p.workerSignatureBase64 && (
                // react-pdf의 Image는 DOM <img>가 아니라 alt prop이 없음
                // eslint-disable-next-line jsx-a11y/alt-text
                <Image src={p.workerSignatureBase64} style={s.signImg} />
              )}
            </View>
          </View>
        </View>

      </Page>
    </Document>
  )
}
