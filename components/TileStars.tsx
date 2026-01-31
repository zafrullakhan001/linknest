import React, { useEffect, useRef } from 'react';
import type { CelebrationConfig } from '../types';

interface Star {
  x: number;
  y: number;
  size: number;
  phase: number;
  speed: number;
  opacity: number;
}

interface TileStarsProps {
  trigger: number;
  tileRef?: React.RefObject<HTMLDivElement>;
  config?: CelebrationConfig;
}

const DEFAULT_COUNT = 20;

export const TileStars: React.FC<TileStarsProps> = ({ trigger, tileRef, config }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<Star[]>([]);
  const animationFrameRef = useRef<number>();
  const startTimeRef = useRef(0);

  const intensity = Math.max(1, Math.min(100, config?.intensity ?? 100)) / 100;
  const count = Math.max(10, Math.min(40, config?.particleCount ?? DEFAULT_COUNT));
  const sizeMul = Math.max(0.5, Math.min(2, (config?.particleSize ?? 100) / 100));

  const createStars = (canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    for (let i = 0; i < count; i++) {
      starsRef.current.push({
        x: Math.random() * rect.width,
        y: Math.random() * rect.height,
        size: (1.5 + Math.random() * 3) * sizeMul,
        phase: Math.random() * Math.PI * 2,
        speed: 1.5 + Math.random() * 2.5,
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

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    starsRef.current.forEach((s) => {
      const twinkle = 0.3 + 0.7 * Math.abs(Math.sin(t * s.speed + s.phase));
      ctx.save();
      ctx.globalAlpha = s.opacity * twinkle;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(s.x, s.y - s.size);
      ctx.lineTo(s.x + s.size * 0.4, s.y);
      ctx.lineTo(s.x, s.y + s.size);
      ctx.lineTo(s.x - s.size * 0.4, s.y);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(s.x - s.size, s.y);
      ctx.lineTo(s.x, s.y + s.size * 0.4);
      ctx.lineTo(s.x + s.size, s.y);
      ctx.lineTo(s.x, s.y - s.size * 0.4);
      ctx.closePath();
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

    starsRef.current = [];
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    startTimeRef.current = Date.now();
    createStars(canvas);
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
