'use server'

import { supabaseAdmin } from '@/lib/supabase-admin-client'
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
  return supabaseAdmin
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

    const { data: staffRow } = await admin.from('staff_profiles').select('id').eq('id', input.workerId).maybeSingle()
    if (!staffRow) throw new Error('근무자 정보를 찾을 수 없습니다. 목록을 새로고침한 뒤 다시 시도하세요.')

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

    const { data: staffRows } = await admin.from('staff_profiles').select('id').eq('user_profile_id', session.user.id)
    const staffIds = (staffRows ?? []).map(s => s.id)
    if (!staffIds.length) return []

    const { data, error } = await admin
      .from('contracts')
      .select('*')
      .in('worker_id', staffIds)
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

export async function fetchContractedStaffIds(): Promise<ApiResponse<number[]>> {
  return wrap(async () => {
    const admin = getAdminClient()
    const { data, error } = await admin.from('contracts').select('worker_id')
    if (error) throw error
    return Array.from(new Set((data ?? []).map(c => c.worker_id)))
  })
}

export async function fetchAllContracts(): Promise<ApiResponse<ContractRecord[]>> {
  return wrap(async () => {
    const admin = getAdminClient()
    const { data, error } = await admin
      .from('contracts')
      .select('*')
      .order('issued_at', { ascending: false })
    if (error) throw error
    // 계약서당 signed URL 1회 발급 — 수십 건 규모 전제. 수백 건 이상이면 on-demand 발급으로 전환할 것
    return attachSignedUrls(admin, (data ?? []) as ContractRecord[])
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
      .select('*')
      .eq('id', contractId)
      .single()

    if (fetchError || !row) throw new Error('계약서를 찾을 수 없습니다')

    const { data: ownerRecord, error: ownerError } = await admin
      .from('staff_profiles')
      .select('id, name')
      .eq('id', row.worker_id)
      .eq('user_profile_id', session.user.id)
      .maybeSingle()
    if (ownerError) throw ownerError
    if (!ownerRecord) throw new Error('권한이 없습니다')

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
    const workerName = ownerRecord.name ?? '알 수 없음'
    await notifyDiscord(
      'add',
      '✍️ 근로계약서 서명 완료',
      `**${workerName}** 이(가) 근로계약서에 서명했습니다.\n근로기간: ${row.start_date}${row.end_date ? ` ~ ${row.end_date}` : '~'}`,
    )

    return { url: finalSignedUrl ?? (row.pdf_url ?? '') }
  })
}
