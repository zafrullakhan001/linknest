import React, { useEffect, useRef } from 'react';
import type { CelebrationConfig } from '../types';

interface Firefly {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  speed: number;
  size: number;
  opacity: number;
}

interface TileFirefliesProps {
  trigger: number;
  tileRef?: React.RefObject<HTMLDivElement>;
  config?: CelebrationConfig;
}

export const TileFireflies: React.FC<TileFirefliesProps> = ({ trigger, tileRef, config }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const firefliesRef = useRef<Firefly[]>([]);
  const animationFrameRef = useRef<number>();

  const intensity = Math.max(1, Math.min(100, config?.intensity ?? 100)) / 100;
  const count = Math.max(6, Math.min(25, config?.particleCount ?? 12));
  const sizeMul = Math.max(0.5, Math.min(2, (config?.particleSize ?? 100) / 100));
  const speedMul = Math.max(0.2, Math.min(2, (config?.speed ?? 100) / 100));

  const createFireflies = (canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    for (let i = 0; i < count; i++) {
      firefliesRef.current.push({
        x: Math.random() * rect.width,
        y: Math.random() * rect.height,
        vx: (Math.random() - 0.5) * 0.4 * intensity * speedMul,
        vy: (Math.random() - 0.5) * 0.4 * intensity * speedMul,
        phase: Math.random() * Math.PI * 2,
        speed: (1 + Math.random() * 2) * speedMul,
        size: (1.5 + Math.random() * 2) * sizeMul,
        opacity: (0.4 + Math.random() * 0.6) * intensity,
      });
    }
  };

  const animate = (time: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const t = time / 1000;
    const rect = canvas.getBoundingClientRect();

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    firefliesRef.current.forEach((f) => {
      f.x += f.vx + Math.sin(t * 0.5 * speedMul + f.phase) * 0.2 * speedMul;
      f.y += f.vy + Math.cos(t * 0.4 * speedMul + f.phase) * 0.2 * speedMul;

      if (f.x < -10) f.x = rect.width + 10;
      if (f.x > rect.width + 10) f.x = -10;
      if (f.y < -10) f.y = rect.height + 10;
      if (f.y > rect.height + 10) f.y = -10;

      const pulse = 0.4 + 0.6 * Math.pow(0.5 + 0.5 * Math.sin(t * f.speed + f.phase), 2);

      ctx.save();

      // Glow effect
      const gradient = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.size * 5);
      gradient.addColorStop(0, `rgba(255, 255, 100, ${f.opacity * pulse})`);
      gradient.addColorStop(0.4, `rgba(255, 255, 100, ${f.opacity * pulse * 0.3})`);
      gradient.addColorStop(1, 'rgba(255, 255, 100, 0)');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.size * 5, 0, Math.PI * 2);
      ctx.fill();

      // Core
      ctx.fillStyle = `rgba(255, 255, 200, ${f.opacity * pulse})`;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.size, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    });

    animationFrameRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    if (trigger === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (tileRef?.current) {
      const rect = tileRef.current.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    }

    firefliesRef.current = [];
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    createFireflies(canvas);
    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [trigger, tileRef, intensity, count, sizeMul]);

  if (trigger === 0) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-10"
      style={{ borderRadius: 'inherit' }}
    />
  );
};
