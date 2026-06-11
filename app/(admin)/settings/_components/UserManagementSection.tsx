'use client'

import { useEffect, useState } from 'react'
import { fetchAllUserProfiles } from '@/app/actions/workers'
import type { UserProfile } from '@/app/actions/workers'

export default function UserManagementSection() {
  const [users, setUsers] = useState<UserProfile[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchAllUserProfiles().then((res) => {
      if (res.success && res.data) setUsers(res.data)
      setIsLoading(false)
    })
  }, [])

  if (isLoading) return <p className='text-ink-muted text-sm'>불러오는 중...</p>
  if (users.length === 0) return <p className='text-ink-muted text-sm'>등록된 직원이 없습니다.</p>

  return (
    <div className='space-y-2'>
      <p className='text-[13px] text-ink-muted mb-3'>총 {users.length}명</p>
      {users.map((u) => (
        <div key={u.id} className='bg-canvas-soft rounded-xl p-4 border border-hairline'>
          <div className='flex items-start justify-between gap-3'>
            <div className='flex-1 min-w-0'>
              <div className='flex items-center gap-2 mb-1.5'>
                <span className='font-bold text-[15px] text-ink'>{u.name}</span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                  u.worker_role === 'admin'
                    ? 'bg-primary-50 text-primary-700 border-primary-200'
                    : 'bg-canvas text-ink-muted border-hairline'
                }`}>
                  {u.worker_role === 'admin' ? '관리자' : '직원'}
                </span>
              </div>
              <div className='grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[12px] text-ink-muted'>
                <span>📱 {u.phone ?? '전화번호 미등록'}</span>
                <span>🏦 {u.bank_name && u.bank_account ? `${u.bank_name} ${u.bank_account}` : '계좌 미등록'}</span>
              </div>
            </div>
            <div className='shrink-0'>
              {u.health_cert_url ? (
                <a
                  href={u.health_cert_url}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[12px] font-semibold hover:bg-emerald-100 transition-colors no-underline'
                >
                  보건증 보기
                </a>
              ) : (
                <span className='inline-flex items-center px-3 py-1.5 rounded-lg bg-canvas text-ink-faint border border-hairline text-[12px]'>
                  보건증 없음
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
