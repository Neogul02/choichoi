'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const CHEER_EMOJIS = ['❤️', '🎉', '✨', '🔥', '💪', '👏', '🌟', '💖', '🥰', '🎊']

interface EmojiParticle { id: number; emoji: string; x: number; delay: number; dur: number }

export default function FloatingEmojis({ burstKey }: { burstKey: number }) {
  const [particles, setParticles] = useState<EmojiParticle[]>([])

  useEffect(() => {
    if (!burstKey) return () => {}
    const items = Array.from({ length: 14 }, (_, i) => ({
      id: Date.now() + i,
      emoji: CHEER_EMOJIS[Math.floor(Math.random() * CHEER_EMOJIS.length)],
      x: 3 + Math.random() * 94,
      delay: Math.random() * 0.5,
      dur: 1.6 + Math.random() * 0.8,
    }))
    setParticles(items)
    const t = setTimeout(() => setParticles([]), 3500)
    return () => clearTimeout(t)
  }, [burstKey])

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      <AnimatePresence>
        {particles.map((p) => (
          <motion.div
            key={p.id}
            initial={{ y: 0, opacity: 1, scale: 0.5 }}
            animate={{ y: -900, opacity: [1, 1, 0], scale: [0.5, 1.2, 1] }}
            transition={{ duration: p.dur, delay: p.delay, ease: 'easeOut' }}
            style={{ left: `${p.x}%`, bottom: 0, position: 'absolute', transform: 'translateX(-50%)' }}
            className="text-5xl select-none"
          >
            {p.emoji}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
