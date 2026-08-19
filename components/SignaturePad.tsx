'use client'

import { useRef, useEffect, useState } from 'react'

interface Props {
  onSave: (base64: string) => void
  onClear: () => void
}

export default function SignaturePad({ onSave, onClear }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawing = useRef(false)
  const [hasSig, setHasSig] = useState(false)
  const [autoSaved, setAutoSaved] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#111'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  function getPos(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if ('touches' in e) {
      const t = e.touches[0]
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY }
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    isDrawing.current = true
    setAutoSaved(false) // 새 획을 그리기 시작하면 직전 자동 저장은 낡은 상태가 됨
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const { x, y } = getPos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    if (!isDrawing.current) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const { x, y } = getPos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    setHasSig(true)
  }

  function endDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    const wasDrawing = isDrawing.current
    isDrawing.current = false
    // 획을 그리자마자 자동 저장 — 별도로 "서명 저장" 버튼을 눌러야 하는 걸 잊고
    // "서명 완료"를 눌러버리는 실수를 막는다. 버튼은 남겨두되 이미 저장된 상태를 보여준다.
    if (wasDrawing) handleSave()
  }

  function handleClear() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    setHasSig(false)
    setAutoSaved(false)
    onClear()
  }

  function handleSave() {
    const canvas = canvasRef.current
    if (!canvas) return
    onSave(canvas.toDataURL('image/png'))
    setAutoSaved(true)
  }

  return (
    <div className='space-y-2'>
      <p className='text-[12px] text-ink-muted'>서명 (마우스 또는 터치로 서명하세요)</p>
      <div className='border border-hairline rounded-lg overflow-hidden bg-white'>
        <canvas
          ref={canvasRef}
          width={520}
          height={250}
          className='w-full touch-none cursor-crosshair'
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
      </div>
      <div className='flex gap-2'>
        <button
          type='button'
          onClick={handleClear}
          className='px-4 py-1.5 rounded-lg border border-hairline text-[12px] text-ink-muted hover:bg-canvas-soft transition-colors bg-transparent cursor-pointer'
        >
          초기화
        </button>
        <button
          type='button'
          onClick={handleSave}
          disabled={!hasSig}
          className={`px-4 py-1.5 rounded-lg border-none text-[12px] font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${
            autoSaved ? 'bg-emerald-600 text-white' : 'bg-primary-700 text-white'
          }`}
        >
          {autoSaved ? '저장됨 ✓' : '서명 저장'}
        </button>
      </div>
    </div>
  )
}
