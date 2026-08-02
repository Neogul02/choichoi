# 2026-08-02 DB 정규화·인덱스 진단 및 개선

> ralph 세션. 제약: 기존 앱 동작(로직) 불변. 근거는 전부 원격 DB 실측 — `pg_stat_statements`, `pg_stat_user_indexes`, EXPLAIN(ANALYZE), Supabase advisor.

## 전제 진단

- 앱이 실제로 날리는 쿼리는 전부 수 ms 이하 (pg_stat_statements 확인) — **현재 느린 쿼리는 없다.**
  개선은 (a) 유일하게 계속 성장하는 orders(6.8k행)·roster 핫패스의 성장 대비, (b) 드리프트 가능한 중복 데이터 제거, (c) 인덱스 위생에 집중했다.

## 실행한 개선 (마이그레이션 5건)

| 버전 | 내용 | 근거·검증 |
|------|------|-----------|
| `20260802025540` | `orders(popup_id, created_at)` · `roster_assignments(staff_role, popup_id, work_date)` 복합 인덱스 | POS 금일주문·로스터 단위조회의 실제 WHERE 형태와 일치. EXPLAIN(ANALYZE)로 두 쿼리 모두 새 인덱스 Index Cond 전체 채택 확인 (orders: popup 2 실데이터 237행) |
| `20260802025702` | 중복·미사용 인덱스 3개 삭제 | `idx_staff_popup_assignments_staff_id` ⊂ unique(staff_id, popup_id) 선두 / `idx_orders_popup_id` ⊂ 새 복합 선두 / `roster_shifts_unit_idx` 스캔 0회·11행 |
| `20260802025809` | `user_profiles.total_revenue` 컬럼 삭제 | 아래 "정정" 참조 |
| `20260802025841` | `roster_assignments → roster_shifts` 복합 FK `(shift_id, staff_role, popup_id)` ON UPDATE/DELETE CASCADE | 사전 검증: 기존 321행 불일치 0건. 비정규화 복사본의 정합성을 DB가 강제 — 코드 변경 0건 |
| `20260802030449` | FK 커버링: `roster_assignments(shift_id, staff_role, popup_id)` 인덱스 신설, 단일 `shift_id` 인덱스 제거 | advisor unindexed-FK 경고 해소, 인덱스 순증 0 |

### ⚠️ 정정 — total_revenue는 "죽은 컬럼"이 아니라 "드리프트하는 중복 집계"였다

오전 커밋(`57e6886`)은 `increment_worker_revenue` RPC가 삭제된 `workers` 테이블을 참조한다고 판단했으나, **pg_stat_statements에 보존된 함수 원문 확인 결과 실제로는 `user_profiles.total_revenue`를 갱신하던 살아있는 함수였다.** 다만:

- `/my`의 "내 판매 티어"는 `getMyOrderStats()`가 orders에서 **실시간 전체 합산**한 값을 항상 우선 사용하고, 컬럼 값은 stats 미로드 시 fallback일 뿐이었다 (`/my`는 서버 프리페치라 첫 렌더부터 stats 존재).
- 원격에 수동 "재계산" UPDATE 실행 이력이 있음 — 누적 컬럼이 실측과 어긋나(드리프트) 손으로 고친 적이 있다는 뜻.

**결론: 파생값(SUM)을 중복 저장하던 컬럼을 제거하고 실시간 계산으로 단일화한 것은 정규화상 올바른 방향.** RPC·호출 제거(오전) + 컬럼 제거 + `MyPageClient` fallback 정리(`stats?.totalRevenue ?? 0`)로 일원화 완료. 단, `20260802025809` 마이그레이션 파일의 주석("죽은 컬럼")은 적용 시점 문구라 이 문서로 정정한다.

### 🚨 사고 기록 — 컬럼 DROP을 코드 배포보다 먼저 실행 (즉시 복구됨)

`20260802025809`의 DROP은 **배포된 프로덕션 코드가 여전히 `total_revenue`를 select하는 상태**에서 실행됐다. PostgREST는 존재하지 않는 컬럼 select에 에러를 반환하므로 `fetchAllUserProfiles`(HR 계정연결 목록)와 `getMyProfile`(/my)이 프로덕션에서 실패했고, 사용자가 "인사 > 계정연결이 안 돼 근로계약서를 못 쓴다"로 발견했다.

조치 (`20260802031903`): 컬럼을 즉시 복원하고, 과거 수동 재계산과 동일한 산식(`SUM(total_price) WHERE payment_status='completed' GROUP BY cashier_name`)으로 9명 값을 백필해 원상복구. 

**교훈 — 이 저장소의 스키마 축소 규칙 (expand/contract):** 컬럼·테이블 제거 마이그레이션은 반드시 ① 코드에서 참조 제거 → ② 프로덕션 배포 확인 → ③ DROP 순서로. DROP을 코드와 같은 커밋/세션에서 원격에 바로 적용하면 배포 전까지 프로덕션이 깨진다. **최종 DROP은 이번 dev 브랜치가 프로덕션에 배포된 뒤 별도 마이그레이션으로 실행할 것 (남은 작업).**

## 유지 판정 (정규화 위반처럼 보이지만 의도적)

| 항목 | 판정 근거 |
|------|-----------|
| `roster_assignments.staff_role`·`popup_id` (roster_shifts와 중복) | `applyUnitFilter`가 조인 없이 직접 필터하는 성능용 복사본 — 코드 전반(조회·삽입·스냅샷) 사용. 제거는 대규모 리팩토링. 대신 복합 FK로 정합성을 DB가 강제하도록 보강 (배정 이동 `.update({ shift_id })` 경로의 교차 단위 오염도 이제 차단됨) |
| `staff_profiles.popup_id` (staff_popup_assignments와 공존) | 레거시 아님 — HR UI(StaffFormModal·HrPageClient)가 "주 소속 팝업"으로 활발히 읽고, 조인 테이블은 다중 배정용으로 역할이 다름 |
| `daily_sales` (orders 집계 중복) | 수기 매출(manual entries) 병합용 의도적 집계 테이블 — sale_date unique 인덱스 671스캔으로 활발히 사용 |
| `orders.cashier_name` (text 비정규화) | 주문 시점 스냅샷 의미론 — FK로 바꾸면 개명 시 과거 주문 담당자가 소급 변경됨 |
| `timestamp without/with time zone` 혼재 | orders 계열이 without tz — 코드가 KST 보정으로 일관 처리 중. 타입 변경은 전 조회·통계 로직 회귀 리스크 대비 이득 없음 |
| FK 커버링 인덱스의 unused INFO 5건 | 부모 행 삭제 cascade 조회용 보험 — 평시 스캔 0회가 정상. 유지 |

## 남은 advisor 상태

- 성능: unused index INFO만 잔존 (전부 위 표의 의도적 FK 커버링). unindexed FK 0건.
- 보안: RLS enabled-no-policy INFO(전 테이블 service role 전용 접근이라 의도된 잠금), leaked password protection(Pro 전용 — 제외 확정).
