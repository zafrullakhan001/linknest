import React, { useEffect, useRef } from 'react';
import type { CelebrationConfig } from '../types';

interface ShootingStar {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  trail: Array<{ x: number; y: number }>;
  color: string;
  opacity: number;
}

interface TileShootingStarsProps {
  trigger: number;
  tileRef?: React.RefObject<HTMLDivElement>;
  config?: CelebrationConfig;
}

const COLORS = ['#fff', '#feca57', '#48dbfb', '#ff9ff3', '#1dd1a1'];

function drawShootingStar(ctx: CanvasRenderingContext2D, s: ShootingStar) {
  ctx.save();

  // Draw trail
  const trailLen = s.trail.length;
  for (let i = 0; i < trailLen; i++) {
    const t = s.trail[i];
    const alpha = (i / trailLen) * s.opacity;
    const size = (i / trailLen) * s.size;

    ctx.globalAlpha = alpha;
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(t.x, t.y, size, 0, Math.PI * 2);
    ctx.fill();
  }

  // Head
  ctx.globalAlpha = s.opacity;
  ctx.shadowBlur = 15;
  ctx.shadowColor = s.color;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export const TileShootingStars: React.FC<TileShootingStarsProps> = ({ trigger, tileRef, config }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<ShootingStar[]>([]);
  const animationFrameRef = useRef<number>();

  const intensity = Math.max(1, Math.min(100, config?.intensity ?? 100)) / 100;
  const count = Math.max(2, Math.min(10, config?.particleCount ?? 4));
  const sizeMul = Math.max(0.5, Math.min(2, (config?.particleSize ?? 100) / 100));
  const speedMul = Math.max(0.2, Math.min(2, (config?.speed ?? 100) / 100));

  const createStar = (canvas: HTMLCanvasElement): ShootingStar => {
    const rect = canvas.getBoundingClientRect();
    const side = Math.random() > 0.5;
    const x = side ? -20 : rect.width + 20;
    const y = Math.random() * rect.height * 0.5;
    const angle = side ? Math.random() * Math.PI * 0.25 : Math.PI * 0.75 + Math.random() * Math.PI * 0.25;
    const speed = (8 + Math.random() * 8) * intensity * speedMul;

    return {
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: (1 + Math.random() * 2) * sizeMul,
      trail: [],
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      opacity: 1
    };
  };

  const animate = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const rect = canvas.getBoundingClientRect();

    starsRef.current = starsRef.current.filter((s) => {
      s.trail.push({ x: s.x, y: s.y });
      if (s.trail.length > 20) s.trail.shift();

      s.x += s.vx;
      s.y += s.vy;

      if (s.x < -100 || s.x > rect.width + 100 || s.y > rect.height + 100) return false;
      drawShootingStar(ctx, s);
      return true;
    });

    if (starsRef.current.length > 0) {
      animationFrameRef.current = requestAnimationFrame(animate);
    }
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

    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        if (canvasRef.current) {
          starsRef.current.push(createStar(canvasRef.current));
          if (starsRef.current.length === 1) animate();
        }
      }, (i * 800) / (intensity * speedMul));
    }

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
