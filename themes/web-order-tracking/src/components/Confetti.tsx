/**
 * Lightweight CSS confetti burst — no external dependencies.
 * Creates DOM particles with CSS transform/opacity animations (GPU-friendly).
 * Respects prefers-reduced-motion via the global design-system guard.
 */
import { useEffect, useState } from 'react';

const COLORS = ['#10b981', '#6ee7b7', '#d1fae5', '#f59e0b', '#3b82f6', '#ef4444'];
const PARTICLE_COUNT = 24;

interface Particle {
  id: number;
  color: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  delay: number;
  duration: number;
  driftX: number;
  driftY: number;
}

function createParticles(): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
    id: i,
    color: COLORS[i % COLORS.length]!,
    x: 50 + (Math.random() - 0.5) * 30,
    y: 40 + Math.random() * 10,
    rotation: Math.random() * 360,
    scale: 0.5 + Math.random() * 0.8,
    delay: Math.random() * 0.3,
    duration: 0.8 + Math.random() * 0.6,
    driftX: (Math.random() - 0.5) * 120,
    driftY: -(40 + Math.random() * 80),
  }));
}

export function Confetti({ active }: { active: boolean }) {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    if (active) {
      setParticles(createParticles());
      const timeout = setTimeout(() => setParticles([]), 2000);
      return () => clearTimeout(timeout);
    }
    setParticles([]);
  }, [active]);

  if (particles.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden="true">
      {particles.map((p) => (
        <span
          key={p.id}
          style={{
            position: 'absolute',
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: '8px',
            height: '8px',
            borderRadius: p.id % 3 === 0 ? '50%' : '2px',
            backgroundColor: p.color,
            opacity: 0,
            transform: `translate(0, 0) rotate(${p.rotation}deg) scale(${p.scale})`,
            animation: `confetti-burst ${p.duration}s var(--ease-out-expo) ${p.delay}s forwards`,
            // Custom properties for the keyframe to reference
            ['--drift-x' as string]: `${p.driftX}px`,
            ['--drift-y' as string]: `${p.driftY}px`,
          }}
        />
      ))}
    </div>
  );
}
