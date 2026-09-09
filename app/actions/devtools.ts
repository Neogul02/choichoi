'use server'

import { supabaseAdmin } from '@/lib/supabase-admin-client'
import type { ApiResponse } from '@/types/api'
import { requireAdmin, wrap } from './_base'

export interface SchemaColumn {
  name: string
  type: string
  nullable: boolean
  hasDefault: boolean
}

export interface SchemaForeignKey {
  column: string
  refTable: string
  refColumn: string
}

export interface SchemaTable {
  name: string
  /** Row Level Security 활성 여부 */
  rls: boolean
  rowCount: number
  primaryKey: string[]
  columns: SchemaColumn[]
  foreignKeys: SchemaForeignKey[]
}

/**
 * 실제 DB 카탈로그에서 읽은 public 스키마 스냅샷.
 * 예전에는 컴포넌트에 스키마를 손으로 적어두고 있어 테이블이 추가돼도 화면이 그대로였다
 * (19개만 적혀 있고 5개가 빠져 있었다). 여기서 매번 실제 구조를 읽는다.
 */
export async function fetchDbSchema(): Promise<ApiResponse<SchemaTable[]>> {
  return wrap(async () => {
    await requireAdmin()
    const { data, error } = await supabaseAdmin.rpc('dev_schema_snapshot')
    if (error) throw new Error(error.message)
    return (data ?? []) as SchemaTable[]
  })
}
