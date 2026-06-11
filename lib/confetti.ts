import confetti from 'canvas-confetti'

const TIER_CONFETTI_COLORS: Record<string, string[]> = {
  BRONZE:     ['#cd7f32', '#e0a36b', '#f4d4b0', '#a0531f', '#e8956d'],
  SILVER:     ['#a8b1bd', '#cfd5dd', '#ffffff', '#6b7785', '#e0e4e8'],
  GOLD:       ['#f59e0b', '#fcd34d', '#fef3c7', '#c2410c', '#f97316'],
  PLATINUM:   ['#0d9488', '#2dd4bf', '#99f6e4', '#ccfbf1', '#0f766e'],
  DIAMOND:    ['#2563eb', '#60a5fa', '#bfdbfe', '#3b82f6', '#93c5fd'],
  MASTER:     ['#7c3aed', '#a78bfa', '#ede9fe', '#c084fc', '#6d28d9'],
  CHALLENGER: ['#fbbf24', '#fde68a', '#dc2626', '#f59e0b', '#ef4444'],
}

const BASE_COLORS = ['#f43f5e', '#fb7185', '#fda4af', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa']

export function fireConfetti() {
  confetti({
    particleCount: 90,
    spread: 70,
    origin: { x: 0.5, y: 0.55 },
    colors: BASE_COLORS,
    startVelocity: 42,
    gravity: 1.1,
    ticks: 100,
    scalar: 1.1,
  })
  setTimeout(() => {
    confetti({
      particleCount: 55,
      spread: 58,
      origin: { x: 0.18, y: 0.62 },
      angle: 65,
      colors: BASE_COLORS,
      startVelocity: 36,
      gravity: 1.1,
      ticks: 80,
    })
    confetti({
      particleCount: 55,
      spread: 58,
      origin: { x: 0.82, y: 0.62 },
      angle: 115,
      colors: BASE_COLORS,
      startVelocity: 36,
      gravity: 1.1,
      ticks: 80,
    })
  }, 110)
  setTimeout(() => {
    confetti({
      particleCount: 35,
      spread: 100,
      origin: { x: 0.5, y: 0.48 },
      colors: BASE_COLORS,
      startVelocity: 22,
      gravity: 0.75,
      ticks: 70,
      scalar: 0.85,
    })
  }, 240)
}

export function fireTierConfetti(tierName: string) {
  const colors = TIER_CONFETTI_COLORS[tierName] ?? ['#f43f5e', '#fbbf24']
  confetti({ particleCount: 130, spread: 85, origin: { x: 0.5, y: 0.5 }, colors, startVelocity: 52, gravity: 1.0, ticks: 130, scalar: 1.2 })
  setTimeout(() => {
    confetti({ particleCount: 65, spread: 65, origin: { x: 0.15, y: 0.65 }, angle: 65, colors, startVelocity: 40, gravity: 1.0, ticks: 100 })
    confetti({ particleCount: 65, spread: 65, origin: { x: 0.85, y: 0.65 }, angle: 115, colors, startVelocity: 40, gravity: 1.0, ticks: 100 })
  }, 150)
}
