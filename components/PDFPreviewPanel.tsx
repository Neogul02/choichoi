'use client'

import { useEffect, useRef, useState } from 'react'
import { usePDF } from '@react-pdf/renderer'
import { ContractDocument } from './ContractDocument'
import type { ContractData } from './ContractDocument'

interface Props {
  contractData: ContractData
}

// 브라우저 내장 PDF 뷰어(iframe)는 데스크탑(넓은 화면 + 정밀 포인터)에서만 신뢰할 수 있다.
// iOS Safari는 iframe 속 PDF를 첫 페이지만 깨진 배율로 보여주고,
// Android Chrome은 인라인 PDF 렌더링을 지원하지 않아 빈 화면이 된다 → 모바일은 pdf.js 캔버스로 직접 렌더.
const canUseNativePdfViewer = () =>
  window.matchMedia('(min-width: 768px) and (pointer: fine)').matches

/** pdf.js로 각 페이지를 캔버스에 그리는 모바일용 미리보기 */
function PdfCanvasView({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const container = containerRef.current

    const render = async (target: HTMLDivElement) => {
      try {
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
        const task = pdfjs.getDocument({ url })
        const doc = await task.promise
        if (cancelled) { void task.destroy(); return }

        target.replaceChildren()
        const width = target.clientWidth || window.innerWidth
        // 레티나 선명도는 살리되 페이지 수 × 고배율 캔버스로 인한 메모리 폭주는 방지
        const dpr = Math.min(window.devicePixelRatio || 1, 2)

        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i)
          if (cancelled) break
          const base = page.getViewport({ scale: 1 })
          const viewport = page.getViewport({ scale: (width / base.width) * dpr })
          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          canvas.className = 'block w-full bg-white rounded shadow mb-2'
          target.appendChild(canvas)
          await page.render({ canvas, viewport }).promise
        }
        void task.destroy()
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    }

    if (container) void render(container)
    return () => { cancelled = true }
  }, [url])

  return (
    <div className='h-full overflow-y-auto bg-canvas-soft p-2'>
      <div ref={containerRef} />
      {error && (
        <p className='m-0 px-3 py-1.5 rounded bg-red-50 border border-red-200 text-[11px] text-red-600'>
          미리보기 오류: {error}
        </p>
      )}
    </div>
  )
}

// usePDF는 클라이언트에서만 동작 — PDFRenderer를 분리해 마운트 후 렌더
function PDFRenderer({ contractData }: Props) {
  const [instance, updateInstance] = usePDF({
    document: <ContractDocument {...contractData} />,
  })
  const [displayUrl, setDisplayUrl] = useState<string | null>(null)
  const [useNativeViewer, setUseNativeViewer] = useState(true)

  useEffect(() => { setUseNativeViewer(canUseNativePdfViewer()) }, [])

  // contractData 레퍼런스가 바뀔 때마다 재렌더 (부모에서 debounce로 빈도 제어)
  useEffect(() => {
    updateInstance(<ContractDocument {...contractData} />)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractData])

  // 로딩 완료 시에만 displayUrl 교체 → 기존 뷰 유지하다가 조용히 교체
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
      {useNativeViewer ? (
        <iframe
          src={displayUrl}
          className='w-full h-full border-none'
          title='근로계약서 미리보기'
        />
      ) : (
        <PdfCanvasView url={displayUrl} />
      )}
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
