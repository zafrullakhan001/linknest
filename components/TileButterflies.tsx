import React, { useEffect, useRef } from 'react';
import type { CelebrationConfig } from '../types';

interface Butterfly {
  x: number;
  y: number;
  vx: number;
  vy: number;
  wingPhase: number;
  wingSpeed: number;
  size: number;
  color: string;
  opacity: number;
  sway: number;
  swaySpeed: number;
}

interface TileButterfliesProps {
  trigger: number;
  tileRef?: React.RefObject<HTMLDivElement>;
  config?: CelebrationConfig;
}

const DEFAULT_COUNT = 12;
const COLORS = ['#ff6b9d', '#c44569', '#ff9f43', '#feca57', '#48dbfb', '#ff9ff3', '#54a0ff', '#5f27cd', '#00d2d3', '#ff9f1c'];

function drawButterfly(ctx: CanvasRenderingContext2D, b: Butterfly, t: number) {
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(Math.atan2(b.vy, b.vx));
  const wingFlap = Math.sin(t * b.wingSpeed + b.wingPhase) * 0.4;
  ctx.globalAlpha = b.opacity * (0.7 + 0.3 * Math.sin(t * 2 + b.wingPhase));
  const s = b.size;
  ctx.fillStyle = b.color;
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.ellipse(0, 0, s * (1 + wingFlap), s * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(s * 0.6, -s * 0.3, s * 0.5 * (1 - wingFlap * 0.5), s * 0.25, wingFlap * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(s * 0.6, s * 0.3, s * 0.5 * (1 - wingFlap * 0.5), s * 0.25, -wingFlap * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export const TileButterflies: React.FC<TileButterfliesProps> = ({ trigger, tileRef, config }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const butterfliesRef = useRef<Butterfly[]>([]);
  const animationFrameRef = useRef<number>();
  const startTimeRef = useRef(0);

  const intensity = Math.max(1, Math.min(100, config?.intensity ?? 100)) / 100;
  const count = Math.max(4, Math.min(30, config?.particleCount ?? DEFAULT_COUNT));
  const sizeMul = Math.max(0.5, Math.min(2, (config?.particleSize ?? 100) / 100));

  const createButterflies = (canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    for (let i = 0; i < count; i++) {
      const baseSize = 4 + Math.random() * 6;
      butterfliesRef.current.push({
        x: Math.random() * rect.width,
        y: Math.random() * rect.height,
        vx: (Math.random() - 0.5) * 0.15 * intensity,
        vy: (-0.08 - Math.random() * 0.1) * intensity,
        wingPhase: Math.random() * Math.PI * 2,
        wingSpeed: 3 + Math.random() * 4,
        size: baseSize * sizeMul,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        opacity: (0.5 + Math.random() * 0.4) * intensity,
        sway: Math.random() * Math.PI * 2,
        swaySpeed: 0.02 + Math.random() * 0.03,
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
    const rect = canvas.getBoundingClientRect();

    butterfliesRef.current = butterfliesRef.current.filter((b) => {
      b.x += b.vx + Math.sin(t * 2 + b.sway) * 0.3;
      b.y += b.vy;
      b.sway += b.swaySpeed;
      if (b.y < -20 || b.x < -20 || b.x > rect.width + 20) return false;
      drawButterfly(ctx, b, t);
      return true;
    });

    if (butterfliesRef.current.length > 0) {
      animationFrameRef.current = requestAnimationFrame(() => animate(startTime));
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

    butterfliesRef.current = [];
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    startTimeRef.current = Date.now();
    createButterflies(canvas);
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
