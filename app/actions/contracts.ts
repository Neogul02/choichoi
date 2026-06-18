'use server'

import { wrap } from './_base'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import React from 'react'
import type { ApiResponse } from '@/types/api'

export type ContractInput = {
  workerId: number
  workerName: string
  popupId?: number
  startDate: string
  endDate?: string
  hourlyRate: number
  workSchedule?: string
  workplace?: string
  signatureBase64?: string
  contractData?: import('@/components/ContractDocument').ContractData
}

export type ContractRecord = {
  id: string
  worker_id: number
  popup_id: number | null
  start_date: string
  end_date: string | null
  hourly_rate: number
  work_schedule: string | null
  workplace: string | null
  pdf_url: string | null        // storage 경로 (예: "42/uuid.pdf")
  pdf_signed_url?: string       // 조회 시 생성되는 1시간 유효 URL
  pdf_hash: string | null
  contract_data: import('@/components/ContractDocument').ContractData | null
  worker_address: string | null
  worker_signed_at: string | null
  issued_at: string
  created_at: string
}

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

async function attachSignedUrls(
  admin: ReturnType<typeof getAdminClient>,
  contracts: ContractRecord[],
): Promise<ContractRecord[]> {
  return Promise.all(
    contracts.map(async (c) => {
      if (!c.pdf_url) return c
      const { data } = await admin.storage
        .from('contracts')
        .createSignedUrl(c.pdf_url, 3600) // 1시간 유효
      return { ...c, pdf_signed_url: data?.signedUrl ?? undefined }
    }),
  )
}

export async function generateContract(
  input: ContractInput,
): Promise<ApiResponse<{ url: string; contractId: string }>> {
  return wrap(async () => {
    const admin = getAdminClient()

    const { data: contractRow, error: insertError } = await admin
      .from('contracts')
      .insert({
        worker_id: input.workerId,
        popup_id: input.popupId ?? null,
        start_date: input.startDate,
        end_date: input.endDate ?? null,
        hourly_rate: input.hourlyRate,
        work_schedule: input.workSchedule ?? null,
        workplace: input.workplace ?? null,
      })
      .select()
      .single()

    if (insertError) throw insertError

    const { renderToBuffer, Document } = await import('@react-pdf/renderer')
    const { ContractDocument } = await import('@/components/ContractDocument')

    const docProps = input.contractData ?? {
      employerName: '',
      employerAddress: '',
      employerRepresentative: '',
      employerPhone: '',
      workerName: input.workerName,
      startDate: input.startDate,
      endDate: input.endDate,
      workplace: input.workplace ?? '',
      jobDescription: '',
      workDays: [],
      weeklyHolidayDay: '',
      hourlyRate: input.hourlyRate,
      hasBonus: false,
      hasOtherAllowance: false,
      overtimeRate: 50,
      paymentDay: '25',
      paymentDirect: false,
      paymentTransfer: true,
      insuranceEmployment: true,
      insuranceIndustrial: true,
      insurancePension: false,
      insuranceHealth: false,
      employerSignatureBase64: input.signatureBase64,
      issueDate: new Date().toISOString().slice(0, 10),
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const element = React.createElement(ContractDocument, docProps) as React.ReactElement<React.ComponentProps<typeof Document>>

    const pdfBuffer = await renderToBuffer(element)
    const hash = createHash('sha256').update(Buffer.from(pdfBuffer)).digest('hex')

    // storage 경로를 pdf_url에 저장 (public URL 아님)
    const storagePath = `${input.workerId}/${contractRow.id}.pdf`

    const { error: uploadError } = await admin.storage
      .from('contracts')
      .upload(storagePath, pdfBuffer, { contentType: 'application/pdf', upsert: true })

    if (uploadError) throw uploadError

    await admin
      .from('contracts')
      .update({ pdf_url: storagePath, pdf_hash: hash, contract_data: docProps })
      .eq('id', contractRow.id)

    // 반환용 signed URL (1시간)
    const { data: signed } = await admin.storage
      .from('contracts')
      .createSignedUrl(storagePath, 3600)

    return { url: signed?.signedUrl ?? storagePath, contractId: contractRow.id as string }
  })
}

export async function getMyContracts(): Promise<ApiResponse<ContractRecord[]>> {
  return wrap(async () => {
    const { createSupabaseServerClient } = await import('@/lib/supabase-server')
    const supabase = await createSupabaseServerClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('로그인이 필요합니다')

    const admin = getAdminClient()

    const { data: workerRows } = await admin
      .from('workers')
      .select('id')
      .eq('user_profile_id', session.user.id)

    if (!workerRows?.length) return []

    const workerIds = workerRows.map((w: { id: number }) => w.id)
    const { data, error } = await admin
      .from('contracts')
      .select('*')
      .in('worker_id', workerIds)
      .order('issued_at', { ascending: false })

    if (error) throw error
    return attachSignedUrls(admin, (data ?? []) as ContractRecord[])
  })
}

export async function deleteContract(
  contractId: string,
): Promise<ApiResponse<void>> {
  return wrap(async () => {
    const admin = getAdminClient()

    // storage 경로 조회
    const { data: row } = await admin
      .from('contracts')
      .select('pdf_url, worker_id')
      .eq('id', contractId)
      .single()

    // storage 파일 삭제 (경로가 있는 경우)
    if (row?.pdf_url) {
      await admin.storage.from('contracts').remove([row.pdf_url])
    }

    // DB 행 삭제
    const { error } = await admin.from('contracts').delete().eq('id', contractId)
    if (error) throw error
  })
}

export async function getWorkerContracts(
  workerId: number,
): Promise<ApiResponse<ContractRecord[]>> {
  return wrap(async () => {
    const admin = getAdminClient()
    const { data, error } = await admin
      .from('contracts')
      .select('*')
      .eq('worker_id', workerId)
      .order('issued_at', { ascending: false })
    if (error) throw error
    return attachSignedUrls(admin, (data ?? []) as ContractRecord[])
  })
}

export async function fetchWorkerScheduleForContract(
  workerId: number,
  eventId: number,
): Promise<ApiResponse<import('@/components/ContractDocument').WorkDaySchedule[]>> {
  return wrap(async () => {
    const admin = getAdminClient()
    const { data, error } = await admin
      .from('schedule_slots')
      .select('schedule_date, work_time, break_time')
      .eq('worker_id', workerId)
      .eq('event_id', eventId)
      .not('work_time', 'is', null)

    if (error) throw error
    if (!data?.length) return []

    // 요일별로 그룹화 → 가장 빈번한 work_time 패턴 선택
    const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'] as const
    const byDay: Record<string, Record<string, { count: number; breakTime: number }>> = {}

    for (const slot of data) {
      const day = DAY_NAMES[new Date(slot.schedule_date).getDay()]
      const wt = slot.work_time!
      if (!byDay[day]) byDay[day] = {}
      if (!byDay[day][wt]) byDay[day][wt] = { count: 0, breakTime: slot.break_time ?? 0 }
      byDay[day][wt].count++
    }

    const DAY_ORDER = ['월', '화', '수', '목', '금', '토', '일'] as const
    const fmt = (mins: number) =>
      `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`

    return DAY_ORDER.filter(d => byDay[d]).map(day => {
      const [workTime, { breakTime }] = Object.entries(byDay[day]).sort((a, b) => b[1].count - a[1].count)[0]
      const [startTime, endTime] = workTime.split(/[-~]/)

      let breakStart = ''
      let breakEnd = ''
      if (breakTime > 0 && startTime && endTime) {
        const [sh, sm] = startTime.split(':').map(Number)
        const [eh, em] = endTime.split(':').map(Number)
        const totalMins = (eh * 60 + em) - (sh * 60 + sm)
        const midMins = sh * 60 + sm + Math.floor(totalMins / 2)
        breakStart = fmt(midMins - Math.floor(breakTime / 2))
        breakEnd = fmt(midMins - Math.floor(breakTime / 2) + breakTime)
      }

      return { day, startTime: startTime ?? '', endTime: endTime ?? '', breakStart, breakEnd }
    })
  })
}

export async function signContract(
  contractId: string,
  workerAddress: string,
  workerSignatureBase64: string,
): Promise<ApiResponse<{ url: string }>> {
  return wrap(async () => {
    const { createSupabaseServerClient } = await import('@/lib/supabase-server')
    const supabase = await createSupabaseServerClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('로그인이 필요합니다')

    const admin = getAdminClient()

    const { data: row, error: fetchError } = await admin
      .from('contracts')
      .select('*, workers!inner(user_profile_id, name)')
      .eq('id', contractId)
      .single()

    if (fetchError || !row) throw new Error('계약서를 찾을 수 없습니다')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((row as any).workers.user_profile_id !== session.user.id) throw new Error('권한이 없습니다')
    if (row.worker_signed_at) throw new Error('이미 서명된 계약서입니다')

    let finalSignedUrl: string | null = null

    if (row.contract_data) {
      type CD = import('@/components/ContractDocument').ContractData
      const contractData: CD = {
        ...(row.contract_data as CD),
        workerAddress,
        workerSignatureBase64,
      }

      const { renderToBuffer, Document } = await import('@react-pdf/renderer')
      const { ContractDocument } = await import('@/components/ContractDocument')

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const element = React.createElement(ContractDocument, contractData) as React.ReactElement<React.ComponentProps<typeof Document>>
      const pdfBuffer = await renderToBuffer(element)
      const hash = createHash('sha256').update(Buffer.from(pdfBuffer)).digest('hex')

      const storagePath = `${row.worker_id}/${contractId}.pdf`
      await admin.storage.from('contracts').upload(storagePath, pdfBuffer, { contentType: 'application/pdf', upsert: true })
      await admin.from('contracts').update({ pdf_hash: hash }).eq('id', contractId)

      const { data: signed } = await admin.storage.from('contracts').createSignedUrl(storagePath, 3600)
      finalSignedUrl = signed?.signedUrl ?? null
    }

    await admin.from('contracts').update({
      worker_address: workerAddress,
      worker_signed_at: new Date().toISOString(),
    }).eq('id', contractId)

    const { notifyDiscord } = await import('@/lib/discord')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const workerName = (row as any).workers.name ?? '알 수 없음'
    await notifyDiscord(
      'add',
      '✍️ 근로계약서 서명 완료',
      `**${workerName}** 이(가) 근로계약서에 서명했습니다.\n근로기간: ${row.start_date}${row.end_date ? ` ~ ${row.end_date}` : '~'}`,
    )

    return { url: finalSignedUrl ?? (row.pdf_url ?? '') }
  })
}
