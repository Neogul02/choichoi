'use client'

import { Document, Page, Text, View, Font, StyleSheet } from '@react-pdf/renderer'
import path from 'path'
import type { WeeklyRosterEntry } from '@/app/actions/roster'
import { parseDate, formatPhone } from '@/lib/date'

Font.register({
  family: 'NotoSansKR',
  src:
    typeof window === 'undefined'
      ? path.join(process.cwd(), 'public', 'fonts', 'NotoSansKR-Regular.ttf')
      : '/fonts/NotoSansKR-Regular.ttf',
})

const F = 'NotoSansKR'

const s = StyleSheet.create({
  page: { fontFamily: F, fontSize: 8, padding: 30, color: '#111', lineHeight: 1.5 },
  title: { fontSize: 14, fontFamily: F, marginBottom: 3 },
  subtitle: { fontSize: 9, color: '#555', marginBottom: 16 },
  daySection: { marginBottom: 22 },
  dayHeader: { paddingVertical: 4, paddingHorizontal: 0, marginBottom: 4, borderBottom: '1.5px solid #111' },
  dayHeaderText: { color: '#111', fontSize: 10, fontFamily: F },
  table: { border: '1px solid #d1d5db' },
  thead: { flexDirection: 'row', backgroundColor: '#f3f4f6', borderBottom: '1px solid #d1d5db' },
  trow: { flexDirection: 'row', borderBottom: '1px solid #e5e7eb' },
  trowLast: { flexDirection: 'row' },
  cPart: { width: '12%', padding: '3 5', borderRight: '1px solid #d1d5db' },
  cName: { width: '13%', padding: '3 5', borderRight: '1px solid #d1d5db' },
  cTime: { width: '11%', padding: '3 5', borderRight: '1px solid #d1d5db', textAlign: 'center' },
  cPhone: { width: '18%', padding: '3 5', borderRight: '1px solid #d1d5db', textAlign: 'center' },
  cSign: { width: '13%', padding: '3 5', textAlign: 'center' },
  hText: { fontFamily: F, textAlign: 'center', fontSize: 7.5 },
  signLabel: { fontSize: 6.5, color: '#aaa', marginBottom: 8 },
  empty: { fontSize: 9, color: '#888', textAlign: 'center', marginTop: 40 },
  footer: { position: 'absolute', bottom: 18, right: 30 },
  footerText: { fontSize: 7, color: '#aaa' },
})

const DAY_KR = ['일', '월', '화', '수', '목', '금', '토']

function dayLabel(dateStr: string) {
  const d = parseDate(dateStr)
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DAY_KR[d.getDay()]}요일)`
}

export function WeeklyRosterDocument({ weekLabel, entries }: { weekLabel: string; entries: WeeklyRosterEntry[] }) {
  const grouped = entries.reduce<Record<string, WeeklyRosterEntry[]>>((acc, e) => {
    ;(acc[e.work_date] ??= []).push(e)
    return acc
  }, {})
  const days = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b))

  return (
    <Document title={`주간 근무표 ${weekLabel}`}>
      <Page size="A4" style={s.page}>
        <Text style={s.title}>주간 근무표</Text>
        <Text style={s.subtitle}>{weekLabel}</Text>

        {days.length === 0 && (
          <Text style={s.empty}>이 주에 배정된 근무자가 없습니다.</Text>
        )}

        {days.map(([date, list]) => (
          <View key={date} style={s.daySection} wrap={false}>
            <View style={s.dayHeader}>
              <Text style={s.dayHeaderText}>{dayLabel(date)}</Text>
            </View>
            <View style={s.table}>
              <View style={s.thead}>
                <Text style={[s.cPart, s.hText]}>파트</Text>
                <Text style={[s.cName, s.hText]}>이름</Text>
                <Text style={[s.cTime, s.hText]}>예정 출근</Text>
                <Text style={[s.cTime, s.hText]}>실 출근</Text>
                <Text style={[s.cTime, s.hText]}>예정 퇴근</Text>
                <Text style={[s.cTime, s.hText]}>실 퇴근</Text>
                <Text style={[s.cPhone, s.hText]}>연락처</Text>
                <Text style={[s.cSign, s.hText]}>확인 (서명)</Text>
              </View>
              {list.map((e, i) => (
                <View key={i} style={i === list.length - 1 ? s.trowLast : s.trow} wrap={false}>
                  <Text style={s.cPart}>{e.shift_name}</Text>
                  <Text style={s.cName}>{e.name}</Text>
                  <Text style={s.cTime}>{e.start_time}</Text>
                  <Text style={s.cTime}> </Text>
                  <Text style={s.cTime}>{e.end_time}</Text>
                  <Text style={s.cTime}> </Text>
                  <Text style={s.cPhone}>{formatPhone(e.phone ?? '')}</Text>
                  <View style={s.cSign}>
                    <Text style={s.signLabel}>사인:</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ))}

        <View style={s.footer} fixed>
          <Text
            style={s.footerText}
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  )
}
