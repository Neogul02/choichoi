-- 권한 역할의 원본을 하나로: user_profiles.worker_role을 바꾸면 같은 트랜잭션에서 auth.users.raw_app_meta_data.role이 따라간다.
--
-- 왜: 권한 판단(proxy.ts·_base.ts → lib/auth-role.ts)은 JWT의 app_metadata.role을 보고, 설정 화면·로그인 후처리는
-- worker_role을 본다. 둘을 앱 코드가 따로 쓰고 있어서 한쪽만 바뀌는 경로(대시보드/SQL에서 worker_role 수정,
-- setUserRole 중간 실패, 복원)가 생기면 화면은 관리자인데 실제로는 일반 직원(또는 그 반대, 숨은 관리자)이 된다.
-- 역할이 없는 토큰은 조용히 일반 user로 처리되므로, 어긋나도 아무도 모른 채 지나간다.
--
-- worker_role을 기준으로 삼는 이유: 본인 쓰기 정책(users_update_own/users_insert_own)은 20261018135538에서 지웠으므로
-- service role(서버 액션)과 DB 관리자만 쓸 수 있다. app_metadata는 앱 밖(대시보드)에서 고치기 불편하고,
-- README의 관리자 추가 절차도 worker_role을 고치는 방식이다.
--
-- 같은 파일에 백필(멱등)을 둔다 — 2026-10-18(7ea8ccb 배포 직전)·10-21에 SQL로만 실행한 백필이 이력에 남지 않아,
-- 그 전 시점으로 복원하면 다시 실행할 근거가 없었다. 지금은 바뀌는 행이 0이어야 한다.
--
-- user_metadata의 role 키도 지운다. 아무 코드도 읽지 않지만(lib/roleSource.test.ts) 47개 계정 모두에 옛 값이 남아 있어,
-- 누가 실수로 그걸 읽는 코드를 넣으면 테스트 환경에서 멀쩡해 보이고 직원은 updateUser로 그 값을 admin으로 바꿀 수 있다.

create or replace function public.sync_worker_role_to_app_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    -- 프로필이 없는 계정이 app_metadata의 역할로 계속 관리자 권한을 갖지 않게 한다.
    -- auth 계정 삭제가 cascade로 이 행을 지울 때는 대상 행이 이미 없어 0행 갱신이다.
    update auth.users
       set raw_app_meta_data = raw_app_meta_data - 'role'
     where id = old.id
       and raw_app_meta_data ? 'role';
    return old;
  end if;

  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', new.worker_role)
   where id = new.id
     and raw_app_meta_data->>'role' is distinct from new.worker_role;
  return new;
end;
$$;

-- 트리거 함수는 RPC로 부를 수 없지만, public 스키마의 security definer라 실행 권한을 명시적으로 닫아 둔다
revoke all on function public.sync_worker_role_to_app_metadata() from public, anon, authenticated;

create trigger user_profiles_sync_role
after insert or update of worker_role or delete on public.user_profiles
for each row execute function public.sync_worker_role_to_app_metadata();

-- 백필(멱등)
update auth.users u
   set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', p.worker_role)
  from public.user_profiles p
 where p.id = u.id
   and u.raw_app_meta_data->>'role' is distinct from p.worker_role;

-- 아무도 읽지 않는 옛 역할 값 제거
update auth.users
   set raw_user_meta_data = raw_user_meta_data - 'role'
 where raw_user_meta_data ? 'role';
