-- 팝업별 고정 수수료율(%) — 백화점·몰마다 다르다. 통계탭 정산 예상(매출 × (1 − 수수료))에 쓴다. 없으면 미설정
alter table public.popup_events add column if not exists fee_percent numeric(5,2)
  check (fee_percent is null or (fee_percent >= 0 and fee_percent <= 100));
