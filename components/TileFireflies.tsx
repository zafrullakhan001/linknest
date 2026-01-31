import React, { useEffect, useRef } from 'react';
import type { CelebrationConfig } from '../types';

interface Firefly {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  size: number;
  opacity: number;
}

interface TileFirefliesProps {
  trigger: number;
  tileRef?: React.RefObject<HTMLDivElement>;
  config?: CelebrationConfig;
}

const DEFAULT_COUNT = 12;

export const TileFireflies: React.FC<TileFirefliesProps> = ({ trigger, tileRef, config }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const firefliesRef = useRef<Firefly[]>([]);
  const animationFrameRef = useRef<number>();
  const startTimeRef = useRef(0);

  const intensity = Math.max(1, Math.min(100, config?.intensity ?? 100)) / 100;
  const count = Math.max(6, Math.min(25, config?.particleCount ?? DEFAULT_COUNT));
  const sizeMul = Math.max(0.5, Math.min(2, (config?.particleSize ?? 100) / 100));

  const createFireflies = (canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    for (let i = 0; i < count; i++) {
      firefliesRef.current.push({
        x: Math.random() * rect.width,
        y: Math.random() * rect.height,
        vx: (Math.random() - 0.5) * 0.08 * intensity,
        vy: (Math.random() - 0.5) * 0.08 * intensity,
        phase: Math.random() * Math.PI * 2,
        size: (2 + Math.random() * 3) * sizeMul,
        opacity: (0.4 + Math.random() * 0.5) * intensity,
      });
    }
  };

  const animate = (startTime: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const t = (Date.now() - startTime) / 1000;
    const rect = canvas.getBoundingClientRect();

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    firefliesRef.current.forEach((f) => {
      f.x += f.vx + Math.sin(t + f.phase) * 0.15;
      f.y += f.vy + Math.cos(t * 0.7 + f.phase * 1.3) * 0.15;
      if (f.x < 0) f.x = rect.width;
      if (f.x > rect.width) f.x = 0;
      if (f.y < 0) f.y = rect.height;
      if (f.y > rect.height) f.y = 0;
      const glow = 0.3 + 0.7 * Math.sin(t * 4 + f.phase);
      ctx.save();
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.size * 4);
      g.addColorStop(0, `rgba(255, 255, 150, ${f.opacity * glow})`);
      g.addColorStop(0.5, `rgba(255, 255, 100, ${f.opacity * glow * 0.3})`);
      g.addColorStop(1, 'rgba(255, 255, 100, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.size * 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255, 255, 200, ${f.opacity * glow})`;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    animationFrameRef.current = requestAnimationFrame(() => animate(startTime));
  };

  useEffect(() => {
    if (trigger === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (tileRef?.current && canvas) {
      const rect = tileRef.current.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    }

    firefliesRef.current = [];
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    startTimeRef.current = Date.now();
    createFireflies(canvas);
    animate(startTimeRef.current);

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
