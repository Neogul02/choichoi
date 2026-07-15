# 성능 개선 계획 — 렉·레이턴시·흰 화면

> 2026-07-16 수립. 전체 웹사이트의 반응속도(렉·레이턴시)와 초기 진입 시 흰 빈 화면을 없애기 위한 진단과 단계별 실행 계획.

## 진단 요약

| # | 문제 | 위치 | 영향 |
|---|------|------|------|
| ① | 클라이언트 인증 게이트가 판정 완료까지 `null` 렌더 | `app/password-gate.tsx` (`if (!checked) return null`) | `/`·`/display` 외 모든 페이지가 JS 로드 + `auth.getUser()` 네트워크 왕복이 끝날 때까지 흰 화면 |
| ② | `loading.tsx` 부재 | 전체 라우트 | 서버 프리페치 페이지(hr·roster)는 페치가 끝날 때까지 내비게이션 무반응 |
| ③ | 미들웨어가 매 요청 `auth.getUser()` 네트워크 왕복 | `proxy.ts` | 페이지 이동 + 해당 경로의 서버 액션 POST마다 인증 왕복 추가 (hr/page.tsx 주석에 기록된 문제) |
| ④ | 클라이언트 마운트 후 서버 액션 워터폴 | stats·inventory·my 등 `'use client'` 페이지 | 서버 액션 POST는 Next.js가 직렬화 → 액션 6개 이상이 한 줄로 늘어섬 (각각 ③의 비용 동반) |
| ⑤ | 렌더 블로킹 외부 폰트 CSS | `app/layout.tsx` (jsdelivr Pretendard `<link>`) | 첫 페인트 지연, CDN 상태에 따라 편차. `@fontsource/noto-sans-kr`는 미사용 |
| ⑥ | 무거운 라이브러리 정적 import | stats의 recharts 4곳, POS의 framer-motion | 초기 번들 비대 → 저사양 태블릿 렉 |

## 실행 계획

### P0 — 흰 화면 제거 (체감 최대, 리스크 낮음)

1. **PasswordGate 개선** (`app/password-gate.tsx`)
   - 초기 판정을 `getUser()`(네트워크) → `getSession()`(로컬 쿠키)으로 교체 — 판정 자체를 수 ms로. 실제 보안은 미들웨어·서버 액션 담당, 클라이언트 게이트는 UX용.
   - `return null` → 브랜드 스플래시 렌더.
   - 낙관적 렌더: `APP_ROLE_KEY`(localStorage) 존재 시 children 즉시 렌더, 백그라운드 검증 후 불일치 시에만 로그인 화면 전환.
2. **라우트별 `loading.tsx` 추가** — `(admin)/hr`, `(staff)/roster`, `(admin)/stats`, `(admin)/settings` 등 스켈레톤.
3. **폰트 셀프호스팅** — jsdelivr `<link>` 제거, Pretendard variable woff2를 `next/font/local`로(preload + swap). 미사용 `@fontsource/noto-sans-kr` 제거.

### P1 — 내비게이션·데이터 레이턴시

4. **미들웨어 인증 로컬 검증** (`proxy.ts`) — Supabase 비대칭 JWT 활성화 후 `getClaims()` 로컬 검증으로 전환. role 검사는 claims에서 동일하게. 매 요청 인증 왕복 0회.
5. **서버 액션 워터폴 제거 — hr 패턴 확산**
   - stats `page.tsx`를 서버 컴포넌트로 전환, 초기 데이터 in-process 병렬 조회 → `initialData`로 전달.
   - `fetchRosterOverview`의 unit별 `fetchRosterRange` 반복(N+1)을 단일 범위 쿼리로 통합 검토.
   - 서버 프리페치가 어려운 화면은 배치 액션(`fetchXxxBootstrap`) 하나로 직렬화 비용 1회화.
6. **서버 액션 내부 인증 통일** — `getUser()` 5개 파일을 로컬 검증 공통 헬퍼(`_base`)로 교체.

### P2 — 번들·런타임 렉

7. `@next/bundle-analyzer`로 라우트별 First Load JS 측정 후 `optimizePackageImports` 적용.
8. stats의 recharts 섹션 4곳 `next/dynamic` 전환.
9. POS 런타임: `AnimatePresence` 범위 축소, 리스트 항목 memo화, 실시간 invalidate 디바운스. `RosterCalendar` 프로파일 후 셀 memo화.
10. `<img>` 2곳 → `next/image`.

### P3 — 인프라·계측

11. Vercel 함수 리전을 Supabase 리전과 정렬 (`vercel.json`의 `regions`).
12. Vercel Speed Insights로 LCP·INP·TTFB 실측 — 각 단계 효과 검증 기준.

## 진행 상황 (2026-07-16)

- [x] P0-1 PasswordGate: getSession 전환 + `LoadingScreen` 스플래시 + 낙관적 렌더 (POPUP_ID 흔적 있으면 즉시 렌더 후 백그라운드 검증)
- [x] P0-2 전역 `app/loading.tsx` 추가 — 공용 `components/LoadingScreen.tsx` 사용
- [x] P0-3 폰트 셀프호스팅 — `pretendard` 패키지 dynamic-subset CSS 번들 포함, jsdelivr `<link>`·Geist·`@fontsource/noto-sans-kr` 제거
- [x] P1-4 미들웨어 `getClaims()` 로컬 JWT 검증 — 프로젝트가 이미 ES256 비대칭 키 사용 중이라 인프라 변경 불필요
- [x] P1-5 stats 서버 프리페치 — `page.tsx` 서버 컴포넌트 전환(`getStatsBootstrap` 병렬 6종), 훅 4개에 initial 주입 경로 추가. roster N+1은 이미 `Promise.all` 병렬이라 보류(단일 쿼리 통합은 효과 대비 리스크로 미착수)
- [x] P1-6 서버 액션 인증 통일 — `_base.getAuthUser()`(getClaims 기반) 신설, workers·staff·roster의 `getUser()` 7곳 교체
- [x] P2-8 stats 차트 섹션 3곳(recharts) `next/dynamic` 지연 로드
- [ ] P2-7 번들 측정 — `@next/bundle-analyzer`는 Turbopack 빌드 미지원이라 보류 (next build --debug 또는 Turbopack 지원 도구 검토)
- [ ] P2-9 POS·RosterCalendar 런타임 렉 — 실기기 프로파일 후 진행 (framer-motion 범위 축소, memo화, invalidate 디바운스)
- [x] P2-10 `<img>` → `next/image`: 실제 DOM `<img>` 사용처 없음(주석뿐) — 조치 불필요
- [x] P3-11 `vercel.json` `"regions": ["icn1"]` — Supabase가 ap-northeast-2(서울) 확인
- [x] P3-12 `@vercel/speed-insights` 설치 + 루트 레이아웃 장착 (Vercel 대시보드에서 Speed Insights 활성화 필요)

### 남은 작업 메모
- 배포 후 Vercel 대시보드에서 Speed Insights 활성화.
- P2-9는 실기기(태블릿)에서 React DevTools Profiler로 병목 확인 후 착수.
- 로그인 화면(PasswordGate)의 `getSession` 전환으로 게이트가 낙관적이 된 만큼, 페이지 데이터 접근은 기존대로 미들웨어·서버 액션 검증에 의존한다.
