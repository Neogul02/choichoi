'use client';

import { useEffect, useRef, useCallback } from 'react';
import { getEmoji } from '@/lib/emoji-map';
import type { CartItem } from '@/types/display';

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  emoji: string;
  rotation: number;
  rotationSpeed: number;
  size: number;
  opacity: number;
  fadingOut: boolean;
}

const MAX_PARTICLES = 35;

function spawnParticles(items: CartItem[], width: number, height: number): Particle[] {
  const particles: Particle[] = [];
  // 화면이 넓을수록 파티클 크기를 줄여 아이패드에서 너무 크게 보이는 문제 방지
  const responsiveScale = Math.max(0.65, Math.min(1, 450 / Math.max(width, 450)));
  for (const item of items) {
    const emoji = getEmoji(item.name);
    const count = Math.min(Math.max(item.count * 3, 6), 12);
    for (let i = 0; i < count; i++) {
      particles.push({
        x: width * 0.15 + Math.random() * width * 0.7,
        y: height * 0.1 + Math.random() * height * 0.2,
        vx: (Math.random() - 0.5) * 14,
        vy: -(8 + Math.random() * 9),
        emoji,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 5,
        size: (80 + Math.random() * 18) * responsiveScale,
        opacity: 1,
        fadingOut: false,
      });
    }
  }
  return particles;
}

function resolveCollisions(particles: Particle[]) {
  const RESTITUTION = 0.6;
  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      const a = particles[i];
      const b = particles[j];
      if (a.fadingOut || b.fadingOut) continue;
      const minDist = (a.size + b.size) / 2;
      const minDist2 = minDist * minDist;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist2 = dx * dx + dy * dy;
      if (dist2 === 0 || dist2 >= minDist2) continue;
      const dist = Math.sqrt(dist2);
      const overlap = (minDist - dist) / 2;
      const nx = dx / dist;
      const ny = dy / dist;
      a.x -= overlap * nx;
      a.y -= overlap * ny;
      b.x += overlap * nx;
      b.y += overlap * ny;
      const dot = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (dot <= 0) continue;
      a.vx -= dot * nx * RESTITUTION;
      a.vy -= dot * ny * RESTITUTION;
      b.vx += dot * nx * RESTITUTION;
      b.vy += dot * ny * RESTITUTION;
      a.rotationSpeed *= -0.7;
      b.rotationSpeed *= -0.7;
    }
  }
}

interface Props {
  items: CartItem[];
  active: boolean;
}

export default function EmojiPhysics({ items, active }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number | null>(null);
  const prevActiveRef = useRef(false);

  const runLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const GRAVITY = 0.38;
    const FLOOR_BOUNCE = 0.55;
    const WALL_BOUNCE = 0.65;
    const FADE_SPEED = 0.012;

    ctx.clearRect(0, 0, W, H);
    particlesRef.current = particlesRef.current.filter((p) => p.opacity > 0);
    resolveCollisions(particlesRef.current);

    for (const p of particlesRef.current) {
      p.vy += GRAVITY;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.rotationSpeed;

      if (p.x - p.size / 2 < 0) {
        p.x = p.size / 2;
        p.vx = Math.abs(p.vx) * WALL_BOUNCE;
        p.rotationSpeed *= -0.8;
      } else if (p.x + p.size / 2 > W) {
        p.x = W - p.size / 2;
        p.vx = -Math.abs(p.vx) * WALL_BOUNCE;
        p.rotationSpeed *= -0.8;
      }

      if (p.y + p.size / 2 > H) {
        p.y = H - p.size / 2;
        p.vy = -Math.abs(p.vy) * FLOOR_BOUNCE;
        p.vx *= 0.85;
        p.rotationSpeed *= 0.8;
        if (Math.abs(p.vy) < 1.5) p.fadingOut = true;
      }

      if (p.fadingOut) {
        p.opacity = Math.max(0, p.opacity - FADE_SPEED);
      }

      ctx.save();
      ctx.globalAlpha = p.opacity;
      ctx.font = `${p.size}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.fillText(p.emoji, 0, 0);
      ctx.restore();
    }

    rafRef.current = requestAnimationFrame(runLoop);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    let cleanup = () => {};

    if (canvas) {
      const resize = () => {
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
      };
      resize();
      window.addEventListener('resize', resize);
      rafRef.current = requestAnimationFrame(runLoop);
      cleanup = () => {
        window.removeEventListener('resize', resize);
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
    }

    return cleanup;
  }, [runLoop]);

  useEffect(() => {
    const wasActive = prevActiveRef.current;
    prevActiveRef.current = active;

    if (active && !wasActive) {
      const canvas = canvasRef.current;
      if (!canvas || items.length === 0) return;
      const next = [...particlesRef.current, ...spawnParticles(items, canvas.width, canvas.height)];
      particlesRef.current = next.length > MAX_PARTICLES ? next.slice(next.length - MAX_PARTICLES) : next;
    } else if (!active && wasActive) {
      particlesRef.current.forEach((p) => { p.fadingOut = true; });
    }
  }, [active, items]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 h-full w-full"
      style={{ zIndex: 25 }}
    />
  );
}
