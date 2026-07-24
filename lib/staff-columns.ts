// staff_profiles select 컬럼 목록 — app/actions/staff.ts와 app/actions/staffPopups.ts에서 공유
// ('use server' 파일은 async 함수만 export 가능해 상수는 별도 모듈에 둔다)
export const STAFF_COLUMNS = 'id, name, phone, bank_name, bank_account, staff_role, popup_id, preferred_shift_ids, preferred_days, available_ranges, has_health_cert, health_cert_url, wants_insurance, hourly_rate, max_days_per_week, status, notes, user_profile_id, sort_order, created_at, updated_at'
