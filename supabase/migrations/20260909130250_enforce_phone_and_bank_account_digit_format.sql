-- 전화번호·계좌번호는 하이픈 없는 숫자만 저장한다.
-- 서버 액션에서 이미 정규화하지만, 어떤 경로로 들어와도 형식이 깨지지 않도록 DB에서 최종 방어한다.
-- (전화번호는 초기 비밀번호로 쓰이고 계좌번호는 급여 송금에 그대로 쓰이므로 형식이 흔들리면 사고가 난다)

-- 전화번호: 0으로 시작하는 9~11자리 (02 지역번호 9자리 ~ 휴대폰 11자리)
alter table public.user_profiles
  add constraint user_profiles_phone_digits_only
  check (phone is null or phone ~ '^0[0-9]{8,10}$');

alter table public.staff_profiles
  add constraint staff_profiles_phone_digits_only
  check (phone is null or phone ~ '^0[0-9]{8,10}$');

-- 계좌번호: 숫자 10~16자리 (씨티 11자리 ~ 국민·하나 14자리를 포함하는 실사용 범위)
alter table public.user_profiles
  add constraint user_profiles_bank_account_digits_only
  check (bank_account is null or bank_account ~ '^[0-9]{10,16}$');

alter table public.staff_profiles
  add constraint staff_profiles_bank_account_digits_only
  check (bank_account is null or bank_account ~ '^[0-9]{10,16}$');
