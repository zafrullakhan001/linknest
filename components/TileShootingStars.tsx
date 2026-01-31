import React, { useEffect, useRef } from 'react';
import type { CelebrationConfig } from '../types';

interface Star {
  x: number;
  y: number;
  vx: number;
  vy: number;
  length: number;
  opacity: number;
}

interface TileShootingStarsProps {
  trigger: number;
  tileRef?: React.RefObject<HTMLDivElement>;
  config?: CelebrationConfig;
}

const DEFAULT_COUNT = 3;

export const TileShootingStars: React.FC<TileShootingStarsProps> = ({ trigger, tileRef, config }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<Star[]>([]);
  const animationFrameRef = useRef<number>();

  const intensity = Math.max(1, Math.min(100, config?.intensity ?? 100)) / 100;
  const count = Math.max(1, Math.min(6, config?.particleCount ?? DEFAULT_COUNT));
  const sizeMul = Math.max(0.5, Math.min(2, (config?.particleSize ?? 100) / 100));

  const createStar = (canvas: HTMLCanvasElement): Star => {
    const rect = canvas.getBoundingClientRect();
    const angle = -0.6 - Math.random() * 0.3;
    const speed = (0.35 + Math.random() * 0.25) * intensity;
    return {
      x: Math.random() * rect.width * 1.2 - rect.width * 0.2,
      y: -10 - Math.random() * 20,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      length: (15 + Math.random() * 25) * sizeMul,
      opacity: (0.7 + Math.random() * 0.3) * intensity,
    };
  };

  const animate = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    starsRef.current = starsRef.current.filter((s) => {
      s.x += s.vx;
      s.y += s.vy;
      if (s.y > rect.height + 20 || s.x > rect.width + 30) return false;
      ctx.save();
      const grad = ctx.createLinearGradient(s.x - s.length, s.y, s.x, s.y);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.3, `rgba(255,255,255,${s.opacity * 0.3})`);
      grad.addColorStop(1, `rgba(255,255,255,${s.opacity})`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(s.x - s.length, s.y - s.vy * 2);
      ctx.lineTo(s.x, s.y);
      ctx.stroke();
      ctx.restore();
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

    if (tileRef?.current && canvas) {
      const rect = tileRef.current.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    }

    starsRef.current = [];
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);

    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        starsRef.current.push(createStar(canvas));
        animate();
      }, i * 800);
    }
    animate();

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
