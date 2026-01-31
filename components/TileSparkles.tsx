import React, { useEffect, useRef } from 'react';
import type { CelebrationConfig } from '../types';

interface Sparkle {
  x: number;
  y: number;
  size: number;
  phase: number;
  speed: number;
  opacity: number;
}

interface TileSparklesProps {
  trigger: number;
  tileRef?: React.RefObject<HTMLDivElement>;
  config?: CelebrationConfig;
}

const DEFAULT_COUNT = 25;

export const TileSparkles: React.FC<TileSparklesProps> = ({ trigger, tileRef, config }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sparklesRef = useRef<Sparkle[]>([]);
  const animationFrameRef = useRef<number>();
  const startTimeRef = useRef(0);

  const intensity = Math.max(1, Math.min(100, config?.intensity ?? 100)) / 100;
  const count = Math.max(10, Math.min(50, config?.particleCount ?? DEFAULT_COUNT));
  const sizeMul = Math.max(0.5, Math.min(2, (config?.particleSize ?? 100) / 100));

  const createSparkles = (canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    for (let i = 0; i < count; i++) {
      sparklesRef.current.push({
        x: Math.random() * rect.width,
        y: Math.random() * rect.height,
        size: (2 + Math.random() * 4) * sizeMul,
        phase: Math.random() * Math.PI * 2,
        speed: 2 + Math.random() * 3,
        opacity: (0.5 + Math.random() * 0.5) * intensity,
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

    sparklesRef.current.forEach((s) => {
      const twinkle = 0.4 + 0.6 * Math.sin(t * s.speed + s.phase);
      ctx.save();
      ctx.globalAlpha = s.opacity * twinkle;
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = 'rgba(255, 255, 200, 0.9)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y - s.size);
      ctx.lineTo(s.x + s.size * 0.3, s.y);
      ctx.lineTo(s.x, s.y + s.size);
      ctx.lineTo(s.x - s.size * 0.3, s.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
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

    sparklesRef.current = [];
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    startTimeRef.current = Date.now();
    createSparkles(canvas);
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
