# Inventory (재고관리) — Implementation PRD for Claude Code

> 이 문서는 Claude Code에게 전달할 구현 명세입니다. 디자인 프리뷰는
> `design_handoff_choichoi_redesign/preview/src/inventory.jsx` 를 그대로 참고하세요.
> 시각 위계·인터랙션은 거기 따르고, 본 문서는 **데이터 모델 / 비즈니스 로직 /
> 통합 지점**을 정확히 못박는 데 집중합니다.

---

## 0. 목적

팝업스토어 운영 중 **POS에서 산도가 한 개 팔릴 때마다 재고가 실시간으로
자동 차감**되고, **부족분은 재입고로 다시 채울 수 있는** 화면을 만든다.

- 현재 화면이 부족한 것: 식빵 한 종류만 시뮬레이션 가능
- 본 PRD: **식빵(개수 단위) + 과일/크림(중량 단위) 둘 다** 같은 모델로 통합 관리

---

## 1. 핵심 도메인 모델

### 1.1 재료 (Ingredient)

각 재료는 **두 가지 단위 유형 중 하나**로 관리한다.

| unit_type   | 예시                       | base_unit | container_unit | container_size 의미        |
|-------------|----------------------------|-----------|----------------|----------------------------|
| `count`     | 식빵, 보냉백               | `장`/`개` | `봉지`/`박스`  | 한 봉지당 들어있는 **장 수** |
| `weight`    | 딸기, 메론, 망고, 키위, 생크림 | `g`      | `박스`/`팩`    | 한 박스당 들어있는 **g**      |

```ts
type Ingredient = {
  id: string;                    // 'bread' | 'strawberry' | ...
  name: string;                  // '식빵', '딸기'
  category: '빵' | '크림' | '과일' | '패키지';
  color: string;                 // 시각 코드용 hex
  unit_type: 'count' | 'weight';
  base_unit: '장' | '개' | 'g';
  container_unit: '봉지' | '박스' | '팩' | '통';
  container_size: number;        // count: 정수 (예: 12장)
                                 // weight: g 정수 (예: 1000 = 1kg, 2000 = 2kg)
  // 현재 재고
  sealed_count: number;          // 미개봉 박스/봉지 개수 (정수)
  opened_remaining: number;      // 개봉 박스/봉지의 잔량 (base_unit, weight면 g)
  // 정책
  reorder_at_containers: number; // 발주 임계치 (박스 수, 예: 2 → 2박스 이하 알림)
  // 메타 (옵션)
  vendor?: string;
  lead_days?: number;
  unit_price?: number;           // 박스당 매입가
};
```

**총 잔량 계산** (모든 단위 환산은 base_unit 기준):

```ts
totalQty(ing) = ing.sealed_count * ing.container_size + ing.opened_remaining
```

**박스 환산 잔량** (UI 표시용):

```ts
sealed=8, opened_remaining=720g, container_size=1000g
→ "8박스 + 720g" 또는 "8.7박스"
```

### 1.2 레시피 (Recipe)

메뉴 1개를 만들 때 어떤 재료를 얼마나 쓰는지.

```ts
type RecipeEntry = {
  menu_id: number;          // MENU.id (1=딸기산도, 2=메론, 3=후르츠, 4=망고, 5=보냉백)
  ingredient_id: string;
  qty_per_unit: number;     // base_unit 기준 (count면 장/개, weight면 g)
};
```

**시드 데이터** (디자인 프리뷰와 일치):

| 메뉴 | 식빵 | 생크림 | 마스카포네 | 설탕 | 딸기 | 메론 | 망고 | 키위 | 보냉백 |
|------|------|----------|------------|------|------|------|------|------|--------|
| 딸기산도   | 2장 | 60g | 20g | 10g | 40g |     |     |     |     |
| 메론산도   | 2장 | 60g | 20g | 10g |     | 60g |     |     |     |
| 후르츠산도 | 2장 | 70g | 25g | 12g | 20g |     | 20g | 20g |     |
| 망고산도   | 2장 | 60g | 20g | 10g |     |     | 60g |     |     |
| 보냉백 추가 |    |     |     |     |     |     |     |     | 1개 |

> 사용자가 산도 1개 = 식빵 1장으로 단순화 원하면 위 값은 **설정 가능한
> 입력**으로 빼야 함. 화면에서 레시피 편집 가능하도록 한다.

### 1.3 판매 이벤트 → 차감 알고리즘

POS에서 결제 완료 시, 주문에 포함된 각 `(menu_id, qty)`에 대해
레시피의 모든 항목을 차감한다.

```ts
function deductForSale(menuId: number, qty: number) {
  for (const r of recipes.filter(e => e.menu_id === menuId)) {
    let need = r.qty_per_unit * qty;
    const ing = ingredients[r.ingredient_id];

    // 1. 개봉박스 잔량부터 차감
    if (ing.opened_remaining >= need) {
      ing.opened_remaining -= need;
      continue;
    }
    need -= ing.opened_remaining;
    ing.opened_remaining = 0;

    // 2. 미개봉 박스를 FIFO로 하나씩 개봉
    while (need > 0 && ing.sealed_count > 0) {
      ing.sealed_count -= 1;
      const fresh = ing.container_size;
      if (fresh >= need) {
        ing.opened_remaining = fresh - need;
        need = 0;
      } else {
        need -= fresh;
      }
    }

    // 3. 그래도 부족하면 재고 부족 이벤트 발생
    if (need > 0) {
      emit('stockout', { ingredient_id: ing.id, shortBy: need });
    }
  }
}
```

**핵심 동작**:
- 개봉 박스 잔량을 먼저 쓴다 (FIFO)
- 부족하면 다음 미개봉 박스를 자동 개봉
- 한 번의 판매가 여러 박스를 가로지를 수 있음 (예: 식빵 잔량 1장인데 산도 2개 동시 결제)
- 음수 재고 금지: 차감 못한 양은 `stockout` 이벤트로 기록

### 1.4 입고 (Restock)

```ts
type RestockEvent = {
  ingredient_id: string;
  containers_added: number;     // 미개봉 박스 수
  per_container_size?: number;  // 이번 입고 박스의 크기가 다르면 (옵션)
  expiry?: string;              // 'YYYY-MM-DD'
  unit_price?: number;
  memo?: string;
  created_at: string;
};
```

입고가 발생하면 `sealed_count += containers_added`. 박스 크기가 평소와
다르면 박스별로 별도 row를 두는 것을 권장 (3.3 참조).

### 1.5 (선택) 박스 단위 추적 — 유통기한 정확도 위해

`sealed_count` + `opened_remaining`만으로는 박스별 유통기한을 못 따라간다.
정확도가 필요하면 박스 row를 따로 둔다:

```ts
type StockBox = {
  id: string;
  ingredient_id: string;
  size: number;                 // 이 박스의 base_unit 용량
  remaining: number;            // 잔량 (size 이하)
  status: 'sealed' | 'opened' | 'depleted';
  expiry?: string;
  received_at: string;
  unit_price?: number;
};
```

FIFO 차감 = `remaining > 0 && expiry asc` 순서로 소비.
1차 구현에서는 1.1 단순 모델로 시작하고, 박스 단위 추적은 v2로 둬도 됨.

---

## 2. 데이터베이스 (Supabase 기준)

기존 POS가 Supabase를 쓰고 있으므로 그 패턴 유지.

```sql
-- 재료 마스터
create table ingredients (
  id              text primary key,
  name            text not null,
  category        text not null,
  color           text not null,
  unit_type       text not null check (unit_type in ('count','weight')),
  base_unit       text not null,
  container_unit  text not null,
  container_size  numeric not null,
  sealed_count    integer not null default 0,
  opened_remaining numeric not null default 0,
  reorder_at_containers integer not null default 1,
  vendor          text,
  lead_days       integer,
  unit_price      integer,
  sort_order      integer default 0,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- 레시피 (메뉴 × 재료)
create table recipes (
  menu_id         integer not null references menus(id) on delete cascade,
  ingredient_id   text not null references ingredients(id) on delete restrict,
  qty_per_unit    numeric not null,
  primary key (menu_id, ingredient_id)
);

-- 입고 로그
create table restock_events (
  id              uuid primary key default gen_random_uuid(),
  ingredient_id   text not null references ingredients(id),
  containers_added integer not null,
  per_container_size numeric,
  expiry          date,
  unit_price      integer,
  memo            text,
  created_at      timestamptz default now()
);

-- 차감 로그 (감사용)
create table deduction_events (
  id              uuid primary key default gen_random_uuid(),
  order_id        integer references orders(id) on delete set null,
  ingredient_id   text not null references ingredients(id),
  qty             numeric not null,        -- 차감된 양 (base_unit)
  opened_new_box  boolean default false,
  created_at      timestamptz default now()
);

-- (선택) 폐기 로그
create table waste_events (
  id              uuid primary key default gen_random_uuid(),
  ingredient_id   text not null references ingredients(id),
  qty             numeric not null,
  reason          text,
  created_at      timestamptz default now()
);
```

### RPC: `deduct_for_order(order_id integer)`

주문 결제 직후 호출. 트랜잭션 안에서 안전하게 차감:

```sql
create or replace function deduct_for_order(p_order_id integer)
returns void
language plpgsql
as $$
declare
  oi  record;
  rec record;
  ing record;
  need numeric;
  opened_new boolean;
begin
  for oi in
    select menu_id, quantity from order_items where order_id = p_order_id
  loop
    for rec in
      select ingredient_id, qty_per_unit from recipes where menu_id = oi.menu_id
    loop
      need := rec.qty_per_unit * oi.quantity;
      opened_new := false;

      select * into ing from ingredients
        where id = rec.ingredient_id for update;

      -- 개봉박스부터
      if ing.opened_remaining >= need then
        update ingredients set
          opened_remaining = opened_remaining - need,
          updated_at = now()
          where id = ing.id;
        need := 0;
      else
        need := need - ing.opened_remaining;
        update ingredients set opened_remaining = 0 where id = ing.id;

        while need > 0 and ing.sealed_count > 0 loop
          opened_new := true;
          if ing.container_size >= need then
            update ingredients set
              sealed_count = sealed_count - 1,
              opened_remaining = ing.container_size - need,
              updated_at = now()
              where id = ing.id;
            need := 0;
          else
            update ingredients set
              sealed_count = sealed_count - 1,
              updated_at = now()
              where id = ing.id;
            need := need - ing.container_size;
          end if;
          select * into ing from ingredients where id = rec.ingredient_id for update;
        end loop;
      end if;

      insert into deduction_events
        (order_id, ingredient_id, qty, opened_new_box)
        values
        (p_order_id, rec.ingredient_id, rec.qty_per_unit * oi.quantity, opened_new);
    end loop;
  end loop;
end;
$$;
```

> Realtime: `ingredients` 테이블을 Realtime publication에 추가하면
> 재고관리 화면이 다른 단말의 판매로 인한 차감을 라이브로 받음.

---

## 3. 화면 구성 (참조: `inventory.jsx`)

### 3.1 라우트
`/inventory` — 기존 NavBar에 "재고" 링크 추가 (`POS · 주문 · 재고 · 통계 · ...`).

### 3.2 컴포넌트 트리

```
/inventory (페이지)
├─ TopBar (active="INV")
├─ DateStrip
├─ LiveBar             — 실시간 차감 인디케이터 + 시뮬 컨트롤(개발용 토글)
├─ LowStockAlert       — 발주 임계치 이하 재료 (있을 때만)
├─ MakeableHero        — "지금 X개 더 만들 수 있어요" — 산도별 카드 4개
├─ StatusStrip         — 발주/주의/정상 카운트 + 오늘 차감 원가
├─ FilterBar           — 카테고리(전체/빵/크림/과일/패키지) + 정렬
├─ IngredientList
│   └─ IngredientCard × N
│        ├─ 상태 헤더 (이름·카테고리·상태 칩·유통기한 칩)
│        ├─ 박스 스택 시각화 (BoxStack)
│        ├─ 잔량 ("8박스 + 720g")
│        ├─ 쓰이는 메뉴 칩들
│        └─ (펼침) FIFO 박스 상세 · 거래처 · 액션 (입고/폐기/실사)
├─ LiveLog             — 차감 내역 (실시간 추가)
└─ RecipePanel         — 메뉴별 1개당 사용량 + 원가 + 마진율
```

### 3.3 IngredientCard 표시 규칙

`unit_type === 'count'`:
- 잔량: `{sealed_count}봉지 + {opened_remaining}장`
- 박스 스택: 봉지 모양 (좁고 길게)
- 입고 모달의 단위 선택: "봉지", 박스당 크기 input은 **장 수** (정수)

`unit_type === 'weight'`:
- 잔량: `{sealed_count}박스 + {fmt(opened_remaining)}g` 또는 `{(total/1000).toFixed(1)}kg`
- 박스 스택: 박스 모양 (정사각형 가까이)
- 입고 모달의 단위 선택: "박스", 박스당 크기 input은 **g 수** (보통 1000, 2000)

**상태 판정**:
```ts
const boxesLeft = totalQty(ing) / ing.container_size;
if (totalQty(ing) === 0)        return 'out';
if (boxesLeft <= reorder_at)    return 'low';
if (boxesLeft <= reorder_at+1)  return 'warn';
return 'ok';
```

### 3.4 입고 모달 (RestockSheet)

- 박스 수 +/− 컨트롤 + 빠른 입력 칩(1·3·5·10)
- **박스당 크기 input** — 평소와 다를 수 있음 (예: 평소 1kg 박스인데 2kg 박스 들어옴)
- 유통기한 입력
- 박스당 단가 입력
- 거래처
- 미리보기: "입고 후 재고: 12박스 + 720g · 총 매입가 ₩84,000"
- 확정 시: `insert into restock_events` + `update ingredients set sealed_count += N`

### 3.5 레시피 편집

- "레시피 관리" 버튼 → 메뉴별 펼침 폼
- 각 행: 재료 선택 + 수량 input + base_unit 자동 표시 (장/g)
- 추가/삭제 가능
- 저장 시 `recipes` 테이블 upsert

### 3.6 MakeableHero 계산

```ts
function makeableForMenu(menuId) {
  const entries = recipes.filter(r => r.menu_id === menuId);
  let min = Infinity, bottleneck = null;
  for (const r of entries) {
    const ing = ingredients[r.ingredient_id];
    const possible = Math.floor(totalQty(ing) / r.qty_per_unit);
    if (possible < min) { min = possible; bottleneck = ing; }
  }
  return { count: min, bottleneck };
}
```

산도 4종 각각 표시. 합계는 "지금 X개 더 만들 수 있어요" — 단,
보틀넥 재료를 공유하는 경우 단순 합계는 부정확하므로:
- **합계 = sum of makeable counts** (단순 표시)
- **부제목 = "가장 임박: {tightest.name} {n}개"** 추가

### 3.7 LiveLog & Realtime

- `deduction_events` 테이블 INSERT 이벤트를 Realtime subscribe
- 새 이벤트가 들어오면 리스트 맨 위에 추가, 카드에 emerald flash
- 만약 `opened_new_box === true` 였다면 "새 박스 개봉" amber 칩

---

## 4. POS 통합

### 4.1 결제 완료 시점 훅

기존 `pos/page.tsx`의 `handleCheckout` (또는 `checkoutMutation`)에서
주문 insert 직후:

```ts
const { error: deductErr } = await supabase.rpc('deduct_for_order', {
  p_order_id: order.id,
});
if (deductErr) {
  // 재고 차감 실패는 결제를 막지 않음 (운영 우선)
  // 단, deduction_events에 fail row + toast 노출
  console.warn('재고 차감 실패', deductErr);
}
```

### 4.2 메뉴 자동 품절 처리

`ingredients` 변화 → 각 메뉴의 makeable count 계산 → 0이면
POS 화면에서 해당 메뉴 카드를 회색 처리 + "재료 부족" 배지.
- 클라이언트에서 derive (별도 컬럼 X)
- 단, 재고관리에서 강제로 메뉴 일시 품절 켜는 옵션은 별도로 제공 (`menus.is_paused`)

### 4.3 부분 환불 / 주문 취소

`deduct_for_order`의 반대 동작 `restore_for_order` RPC를 따로 만들고,
주문 취소 시 호출. 차감 로그에 음수 row 또는 별도 type 컬럼.

---

## 5. v1 / v2 분리

### v1 (이번 PR 목표)
- [x] `ingredients` / `recipes` / `restock_events` / `deduction_events` 테이블
- [x] `deduct_for_order` RPC + POS 결제 훅 연결
- [x] `/inventory` 페이지: 카드 리스트, 입고 모달, MakeableHero, LowStockAlert
- [x] 산도/식빵 모두 단일 패턴 (count + weight 분기)
- [x] 카테고리 필터, 부족순 정렬
- [x] Realtime: ingredients 구독

### v2 (다음)
- [ ] StockBox 단위 (박스별 유통기한 정확 추적)
- [ ] 폐기 로그 / 재고 실사 모드
- [ ] 자동 발주서 PDF 생성 / 거래처 메시지 발송
- [ ] 일별 / 주별 사용량 트렌드 차트
- [ ] 메뉴 자동 품절 (재고 0 도달 시 POS 자동 잠금)

---

## 6. 디자인 시스템 준수

- **컬러**: `--color-primary-700: #084431` 메인, rose-500 부족, amber 주의, emerald 정상
- **폰트**: Pretendard Variable
- **타이포 스케일**: 큰 숫자는 `font-black` + `tabular-nums` + `clamp(...)` 반응형
- **레이아웃**: `@container` 쿼리로 휴대폰 1col / 태블릿 1.5fr+1fr / 노트북 1fr+400px
- **하단 sticky 액션** (모바일): "+ 입고 등록" / "오늘 마감 · 재고 확정"
- 모든 카드 `rounded-2xl`, 그림자 `0 2px 12px rgba(0,0,0,0.06)`

자세한 시각은 `design_handoff_choichoi_redesign/preview/src/inventory.jsx`
컴포넌트들을 그대로 포팅하면 됨 (Babel inline → 실제 .tsx 파일로).

---

## 7. 테스트 시나리오 (수동)

1. 식빵 봉지(`container_size=12`) 5봉지 입고 → `5봉지 + 0장 = 60장`
2. 딸기산도 1개 결제 → `4봉지 + 11장` (새 봉지 개봉됨 로그)
3. 딸기산도 12개 결제 → `4봉지 + 11장` → `3봉지 + 11장`
4. 딸기 박스(`container_size=2000`, 2kg) 3박스 입고 → `3박스 + 0g`
5. 딸기산도 1개 결제 → `2박스 + 1960g` (40g 차감, 새 박스 개봉)
6. 후르츠산도 50개 결제 → 딸기 20g × 50 = 1000g 차감
7. 마스카포네 (1통=500g) 0통 + 240g 상태에서 후르츠산도 결제 → 25g 차감 ✓
8. 위 상태에서 후르츠산도 10개 → 250g 필요한데 240g밖에 없음 → `stockout` 이벤트
9. 발주 임계치 이하 → LowStockAlert에 노출 + 입고 시트 열기 가능
10. 다른 단말에서 결제 → Realtime으로 이쪽 화면 카드 잔량 즉시 감소 + flash

---

## 8. 비-목표 (NON-GOALS)

- 박스별 유통기한 자동 폐기 알람 (v2)
- 거래처별 자동 발주 (v2)
- 다지점 재고 (현재 단일 매장 가정)
- 원자재 → 반제품 → 완제품 다단계 BOM (단일 BOM만)
