import React, { useEffect, useRef } from 'react';
import type { CelebrationConfig } from '../types';

interface Star {
  x: number;
  y: number;
  size: number;
  phase: number;
  speed: number;
  opacity: number;
  color: string;
}

interface TileStarsProps {
  trigger: number;
  tileRef?: React.RefObject<HTMLDivElement>;
  config?: CelebrationConfig;
}

const COLORS = ['#fff', '#fff2ac', '#fff9d8', '#e0f7fa', '#f3e5f5'];

export const TileStars: React.FC<TileStarsProps> = ({ trigger, tileRef, config }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<Star[]>([]);
  const animationFrameRef = useRef<number>();

  const intensity = Math.max(1, Math.min(100, config?.intensity ?? 100)) / 100;
  const count = Math.max(10, Math.min(60, config?.particleCount ?? 30));
  const sizeMul = Math.max(0.5, Math.min(2, (config?.particleSize ?? 100) / 100));
  const speedMul = Math.max(0.2, Math.min(2, (config?.speed ?? 100) / 100));

  const createStars = (canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    for (let i = 0; i < count; i++) {
      starsRef.current.push({
        x: Math.random() * rect.width,
        y: Math.random() * rect.height,
        size: (1 + Math.random() * 3) * sizeMul,
        phase: Math.random() * Math.PI * 2,
        speed: (1 + Math.random() * 3) * speedMul,
        opacity: (0.5 + Math.random() * 0.5) * intensity,
        color: COLORS[Math.floor(Math.random() * COLORS.length)]
      });
    }
  };

  const animate = (time: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const t = time / 1000;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    starsRef.current.forEach((s) => {
      const pulse = 0.2 + 0.8 * Math.pow(0.5 + 0.5 * Math.sin(t * s.speed + s.phase), 2);

      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.globalAlpha = s.opacity * pulse;

      // Glow
      ctx.shadowBlur = 8 * pulse;
      ctx.shadowColor = s.color;

      ctx.fillStyle = s.color;

      // Draw 4-pointed star
      const r = s.size * (0.8 + 0.4 * pulse);
      ctx.beginPath();
      ctx.moveTo(0, -r * 2);
      ctx.quadraticCurveTo(0, 0, r * 2, 0);
      ctx.quadraticCurveTo(0, 0, 0, r * 2);
      ctx.quadraticCurveTo(0, 0, -r * 2, 0);
      ctx.quadraticCurveTo(0, 0, 0, -r * 2);
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

    starsRef.current = [];
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    createStars(canvas);
    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [trigger, tileRef, intensity, count, sizeMul, speedMul]);

  if (trigger === 0) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-10"
      style={{ borderRadius: 'inherit' }}
    />
  );
};
