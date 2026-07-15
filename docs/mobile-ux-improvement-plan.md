# 모바일 UI/UX 검증·개선 및 오류 수정 계획

> 2026-07-16 수립. 성능 개선([performance-improvement-plan.md](performance-improvement-plan.md)) 후속. 모바일 환경(직원 폰·POS 태블릿)의 UI/UX 검증 체계와 발견된 개선 후보, 오류 처리 개선 방향.

## 현황 진단

- 모바일 이슈가 반복 테마: 최근 커밋 이력에 모바일 관련 수정이 10건 이상 (PDF 미리보기 깨짐, NavBar 권한 강등, 체크아웃 리렌더 버그 등) — 사후 대응 패턴. 사전 검증 체계가 없음.
- 반응형 적용이 화면마다 편차: pos(23곳)·NavBar(16곳)는 촘촘, my·my/schedule(0곳)은 모바일 우선 단일 컬럼, orders·memo·inventory(2~3곳)는 최소.
- 에러 바운더리(`error.tsx` 6개)는 갖춰져 있으나 `console.error`뿐 — 프로덕션 오류 수집 도구 없음(Sentry 등 부재). 사용자가 겪은 오류를 개발자가 알 방법이 없다.
- 뷰포트 단위 혼재: 신규 모달은 `90dvh`, HrPageClient는 `calc(100vh-280px)` — 모바일 브라우저 URL바 변동에 100vh는 어긋남.
- iOS 확대 유발 후보: 입력 필드 대부분이 13~14px — iOS Safari는 16px 미만 입력에 포커스 시 강제 줌.
- safe-area(`env(safe-area-inset-*)`) 미사용 — 아이폰 홈바에 sticky 결제 버튼·바텀시트가 겹칠 수 있음.

## 사용자·화면 매트릭스 (검증 대상)

| 사용자 | 기기 | 화면 |
|--------|------|------|
| 캐셔 | 태블릿(가로) | /pos, /orders |
| 주방 | 태블릿·폰 | /orders, /inventory, /roster |
| 직원 | 폰(iOS·Android) | 로그인/회원가입(PasswordGate), /my, /my/schedule, /memo |
| 매니저 | 폰 + 데스크톱 | /roster, /inventory |
| 관리자 | 데스크톱 + 폰 | /hr, /stats, /settings |
| 고객 | 디스플레이 | /display |

## 실행 계획

### P0 — 검증 스윕 + 즉효 CSS 수정

1. **체계적 검증 스윕**: 위 매트릭스의 화면 × 뷰포트(iPhone SE 375px, iPhone 15 393px, Android 360px, iPad 가로 1180px)를 순회하며 체크리스트 점검. 결과를 이 문서 하단 "발견 이슈" 표에 기록.
   - 체크리스트: 가로 스크롤 발생 여부 / 터치 타깃 44px 이상 / 입력 포커스 시 iOS 줌 / 모달이 화면을 벗어나는지 / 키보드가 입력을 가리는지 / 홈바·노치 겹침 / 긴 텍스트 줄바꿈 / 로딩·에러 상태 표시
2. **iOS 입력 줌 방지**: `globals.css`에 모바일 한정 `input, select, textarea { font-size: 16px }` (또는 개별 필드 16px 상향). `maximum-scale=1`은 접근성 문제로 지양.
3. **100vh → dvh 통일**: `HrPageClient.tsx`의 `calc(100vh-280px)` 2곳 등 100vh 사용처를 `dvh`로 교체.
4. **safe-area 대응**: sticky 하단 버튼(POS 결제)·바텀시트 모달에 `padding-bottom: env(safe-area-inset-bottom)` 적용.

### P1 — 상호작용·레이아웃 개선

5. **터치 타깃 확대**: 필터 칩(py-1.5, 12px)·테이블 행 액션 등 44px 미만 요소를 스윕 결과 기준으로 확대.
6. **키보드 UX**: 로그인·회원가입·메모 작성에서 키보드가 제출 버튼을 가리는지 확인, 필요 시 `scrollIntoView`/하단 여백. `inputMode`·`autoComplete`·`enterKeyHint` 정비(전화번호 `inputMode="tel"` 등).
7. **my·my/schedule 데스크톱 검증**: 모바일 우선 화면이 넓은 화면에서 방치되지 않는지(max-width 컨테이너 확인).
8. **PDF 화면 회귀 감시**: 근로계약서 서명·주간 근무표 인쇄는 모바일 회귀가 잦았던 영역 — 스윕에 필수 포함.

### P2 — 오류 수정·복원력

9. **프로덕션 오류 수집**: Sentry(@sentry/nextjs) 도입 — error.tsx의 `console.error`를 대체하고 서버 액션 실패도 수집. 무료 티어로 충분. (대안: Vercel 로그 + Discord 웹훅 알림 재활용)
10. **모바일 백그라운드 복귀 시 데이터 갱신**: 폰을 껐다 켜면 realtime 채널이 끊겨 stale 데이터가 남을 수 있음 — `visibilitychange`/`online` 이벤트에서 react-query invalidate + 채널 재구독 공통 훅.
11. **불안정 네트워크 대응(현장 중요)**: POS 주문 저장 실패 시 사용자에게 명확한 실패 표시 + 재시도 버튼(현재 toast만). `withTimeout` 8초 실패 문구에 재시도 안내 포함.
12. **에러 화면 정비**: error.tsx에 digest 표시(문의 시 추적용), 오프라인 감지 시 "네트워크 연결을 확인해주세요" 구분 표시.

### P3 — 재발 방지

13. **모바일 회귀 체크리스트**: 이 문서의 체크리스트를 배포 전 수동 점검 루틴으로 고정 (PDF·결제·로그인 3대 취약 영역 필수).
14. **Speed Insights 모바일 세그먼트 모니터링**: 배포 후 모바일 LCP/INP 분리 확인.

## 발견 이슈 (검증 스윕 결과 기록)

| # | 화면 | 뷰포트 | 증상 | 심각도 | 상태 |
|---|------|--------|------|--------|------|
| - | (스윕 후 기록) | | | | |

## 진행 상황

- [ ] P0-1 검증 스윕 (매트릭스 × 뷰포트)
- [ ] P0-2 iOS 입력 줌 방지
- [ ] P0-3 100vh → dvh
- [ ] P0-4 safe-area 대응
- [ ] P1-5~8 상호작용·레이아웃
- [ ] P2-9~12 오류 수집·복원력
- [ ] P3-13~14 재발 방지
