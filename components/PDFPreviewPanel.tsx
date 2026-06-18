'use client'

import { useEffect, useState } from 'react'
import { usePDF } from '@react-pdf/renderer'
import { ContractDocument } from './ContractDocument'
import type { ContractData } from './ContractDocument'

interface Props {
  contractData: ContractData
}

// usePDF는 클라이언트에서만 동작 — PDFRenderer를 분리해 마운트 후 렌더
function PDFRenderer({ contractData }: Props) {
  const [instance, updateInstance] = usePDF({
    document: <ContractDocument {...contractData} />,
  })
  const [displayUrl, setDisplayUrl] = useState<string | null>(null)

  // contractData 레퍼런스가 바뀔 때마다 재렌더 (부모에서 debounce로 빈도 제어)
  useEffect(() => {
    updateInstance(<ContractDocument {...contractData} />)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractData])

  // 로딩 완료 시에만 displayUrl 교체 → 기존 iframe 유지하다가 조용히 교체
  useEffect(() => {
    if (!instance.loading && instance.url) {
      setDisplayUrl(instance.url)
    }
  }, [instance.loading, instance.url])

  if (!displayUrl) {
    return (
      <div className='flex flex-col items-center justify-center h-full gap-2'>
        <div className='w-6 h-6 border-2 border-primary-700 border-t-transparent rounded-full animate-spin' />
        <span className='text-ink-muted text-sm'>PDF 렌더링 중...</span>
      </div>
    )
  }

  return (
    <div className='relative w-full h-full'>
      <iframe
        src={displayUrl}
        className='w-full h-full border-none'
        title='근로계약서 미리보기'
      />
      {instance.loading && (
        <div className='absolute top-2 right-2 flex items-center gap-1.5 bg-canvas/90 border border-hairline rounded-full px-2.5 py-1 shadow text-[10px] text-ink-muted'>
          <div className='w-3 h-3 border border-primary-700 border-t-transparent rounded-full animate-spin' />
          갱신 중...
        </div>
      )}
      {instance.error && (
        <div className='absolute bottom-2 left-2 right-2 bg-red-50 border border-red-200 rounded px-3 py-1.5 text-[11px] text-red-600'>
          미리보기 오류: {String(instance.error)}
        </div>
      )}
    </div>
  )
}

export default function PDFPreviewPanel({ contractData }: Props) {
  const [isMounted, setIsMounted] = useState(false)
  useEffect(() => { setIsMounted(true) }, [])

  if (!isMounted) {
    return (
      <div className='flex items-center justify-center h-full text-ink-muted text-sm'>
        미리보기 준비 중...
      </div>
    )
  }

  return <PDFRenderer contractData={contractData} />
}
