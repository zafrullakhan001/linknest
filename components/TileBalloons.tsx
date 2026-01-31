import React, { useEffect, useRef } from 'react';
import type { CelebrationConfig } from '../types';

interface Balloon {
  x: number;
  y: number;
  vx: number;
  vy: number;
  wobble: number;
  wobbleSpeed: number;
  size: number;
  color: string;
  opacity: number;
}

interface TileBalloonsProps {
  trigger: number;
  tileRef?: React.RefObject<HTMLDivElement>;
  config?: CelebrationConfig;
}

const DEFAULT_COUNT = 10;
const COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c', '#e91e63', '#00bcd4', '#ff5722'];

function drawBalloon(ctx: CanvasRenderingContext2D, b: Balloon) {
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.globalAlpha = b.opacity;
  ctx.fillStyle = b.color;
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(0, 0, b.size, b.size * 1.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(100,100,100,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, b.size * 1.2);
  ctx.quadraticCurveTo(b.size * 0.3, b.size * 1.8, b.size * 0.5, b.size * 2.2);
  ctx.stroke();
  ctx.restore();
}

export const TileBalloons: React.FC<TileBalloonsProps> = ({ trigger, tileRef, config }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const balloonsRef = useRef<Balloon[]>([]);
  const animationFrameRef = useRef<number>();

  const intensity = Math.max(1, Math.min(100, config?.intensity ?? 100)) / 100;
  const count = Math.max(4, Math.min(20, config?.particleCount ?? DEFAULT_COUNT));
  const sizeMul = Math.max(0.5, Math.min(2, (config?.particleSize ?? 100) / 100));

  const createBalloons = (canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    for (let i = 0; i < count; i++) {
      balloonsRef.current.push({
        x: Math.random() * rect.width,
        y: rect.height + 20 + Math.random() * 40,
        vx: (Math.random() - 0.5) * 0.1 * intensity,
        vy: (-0.12 - Math.random() * 0.1) * intensity,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.03 + Math.random() * 0.02,
        size: (6 + Math.random() * 8) * sizeMul,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        opacity: (0.7 + Math.random() * 0.3) * intensity,
      });
    }
  };

  const animate = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    balloonsRef.current = balloonsRef.current.filter((b) => {
      b.x += b.vx + Math.sin(b.wobble) * 0.25;
      b.y += b.vy;
      b.wobble += b.wobbleSpeed;
      if (b.y < -40) return false;
      drawBalloon(ctx, b);
      return true;
    });

    if (balloonsRef.current.length > 0) {
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

    balloonsRef.current = [];
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    createBalloons(canvas);
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
