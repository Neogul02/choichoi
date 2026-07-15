import Image from 'next/image'

// 로딩 전용 화면 — 인증 확인(PasswordGate)과 라우트 전환(loading.tsx)에서 공용
// 흰 빈 화면 대신 즉시 브랜드 스플래시를 보여준다
export default function LoadingScreen({ label = '불러오는 중...' }: { label?: string }) {
  return (
    <div className="min-h-screen bg-[#f5f6f7] flex flex-col items-center justify-center gap-4">
      <Image
        src="/choichoi-logo.png"
        alt="ChoiChoi"
        width={64}
        height={64}
        priority
        className="rounded-2xl animate-pulse"
      />
      <div className="flex items-center gap-2 text-ink-faint text-sm">
        <span className="w-4 h-4 rounded-full border-2 border-hairline border-t-primary-700 animate-spin" />
        {label}
      </div>
    </div>
  )
}
