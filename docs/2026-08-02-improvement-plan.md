# 2026-08-02 개선 계획 — 데드코드 제거, 급여 테스트, 오류 가시성

> 2026-08-02 수립. 코드베이스 전수 조사 + Supabase advisor + 기존 계획 문서(1차·2차·모바일) 이월 항목 점검 결과.
> 현재 상태: lint 통과, 워킹트리 클린, dev == origin/dev.

## 진단 요약

### 새로 발견한 문제

| # | 문제 | 위치 | 판단 |
|---|------|------|------|
| ① | **죽은 RPC 호출** — `increment_worker_revenue`가 매 주문 저장마다 호출되지만, 대상 테이블 `workers`는 7/20에 삭제됨. 매 주문마다 조용히 실패(console.error)하고 있음 | `app/actions/orders.ts:71` | 호출 제거 + DB 함수 DROP. advisor 경고 3건(search_path·anon 실행·authenticated 실행)도 함께 해소 |
| ② | **급여·근무시간 계산에 테스트 0건** — 최근 커밋 5개 중 3개가 payroll 계산 버그 수정(`80a0742`, `d6bba50`, `3b4681e`)인데 테스트 인프라 자체가 없음 (`test` 스크립트·vitest·jest 부재) | `lib/workhours` 등 | vitest 도입 + 야간근무·휴게시간·반올림 경계 케이스 단위 테스트. 재발 방지 효과 최대 |
| ③ | `decrement_menu_stock`이 anon/authenticated로 REST RPC 직접 실행 가능 (SECURITY DEFINER) — anon 키만 있으면 외부인이 재고 조작 가능 | Supabase advisor WARN | 서버는 service role 경유라 EXECUTE revoke해도 무영향. revoke 마이그레이션 |
| ④ | 고아 페이지 `app/(admin)/devtools/page.tsx` (660줄) — 앱 어디서도 링크 0곳, settings의 `DevToolsSection`(636줄)과 기능 중복 | `app/(admin)/devtools/` | 삭제 후보 (사용자 확인 필요 — 직접 URL로 쓰는 중일 수 있음) |
| ⑤ | FK 커버링 인덱스 누락 3건 (7/24 이후 신규 발생) | `manual_menu_sales(menu_item_id)`, `restock_events(ingredient_id)`, `roster_shifts(popup_id)` | 인덱스 추가 마이그레이션 (리스크 0) |
| ⑥ | Leaked password protection 비활성 | Supabase Auth 설정 | 대시보드에서 토글 (사용자 직접) |
| ⑦ | `roster_shifts_unit_idx` 등 미사용 인덱스 4건 | advisor INFO | **드롭 보류** — `idx_contracts_created_by` 등은 7/20에 우리가 추가한 FK 커버링 인덱스라 "미사용"이 정상(삭제·조인 대비용). 관찰만 |

### 기존 계획 이월 항목

| 출처 | 항목 | 상태 |
|------|------|------|
| 모바일 P2-9 | **프로덕션 오류 수집 부재** — error.tsx가 console.error뿐, 사용자가 겪은 오류를 알 방법이 없음 | 미착수. Sentry 대신 기존 `lib/discord` 웹훅 재활용이 가볍고 즉효 |
| 모바일 P2-11 | POS 주문 저장 실패 시 재시도 UX (현재 toast만, 현장 네트워크 불안정) | 미착수 |
| 모바일 P2-10 | 백그라운드 복귀 시 realtime 재구독 + react-query invalidate 공통 훅 | 미착수 |
| 모바일 P2-12 | error.tsx digest 표시 + 오프라인 구분 문구 | 미착수 |
| 2차 P2-10 | `lib/supabase-admin.ts`(929줄, 46함수) 도메인 분해 | 보류 유지 — diff 크고 회귀 위험, 별도 세션 권장 |
| 1차 P2-9 | POS·RosterCalendar 실기기 프로파일 후 memo화 | 실기기 필요 — 보류 유지 |
| 모바일 P0-1 | 인증 화면 2차 모바일 스윕 | 테스트 계정 필요 — 보류 유지 |

## 실행 계획 (오늘)

### P0 — 데드코드·DB 정리 (오전, 리스크 낮음)

1. **죽은 RPC 정리**: `orders.ts`의 `increment_worker_revenue` 호출 제거 → DB 함수 `increment_worker_revenue` DROP + `decrement_menu_stock` anon/authenticated EXECUTE revoke를 한 마이그레이션으로. 적용 후 advisor 재확인으로 경고 5건 해소 검증.
2. **FK 인덱스 3건 추가** 마이그레이션.
3. (사용자 확인 후) 고아 `devtools/page.tsx` 삭제.

### P1 — 급여 계산 테스트 (오늘의 메인)

4. **vitest 도입** (`yarn add -D vitest`, `test` 스크립트) — Next 의존성 없는 순수 lib만 대상이라 설정 최소.
5. **`lib/workhours` 단위 테스트**: 최근 버그가 나온 경계를 우선 — 야간 교대(자정 넘김), 휴게시간 포함/미포함, 반올림, 0시간·음수 방어. 급여 계산식(시급×시간, 주휴 등 있으면)도 포함.
6. 테스트가 드러내는 버그가 있으면 수정 (테스트 먼저, 수정 나중).

### P2 — 프로덕션 오류 가시성 (오후)

7. **오류 수집**: 전역 `error.tsx` + 서버 액션 `wrap()` 실패 시 `lib/discord` 웹훅으로 알림 (rate-limit 가드 포함). error.tsx에 digest 표시.
8. **POS 저장 실패 재시도 UX**: 실패 시 명확한 실패 상태 + 재시도 버튼, `withTimeout` 문구 정비.

### P3 — 남으면

9. 백그라운드 복귀 공통 훅 (`visibilitychange` → invalidate + 채널 재구독).
10. `roster.ts`(1000줄) 분해 착수 또는 `supabase-admin.ts` 도메인 분해 1개 파일.

### 검증 기준

- 각 단계: `yarn lint` + `npx tsc --noEmit`, P0 마이그레이션 후 advisor 재조회 + POS 주문 저장 스모크.
- P1: `yarn test` 통과, 기존 급여 화면 값 불변 확인.
- P2: 의도적 오류 발생시켜 Discord 알림 도착 확인.

## 진행 상황 (2026-08-02)

- [ ] P0-1 죽은 RPC 정리
- [ ] P0-2 FK 인덱스 3건
- [ ] P0-3 devtools 고아 페이지 (사용자 확인 대기)
- [ ] P1-4 vitest 도입
- [ ] P1-5 workhours 테스트
- [ ] P2-7 오류 수집
- [ ] P2-8 POS 재시도 UX
