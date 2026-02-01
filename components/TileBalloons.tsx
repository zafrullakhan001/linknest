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
const COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c', '#e91e63'];

function drawBalloon(ctx: CanvasRenderingContext2D, b: Balloon) {
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(Math.sin(b.wobble) * 0.1);

  ctx.globalAlpha = b.opacity;

  // Balloon body gradient
  const grad = ctx.createRadialGradient(-b.size * 0.3, -b.size * 0.4, 0, 0, 0, b.size * 1.5);
  grad.addColorStop(0, '#fff');
  grad.addColorStop(0.2, b.color);
  grad.addColorStop(1, 'rgba(0,0,0,0.3)');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(0, 0, b.size, b.size * 1.2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Highlight
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.beginPath();
  ctx.ellipse(-b.size * 0.4, -b.size * 0.5, b.size * 0.3, b.size * 0.2, Math.PI * 0.2, 0, Math.PI * 2);
  ctx.fill();

  // Knot
  ctx.fillStyle = b.color;
  ctx.beginPath();
  ctx.moveTo(-b.size * 0.1, b.size * 1.2);
  ctx.lineTo(b.size * 0.1, b.size * 1.2);
  ctx.lineTo(0, b.size * 1.1);
  ctx.fill();

  // String
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, b.size * 1.2);
  ctx.bezierCurveTo(
    Math.sin(b.wobble) * 10, b.size * 1.5,
    Math.cos(b.wobble) * 5, b.size * 2,
    0, b.size * 3
  );
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
  const speedMul = Math.max(0.2, Math.min(2, (config?.speed ?? 100) / 100));

  const createBalloons = (canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    for (let i = 0; i < count; i++) {
      balloonsRef.current.push({
        x: Math.random() * rect.width,
        y: rect.height + 50 + Math.random() * 100,
        vx: (Math.random() - 0.5) * 0.5 * intensity * speedMul,
        vy: (-0.8 - Math.random() * 0.8) * intensity * speedMul,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: (0.05 + Math.random() * 0.05) * speedMul,
        size: (10 + Math.random() * 5) * sizeMul,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        opacity: (0.8 + Math.random() * 0.2) * intensity,
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
      b.x += b.vx + Math.sin(b.wobble) * 0.5 * speedMul;
      b.y += b.vy;
      b.wobble += b.wobbleSpeed;
      if (b.y < -b.size * 4) return false;
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

    if (tileRef?.current) {
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
