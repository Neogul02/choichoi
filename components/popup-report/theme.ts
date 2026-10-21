import { StyleSheet, Font } from '@react-pdf/renderer'
import type { View } from '@react-pdf/renderer'
import type React from 'react'
import path from 'path'

function fontPath(file: string) {
  return typeof window === 'undefined'
    ? path.join(process.cwd(), 'public', 'fonts', file)
    : `/fonts/${file}`
}

Font.register({
  family: 'Pretendard',
  fonts: [
    { src: fontPath('Pretendard-Regular.ttf'), fontWeight: 400 },
    { src: fontPath('Pretendard-Medium.ttf'), fontWeight: 500 },
    { src: fontPath('Pretendard-SemiBold.ttf'), fontWeight: 600 },
    { src: fontPath('Pretendard-Bold.ttf'), fontWeight: 700 },
    { src: fontPath('Pretendard-ExtraBold.ttf'), fontWeight: 800 },
  ],
})

export const F = 'Pretendard'

/** react-pdf가 Style 타입을 재노출하지 않아 View의 style prop 타입을 그대로 빌려 쓴다 */
export type PdfStyle = NonNullable<React.ComponentProps<typeof View>['style']>

// ── 브랜드 팔레트 — choichoi 초록(primary-700) 기반, 차트는 가독성 위해 조금 더 밝은 톤 사용 ──
export const BRAND = '#084431'
export const ACCENT = '#1f9d63'
export const ACCENT_TINT = '#eaf6f0'
export const ACCENT_BORDER = '#c9ecdb'
export const AMBER = '#f59e0b'
export const SKY = '#0ea5e9'
export const INK = '#161a18'
export const INK_MUTED = '#6b7570'
export const INK_FAINT = '#9aa39d'
export const BORDER = '#e6e9e6'
export const ROW_ZEBRA = '#f8faf9'
export const UP = '#1f9d63'
export const DOWN = '#e34948'

// ── 치수 — A4(595×842pt) 기준. 본문은 흐름 레이아웃이라 카드 높이 합으로 페이지가 나뉜다 ──
export const PAGE_W = 595
export const PAGE_PAD_X = 40
export const CONTENT_W = PAGE_W - PAGE_PAD_X * 2 // 515
export const GUTTER = 12
export const CARD_PAD = 14
const CARD_INNER = (outer: number) => outer - CARD_PAD * 2 - 2 // 좌우 테두리 1pt씩
export const HALF_W = (CONTENT_W - GUTTER) / 2
export const CHART_W_FULL = CARD_INNER(CONTENT_W) // ≈ 485
export const CHART_W_HALF = CARD_INNER(HALF_W) // ≈ 221
export const CHART_H_FULL = 170
export const CHART_H_HALF = 140
/** onePerPage(1차트 1페이지) 모드의 큼직한 차트 높이 */
export const CHART_H_LARGE = 250

export const s = StyleSheet.create({
  // 표지는 기존 여백 그대로, 본문은 상단 러닝 헤더 자리를 비워 둔다
  page: { fontFamily: F, fontWeight: 400, fontSize: 10, padding: PAGE_PAD_X, paddingBottom: 52, color: INK, lineHeight: 1.55 },
  bodyPage: { fontFamily: F, fontWeight: 400, fontSize: 10, paddingTop: 50, paddingBottom: 52, paddingHorizontal: PAGE_PAD_X, color: INK, lineHeight: 1.55 },

  // 표지 헤더
  eyebrow: { fontSize: 9, fontWeight: 700, color: ACCENT, letterSpacing: 1.2, marginBottom: 6 },
  h1: { fontSize: 25, fontWeight: 800, color: INK, marginBottom: 6, lineHeight: 1.25 },
  headerMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerMeta: { fontSize: 10, color: INK_MUTED, fontWeight: 500 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 14, paddingBottom: 14, borderBottom: `2.5px solid ${BRAND}` },
  statusBadge: { fontSize: 8, fontWeight: 700, paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 8 },
  generatedAt: { fontSize: 8, color: INK_FAINT, fontWeight: 500, textAlign: 'right' },

  // 본문 러닝 헤더 — 매 페이지 상단 한 줄
  runningHeader: { position: 'absolute', top: 20, left: PAGE_PAD_X, right: PAGE_PAD_X, flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 5, borderBottom: `0.5px solid ${BORDER}` },
  runningTitle: { fontSize: 8.5, fontWeight: 700, color: BRAND },
  runningMeta: { fontSize: 8, color: INK_FAINT, fontWeight: 500 },

  // 1차트 1페이지 모드용 페이지 제목
  pageH1: { fontSize: 17, fontWeight: 800, color: INK, marginBottom: 12, paddingBottom: 10, borderBottom: `1px solid ${BORDER}` },

  // 카드
  row: { flexDirection: 'row', gap: GUTTER, marginBottom: GUTTER },
  card: { backgroundColor: '#ffffff', border: `1px solid ${BORDER}`, borderRadius: 10, padding: CARD_PAD },
  cardFlow: { backgroundColor: '#ffffff', border: `1px solid ${BORDER}`, borderRadius: 10, padding: CARD_PAD, marginBottom: GUTTER },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 9 },
  cardAccentBar: { width: 3.5, height: 12, borderRadius: 2, backgroundColor: ACCENT, marginRight: 7 },
  cardTitle: { fontSize: 11.5, fontWeight: 700, color: INK },
  cardTitleRight: { fontSize: 7.5, color: INK_FAINT, fontWeight: 500, textAlign: 'right' },

  // 운영 진행률
  progressPctText: { fontSize: 18, fontWeight: 800, color: ACCENT },
  progressTrack: { height: 8, backgroundColor: '#eef2ef', borderRadius: 4, marginTop: 7, marginBottom: 6, overflow: 'hidden' },
  progressFill: { height: 8, backgroundColor: ACCENT, borderRadius: 4 },
  progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressFootRow: { flexDirection: 'row', justifyContent: 'space-between' },
  progressFootText: { fontSize: 9, color: INK_MUTED, fontWeight: 500 },

  // KPI 타일
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kpiTile: { width: '23.8%', height: 64, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 9 },
  kpiTileAccent: { width: '23.8%', height: 64, borderRadius: 8, padding: 9, backgroundColor: ACCENT_TINT, border: `1px solid ${ACCENT_BORDER}` },
  kpiLabel: { fontSize: 8, color: INK_MUTED, fontWeight: 600, marginBottom: 3 },
  kpiValue: { fontSize: 13.5, fontWeight: 800, color: INK, lineHeight: 1.25 },
  kpiValueAccent: { fontSize: 14, fontWeight: 800, color: ACCENT, lineHeight: 1.25 },
  kpiSub: { fontSize: 7.5, color: INK_FAINT, marginTop: 2, fontWeight: 500 },

  // 인사이트
  insightRow: { flexDirection: 'row', marginBottom: 5 },
  insightBullet: { width: 14, height: 14, borderRadius: 7, backgroundColor: ACCENT_TINT, marginRight: 7, alignItems: 'center', justifyContent: 'center' },
  insightBulletText: { fontSize: 7.5, fontWeight: 800, color: ACCENT, lineHeight: 1 },
  insightText: { flex: 1, fontSize: 9.5, color: INK, lineHeight: 1.5 },

  note: { fontSize: 7.5, color: INK_FAINT, marginTop: 6, fontWeight: 500 },
  legendRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  legendDot: { width: 7, height: 7, borderRadius: 3.5, marginRight: 6 },
  legendName: { fontSize: 8.5, flex: 1, fontWeight: 500, color: INK },
  legendValue: { fontSize: 8.5, color: INK_MUTED, fontWeight: 600 },

  table: { border: `1px solid ${BORDER}`, borderRadius: 6, overflow: 'hidden' },
  thead: { flexDirection: 'row', backgroundColor: ACCENT_TINT },
  trow: { flexDirection: 'row', borderTop: `0.5px solid ${BORDER}` },
  th: { paddingVertical: 4, paddingHorizontal: 4, fontSize: 7.5, fontWeight: 700, color: BRAND, textAlign: 'center', lineHeight: 1.3 },
  td: { paddingVertical: 2.5, paddingHorizontal: 4, fontSize: 8, textAlign: 'center', fontWeight: 400, lineHeight: 1.3 },

  noteParagraph: { fontSize: 9.5, color: INK, lineHeight: 1.7, marginBottom: 6 },
  textAttach: { marginTop: 9, paddingTop: 8, borderTop: `0.5px dashed ${BORDER}` },

  calWeekHeader: { flexDirection: 'row', gap: 3, marginBottom: 3 },
  calWeekHeaderCell: { flex: 1, textAlign: 'center', fontSize: 7.5, fontWeight: 700 },
  calWeekRow: { flexDirection: 'row', gap: 3, marginBottom: 3 },
  calCell: { flex: 1, minHeight: 30, borderRadius: 5, border: `1px solid ${BORDER}`, padding: 2, alignItems: 'center', justifyContent: 'center' },
  calDayNum: { fontSize: 8, fontWeight: 700 },
  calDayRevenue: { fontSize: 7, color: INK_MUTED, marginTop: 1, fontWeight: 500 },

  // 비교·지표 미니 카드
  statLabel: { fontSize: 7.5, color: INK_MUTED, fontWeight: 600 },
  statValue: { fontSize: 12, fontWeight: 800, color: INK },
  statSub: { fontSize: 7.5, color: INK_FAINT, fontWeight: 500 },

  footer: { position: 'absolute', bottom: 22, left: PAGE_PAD_X, right: PAGE_PAD_X, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 7, borderTop: `0.5px solid ${BORDER}` },
  footerBrand: { fontSize: 8, fontWeight: 700, color: BRAND },
  footerText: { fontSize: 7.5, color: INK_FAINT, fontWeight: 500 },
})

/** 0~1 비율로 두 hex 색 사이를 보간 — 히트맵 농도용 (SVG fillOpacity는 react-pdf 백엔드에서 불안정) */
export function mixHex(from: string, to: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const a = p(from)
  const b = p(to)
  const k = Math.max(0, Math.min(1, t))
  return `#${a.map((v, i) => Math.round(v + (b[i] - v) * k).toString(16).padStart(2, '0')).join('')}`
}
