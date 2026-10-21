# 팝업 매출 분석 보고서(PDF) 고도화 계획

> 2026-10-21 수립. 대상: `components/PopupReportDocument.tsx`(react-pdf 문서) · `app/(admin)/stats/_components/PopupReportModal.tsx`(편집·미리보기 모달) · `app/(admin)/stats/_components/PopupStatsSection.tsx`(`reportData` 생성).
> 목표 두 가지: **① 페이지를 가득 채우는 레이아웃** — 지금은 차트·표 하나가 한 페이지를 통째로 차지해 여백이 과하다. **② PDF에 담을 수 있는 그래프·정보 확대** — 화면에는 있는데 PDF에는 없는 지표, 이미 계산해 두고 안 쓰는 값, 기존 데이터만으로 새로 뽑을 수 있는 분석을 추가한다.

---

## 진행 현황 (2026-10-21)

| 단계 | 상태 | 비고 |
|---|---|---|
| P0 레이아웃 | ✅ 완료 | 흐름 레이아웃 + 2단 그리드, 러닝 헤더, 섹션 폭(½/전체), 레이아웃 모드 3종, 표지 보강(상태 배지·생성 일시·예상 총매출·스파크라인), 예상 페이지 수 |
| P1 기존 데이터 블록 | ✅ 완료 | A군 11종 + 표지 인사이트·하이라이트 타일, 추천 구성, 추가 목록 그룹화 |
| P2 추가 조회 | ⏳ 미착수 | `popupBenchmark` · `laborEfficiency` · `menuDailyTrend` |
| P3 마감 | ⏳ 미착수 | 목차, 용어 부록 |

**측정 결과** (샘플 데이터, 표지 포함 페이지 수):

| 운영일 | 기존(차트 7종) | 신규 컴팩트 · 같은 7종 | 신규 컴팩트 · 기본 14종 |
|---|---|---|---|
| 7일 | 8 | 3 | 4 |
| 14일(진행중) | 8 | 3 | 5 |
| 30일 | 9 | 4 | 5 |
| 45일 | 10 | 5 | 6 |

**계획 대비 변경점**
- 집계 순수 함수는 `app/(admin)/stats/_lib/`가 아니라 `lib/reportMetrics.ts`·`lib/reportLayout.ts`에 뒀다 — vitest가 `lib/**/*.test.ts`만 수집한다.
- 집계 결과를 `PopupReportData`에 미리 넣지 않고 PDF 섹션이 `lib/reportMetrics`를 호출한다. 입력은 화면과 같은 `dailySales`·`hourly`·`menuBreakdown`이라 숫자가 어긋나지 않고, 데이터 타입이 불어나지 않는다. `PopupReportData`에는 히트맵용 `dayHour`, `layout`, `showInsights`만 추가했다.
- 일별 상세표의 헤더 반복은 "최대 50일 단위 2단 블록마다 헤더"로 구현했다(react-pdf `fixed`는 페이지 전체에 고정돼 표 헤더용으로 쓸 수 없음). 12일 이하는 1단 표.
- 페이지 수는 pdf.js 대신 react-pdf 출력의 페이지 객체(`/Type /Page`)를 세서 얻는다.

---

## 1. 현황 진단

### 1-1. 레이아웃 — "섹션 1개 = 페이지 1장"

- `PopupReportDocument`는 본문을 차트 섹션 단위 `PageGroup`으로 묶고 **그룹마다 `<Page>`를 새로 연다**(`PopupReportDocument.tsx:604-626`).
- A4 = 595×842pt, 패딩 40 → 본문 영역 약 515×762pt. 여기서 페이지 헤더(eyebrow + `pageH1` + 구분선) ≈ 60pt, 푸터 ≈ 30pt를 빼면 **차트에 쓸 수 있는 높이는 ≈ 670pt**인데 실제 차트 카드는 높이 200~250pt(+카드 헤더·주석 ≈ 290pt)라 **페이지의 55~60%가 빈 공간**이다.
- 기본 구성(차트 7종)이면 표지 1장 + 본문 7장 = **8페이지**. 내용 대비 분량이 2배 이상 부풀어 있다.
- 표지(1페이지)도 진행률 카드 + KPI 8칸(78pt × 3줄)뿐이라 **하단 40% 가량이 비어 있다.**
- 반대로 `dailyTable`은 운영일이 30일을 넘으면 한 카드가 페이지를 넘어가는데, 표 헤더가 다음 페이지에 반복되지 않는다.

### 1-2. 정보 — 계산해 놓고 안 쓰거나, 화면에는 있는데 PDF엔 없는 것

| 항목 | 위치 | PDF 반영 |
|---|---|---|
| `projectedTotal`(진행중 팝업 예상 총매출) | `PopupReportData` 필드로 전달됨 | **미사용** |
| `generatedAt`(생성 일시) | 동일 | **미사용** |
| 일별 객단가 추이(`aovTrendData`) | 화면 `ChartCard "일별 객단가 추이"` | 없음 |
| 요일 × 시간대 판매 현황(`buildDayHourMatrix`) | 화면 히트맵 | 없음 |
| 일별 주문 건수 | 화면 metric 토글 | 없음(표에만 숫자) |
| 메뉴별 판매 수량 순위 | 화면 메뉴 막대 | 도넛 범례 텍스트로만 |
| 팝업 간 비교(`usePopupComparison`) | 화면 `PopupComparisonSection` | 없음 |
| 팝업 인건비(`fetchPopupPayroll`) | HR 급여 탭 | 없음 |

---

## 2. 목표·완료 기준

| # | 기준 | 측정 |
|---|---|---|
| G1 | 기본 구성(현행 차트 7종) 보고서가 **8페이지 → 4페이지 이하** | 샘플 데이터(운영 14일·30일 두 케이스)로 생성한 PDF 페이지 수 |
| G2 | 표지 포함 **모든 페이지의 본문 채움률 ≥ 75%** (마지막 페이지 제외) | 페이지 PNG 렌더 후 육안/스크린샷 비교 |
| G3 | 카드가 페이지 경계에서 **잘리지 않음** (표는 행 단위로 넘어가며 헤더 반복) | 운영 45일 케이스로 확인 |
| G4 | 신규 차트·정보 블록 **10종 이상** 선택 가능 | 모달 "차트 추가" 목록 |
| G5 | 기존 사용자 편집 흐름(제목·순서·텍스트 블록·라이브 미리보기) **그대로 동작** | 수동 회귀 |
| G6 | 모든 신규 집계는 순수 함수 + vitest | `yarn test` |

---

## 3. 설계

### 3-1. 레이아웃 엔진: 페이지 단위 → **흐름(flow) 레이아웃 + 2단 그리드**

**핵심 변경:** 본문 전체를 `<Page wrap>` **하나**에 흘려 넣고, 페이지 나눔은 react-pdf의 자동 분할에 맡긴다.

```
Page(본문, wrap)
 ├─ RunningHeader (fixed)   ← 매 페이지 상단: 팝업명 · 기간 (얇은 한 줄)
 ├─ Row (wrap=false)        ← 섹션 폭에 따라 1단 또는 2단
 │   ├─ Card[half]  일별 매출
 │   └─ Card[half]  누적 매출
 ├─ Card[full]  요일×시간대 히트맵
 │   └─ (뒤에 붙은 텍스트 블록은 같은 카드 하단에 포함)
 ├─ Row  [half 요일별] [half 시간대별]
 ├─ Table (wrap=true, 헤더 반복)
 └─ PageFooter (fixed)
```

1. **섹션 폭 속성 추가** — `ReportSection`의 chart 변형에 `width?: 'full' | 'half'`를 추가한다(옵셔널 → 기존 상태와 호환). 차트 종류별 기본값을 `REPORT_CHART_DEFAULTS`로 둔다.
   - half 기본: 요일별, 시간대별, 메뉴 도넛, 객단가 추이, 주중/주말 비교, KPI 미니 카드류
   - full 기본: 일별 매출(30일 이상일 때), 히트맵, 일별 상세표, 캘린더, 주차별 요약표
2. **행 패킹** — 섹션 배열을 순서대로 훑으며 연속된 `half` 두 개를 한 `Row`로 묶는다. 짝이 없는 half는 단독 행에서 full로 늘리지 않고 **왼쪽 정렬 + 우측에 다음 half를 당겨오지 않는다**(순서 보존이 우선). 텍스트 블록은 바로 앞 차트 카드의 하단에 포함시켜 "차트 + 해설"이 한 덩어리로 움직이게 한다(현행 규칙 유지).
3. **치수 체계** — 매직 넘버(`CHART_W = 483`)를 레이아웃 상수로 정리한다.
   - `CONTENT_W = 515`, `GUTTER = 12`, `CARD_PAD = 14`
   - full 차트 폭 = `CONTENT_W - CARD_PAD*2 - 2` ≈ 485, half 차트 폭 = `(CONTENT_W - GUTTER)/2 - CARD_PAD*2 - 2` ≈ 221
   - 차트 높이: full 170~190, half 140~150 (현재 200~250 → 축소해도 판독성 유지되는지 샘플로 확인)
4. **절반 폭 대응 차트 프리미티브** — `BarChart`/`LineChart`의 `labelStride`·값 라벨 표시 기준을 데이터 개수가 아니라 **막대 폭(px)** 으로 판단하도록 바꾼다(`barW > 10`은 이미 일부 반영). 축 라벨 폰트 8 → half에서 7.
5. **카드 분할 안전장치** — `wrap={false}` 카드는 한 페이지보다 크면 무한히 다음 페이지로 밀린다. 카드 최대 높이를 레이아웃 상수로 제한하고(차트 높이 상한 + 텍스트 블록은 카드 밖으로 분리하는 fallback), 텍스트가 매우 긴 경우에만 텍스트 블록을 별도 `wrap` 카드로 분리한다. 섹션 제목이 페이지 맨 아래에 홀로 남지 않도록 `minPresenceAhead`를 준다.
6. **표 페이지 분할** — `dailyTable`은 `wrap`을 허용하고 헤더 행에 react-pdf의 `fixed`를 쓰지 않는 대신(페이지 전체에 고정돼 버림), **행을 페이지 용량(≈ 28행) 단위로 청크**해 청크마다 헤더를 다시 그린다. 운영 20일 이하면 **2단 표**(좌: 1~N/2일, 우: 나머지)로 접어 반 페이지에 맞춘다.
7. **페이지 헤더 축소** — 섹션마다 있던 `pageEyebrow + pageH1`(≈ 60pt)을 없애고, 카드 내부의 `CardHeader`가 제목 역할을 한다. 매 페이지 상단에는 `fixed` 러닝 헤더 한 줄(팝업명 · 기간, 9pt)만 둔다.
8. **레이아웃 모드(모달 옵션)** — `layout: 'compact' | 'standard' | 'onePerPage'`
   - `compact`(기본): 위 흐름 + 2단
   - `standard`: 흐름만, 전부 full 폭
   - `onePerPage`: 현행 방식 유지(발표용으로 쓰던 사용자 대비 탈출구)

### 3-2. 표지(1페이지) 채우기 — "한 장 요약(Executive Summary)"

현재 진행률 + KPI 8칸 아래에 다음을 추가해 표지 한 장만 봐도 결론이 나오게 한다.

1. **헤더 메타 보강** — 기간 옆에 상태 배지(예정/진행중/종료), 우측에 `generatedAt`("2026.10.21 14:30 생성").
2. **진행중이면 예상 총매출** — `projectedTotal`을 진행률 카드 안에 "현재 페이스 유지 시 예상 총매출 ₩…"로 표시(이미 계산돼 있음).
3. **일별 매출 스파크라인** — KPI 아래 full 폭, 높이 60pt. 최고/최저일 점 강조.
4. **핵심 인사이트 5줄(자동 생성)** — 순수 함수 `buildReportInsights(data)`가 규칙 기반으로 문장을 만든다. 예:
   - "토요일 평균 매출이 평일 평균보다 **42% 높습니다**."
   - "매출 피크는 **14~16시**로 전체의 31%가 이 시간에 발생했습니다."
   - "상위 3개 메뉴가 매출의 **68%** 를 차지합니다 (아메리카노 · …)."
   - "최근 7일 일평균이 전체 일평균 대비 **+12%** 로 상승 추세입니다."
   - "판매가 없던 날이 **2일** 있습니다 (10/3, 10/9)."
   - 데이터가 부족한 규칙은 건너뛴다(문장 수 가변, 최대 5).
5. **표지 하단 미니 2단** — [상위 메뉴 Top 5 미니 표] [요일별 평균 미니 막대]. 본문에 같은 차트가 있으면 표지에서는 생략(중복 방지 옵션).

### 3-3. 추가할 그래프·정보 블록

`ReportChartType`(현재 7종)에 아래를 추가한다. **A군은 지금 `PopupStatsSection`이 이미 들고 있는 데이터만으로 가능**하고, B군은 조회가 추가로 필요하다.

#### A군 — 기존 데이터로 바로 가능 (P1)

| 키 | 이름 | 형태 | 데이터 출처 | 기본 폭 |
|---|---|---|---|---|
| `aovTrend` | 일별 객단가 추이 | 라인 + 평균선 | `dailySales` (revenue/orderCount) | half |
| `dailyOrders` | 일별 주문 건수 | 막대 (또는 `dailyBar`에 주문 건수 라인 겹침 옵션) | `dailySales` | half |
| `dayHourHeatmap` | 요일 × 시간대 히트맵 | 7×13 셀 색 농도 + 셀 값 | `buildDayHourMatrix(popupRawOrders)` → `PopupReportData`에 `dayHourMatrix` 추가 | full |
| `menuRanking` | 메뉴 판매 순위표 | 표: 순위·메뉴·수량·매출·비중·누적비중 | `menuBreakdown` | full |
| `menuPareto` | 메뉴 ABC(파레토) 분석 | 막대(매출) + 누적 비중 라인, 80%/95% 경계로 A/B/C 등급 색 | `menuBreakdown` | full |
| `menuQuantity` | 메뉴별 판매 수량 | 가로 막대 | `menuBreakdown.totalQuantity` | half |
| `weekdayWeekend` | 주중 vs 주말 비교 | 2열 비교 카드: 일평균 매출·주문·객단가 + 차이(%) | `dailySales` | half |
| `weeklySummary` | 주차별 요약 | 표: 주차·기간·매출·주문·객단가·전주 대비 증감(▲▼) | `dailySales` | full |
| `peakHours` | 피크 시간대 Top 3 | KPI 카드 3개 + 시간대 누적 비중 바 | `hourly` | half |
| `revenueDistribution` | 일매출 분포·변동성 | 히스토그램 + 중앙값/표준편차/변동계수 | `dailySales` | half |
| `paceForecast` | 진행 페이스·예상 | 누적 실적 vs 예상 총매출 게이지 (진행중일 때만) | `projectedTotal`, `elapsedDays` | half |

> `cumulative`(누적)와 `paceForecast`는 의미가 겹치므로, 진행중 팝업에서만 `paceForecast`를 노출하고 종료 팝업에서는 추가 목록에서 숨긴다.

#### B군 — 추가 조회 필요 (P2)

| 키 | 이름 | 필요한 것 | 비고 |
|---|---|---|---|
| `popupBenchmark` | 다른 팝업 대비 성과 | 모달에서 비교 팝업 선택 → `usePopupComparison` 재사용 | 일평균 매출·객단가 순위, "전체 팝업 중 n위" 문구. 비교 대상 0개면 섹션 미렌더 |
| `laborEfficiency` | 인건비 대비 매출 | `fetchPopupPayroll(popupId)` | 인건비율(%), 근무 1시간당 매출. **급여 정보가 포함되므로 기본 비활성 + 추가 시 경고 문구**(외부 공유용 보고서에 섞이지 않게) |
| `menuDailyTrend` | 상위 메뉴 일별 추이 | 일자 × 메뉴 판매량 집계 액션(신규) | `fetchManualDailyMenuSalesForRange`는 수기 입력만 다루므로 POS 주문 기준 집계 액션 필요 |

#### 부록 (P3)

- **목차** — 보고서가 4페이지를 넘으면 표지 하단에 섹션 목록 + 페이지 번호(react-pdf `render`로 2-pass 계산 또는 섹션 순서만 표기).
- **용어·산식 설명** — 객단가, 운영일수 평균(경과일 기준), 페이스 등 정의를 마지막에 작게.

### 3-4. 모달(`PopupReportModal`) UX

1. **레이아웃 모드 선택** — 상단에 세그먼트 버튼: 컴팩트(2단) / 표준 / 1차트 1페이지.
2. **섹션 폭 토글** — 각 섹션 행에 `½ / 전체` 토글(차트만, compact 모드에서만 노출).
3. **차트 추가 목록 그룹화** — 칩이 18종 가까이 되므로 "매출 추이 / 시간·요일 / 메뉴 / 요약·표 / 비교(추가 조회)"로 묶는다. `chartAvailability`에 신규 키별 노출 조건 추가.
4. **추천 구성 버튼** — 현재 기본 섹션(7종)을 compact 기준 추천 세트(예: 일별·누적 / 히트맵 / 요일·시간대 / 메뉴 도넛·수량 / 메뉴 순위표 / 주차별 요약 / 상세표)로 리셋.
5. **표지 옵션** — 인사이트 표시 on/off, 표지 미니 차트 on/off.
6. **예상 페이지 수 표시** — `instance.blob`이 갱신될 때 `pdfjs-dist`(이미 의존성)로 페이지 수를 읽어 "총 N페이지"로 하단에 표시. 레이아웃 변경 효과가 바로 보이게.

### 3-5. 코드 구조

`PopupReportDocument.tsx`가 630줄이고 신규 차트가 붙으면 2천 줄을 넘는다. 다음처럼 쪼갠다.

```
components/popup-report/
  PopupReportDocument.tsx   # Document·Page·러닝헤더·푸터, 레이아웃 모드 분기
  layout.ts                 # 치수 상수, 섹션 → Row 패킹(순수 함수)
  theme.ts                  # BRAND/ACCENT 등 팔레트, StyleSheet
  primitives/               # BarChart, LineChart, DonutChart, Heatmap, Sparkline, Gauge, ChartLabel
  sections/                 # 섹션별 카드 컴포넌트 (DailyBarCard, HeatmapCard, MenuRankingCard …)
  CoverPage.tsx             # 표지 + 인사이트
  types.ts                  # PopupReportData, ReportSection, ReportChartType, LABELS, DEFAULTS
app/(admin)/stats/_lib/reportMetrics.ts       # 신규 집계 — 순수 함수
app/(admin)/stats/_lib/reportMetrics.test.ts
```

- `components/PopupReportDocument.tsx`는 `popup-report/`를 re-export하는 얇은 파일로 남겨 import 경로를 깨지 않는다(또는 import 2곳을 함께 수정). `components/AGENTS.md`의 표도 갱신.
- **집계를 컴포넌트 안에서 하지 않는다**(`components/AGENTS.md` 규칙). 주차별 요약, 주중/주말 분리, 파레토 등급, 분포 통계, 피크 시간, 인사이트 문장은 전부 `reportMetrics.ts`의 순수 함수로 두고 `PopupStatsSection`의 `reportData` useMemo에서 계산해 넘긴다. 요일 판정은 기존 `getDayOfWeekLabel`, 날짜는 `kstToday()`·`formatDateLabel`을 쓴다(타임존 밀림 방지).
- `PopupReportData` 확장 필드: `dayHourMatrix`, `weeklySummary`, `weekdayWeekend`, `menuPareto`, `revenueStats`, `peakHours`, `insights`, `layout`, `cover`(옵션). B군은 `benchmark?`, `labor?`로 옵셔널.

---

## 4. 실행 단계

### P0 — 레이아웃 (여백 문제 해결) · 우선

1. 치수 상수·테마 분리(`layout.ts`, `theme.ts`) — 동작 변경 없음.
2. 본문을 단일 `<Page wrap>` 흐름 레이아웃으로 전환, 러닝 헤더 도입, 섹션별 `pageH1` 제거.
3. `ReportSection.width` + 기본값 + 행 패킹 함수(+ 테스트: half 짝짓기, 텍스트 블록 부착, 홀수 half).
4. `BarChart`/`LineChart`/`DonutChart` half 폭 대응(라벨 간격·폰트), 캘린더·표 half/full 대응.
5. `dailyTable` 청크 분할 + 헤더 반복, 20일 이하 2단 표.
6. 표지: 상태 배지, `generatedAt`, `projectedTotal`, 스파크라인.
7. 모달: 레이아웃 모드 세그먼트, 섹션 폭 토글, 예상 페이지 수.
8. 검증: G1·G2·G3·G5.

### P1 — 기존 데이터로 그래프·정보 추가

1. `reportMetrics.ts` + 테스트: `buildWeeklySummary`, `splitWeekdayWeekend`, `buildMenuPareto`, `computeRevenueStats`, `findPeakHours`, `buildReportInsights`.
2. 프리미티브 추가: `Heatmap`, `Sparkline`, `Gauge`, `HorizontalBar`, `Histogram`.
3. A군 섹션 카드 11종 구현, `REPORT_CHART_LABELS`·`chartAvailability`·추가 목록 그룹화.
4. 표지 인사이트 5줄 + 미니 2단.
5. 추천 구성 버튼.
6. 검증: G4·G6, 데이터가 빈 케이스(주문 0건, 메뉴 1개, 운영 1일, 예정 상태) 각각 렌더 오류 없는지.

### P2 — 추가 조회가 필요한 정보

1. `popupBenchmark` — 모달에서 비교 팝업 선택 UI, `usePopupComparison` 재사용.
2. `laborEfficiency` — `fetchPopupPayroll` 연동, 기본 비활성 + 민감정보 경고.
3. `menuDailyTrend` — POS 주문 기준 일자×메뉴 집계 Server Action 신규(`requireAdmin` + `wrap`, `app/AGENTS.md` 패턴).

### P3 — 마감

- 목차, 용어·산식 부록, 문서 메타데이터(`author`, `subject`, `keywords`).
- `components/AGENTS.md`·`README` 갱신.

---

## 5. 리스크·주의점

| 리스크 | 대응 |
|---|---|
| `wrap={false}` 카드가 페이지보다 크면 레이아웃 붕괴 | 카드 최대 높이 상수화, 텍스트 블록 분리 fallback, 운영 60일 케이스로 테스트 |
| 차트를 작게 그리면 라벨 겹침 | 막대 폭 기준 라벨 stride, half에서 값 라벨 생략 규칙 |
| 섹션이 늘수록 미리보기 렌더 시간 증가(600ms 디바운스 + 매 변경 전체 재렌더) | SVG 노드 수 상한(히트맵 셀 값은 색 농도로만, 값 라벨 옵션), 렌더 시간 측정 후 필요 시 디바운스 상향 |
| 한글 줄바꿈 — react-pdf 기본 하이픈 처리 | 인사이트·텍스트 블록이 길어지므로 `Font.registerHyphenationCallback`으로 글자 단위 분절 규칙 검토 |
| 기존 `sections` 상태 호환 | 신규 필드 전부 옵셔널, 기본값은 `REPORT_CHART_DEFAULTS`에서 |
| 급여 정보가 외부 공유 PDF에 섞임 | `laborEfficiency`는 기본 비활성 + 추가 시 경고, 파일명에 표시 없음 확인 |
| 화면 통계와 PDF 숫자 불일치 | 집계는 `PopupStatsSection`이 이미 쓰는 값(`derived`, `hourlyData` 등)에서만 파생, PDF 쪽 재계산 금지 |

---

## 6. 검증 방법

1. **단위 테스트**: `reportMetrics.test.ts`, 행 패킹 테스트 — `yarn test`.
2. **PDF 스냅샷 스크립트**(개발용, 커밋 여부는 추후 결정): 샘플 `PopupReportData` 4종(운영 7·14·30·45일, 진행중/종료) → `@react-pdf/renderer`의 `renderToFile`로 PDF 생성 → `pdftoppm`으로 페이지 PNG → 페이지 수·여백 비교. 변경 전 PDF와 나란히 보관해 G1·G2 근거로 PR에 첨부.
3. **수동 회귀**: 모달에서 제목 변경·섹션 추가/삭제/순서 변경·텍스트 블록·레이아웃 모드 전환·다운로드, 모바일(PDFPreviewPanel 분기) 미리보기.
4. `yarn lint`, `yarn build`.
