import React, { useEffect, useRef } from 'react';
import type { CelebrationConfig } from '../types';

interface Bird {
  x: number;
  y: number;
  vx: number;
  vy: number;
  wingPhase: number;
  size: number;
  opacity: number;
}

interface TileBirdsFlyingProps {
  trigger: number;
  tileRef?: React.RefObject<HTMLDivElement>;
  config?: CelebrationConfig;
}

const DEFAULT_COUNT = 6;

function drawBird(ctx: CanvasRenderingContext2D, b: Bird, t: number) {
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(Math.atan2(b.vy, b.vx));
  ctx.globalAlpha = b.opacity;
  ctx.strokeStyle = 'rgba(60, 60, 80, 0.9)';
  ctx.fillStyle = 'rgba(80, 80, 100, 0.95)';
  ctx.lineWidth = 1.5;
  const flap = Math.sin(t * 8 + b.wingPhase) * 0.15;
  const s = b.size;
  ctx.beginPath();
  ctx.moveTo(-s * 1.2, 0);
  ctx.quadraticCurveTo(-s * 0.5, -s * (0.5 + flap), s * 0.3, 0);
  ctx.quadraticCurveTo(-s * 0.5, s * (0.5 + flap), -s * 1.2, 0);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export const TileBirdsFlying: React.FC<TileBirdsFlyingProps> = ({ trigger, tileRef, config }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const birdsRef = useRef<Bird[]>([]);
  const animationFrameRef = useRef<number>();
  const startTimeRef = useRef(0);

  const intensity = Math.max(1, Math.min(100, config?.intensity ?? 100)) / 100;
  const count = Math.max(3, Math.min(15, config?.particleCount ?? DEFAULT_COUNT));
  const sizeMul = Math.max(0.5, Math.min(2, (config?.particleSize ?? 100) / 100));

  const createBirds = (canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    for (let i = 0; i < count; i++) {
      birdsRef.current.push({
        x: -15 - Math.random() * 40,
        y: rect.height * (0.1 + Math.random() * 0.8),
        vx: (0.25 + Math.random() * 0.2) * intensity,
        vy: (Math.random() - 0.5) * 0.05 * intensity,
        wingPhase: Math.random() * Math.PI * 2,
        size: (4 + Math.random() * 4) * sizeMul,
        opacity: (0.6 + Math.random() * 0.35) * intensity,
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

    birdsRef.current = birdsRef.current.filter((b) => {
      b.x += b.vx;
      b.y += b.vy;
      if (b.x > rect.width + 30) return false;
      drawBird(ctx, b, t);
      return true;
    });

    if (birdsRef.current.length > 0) {
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

    birdsRef.current = [];
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    startTimeRef.current = Date.now();
    createBirds(canvas);
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
