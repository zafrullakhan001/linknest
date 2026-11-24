import React, { useEffect, useRef } from 'react';
import type { CelebrationConfig } from '../types';

interface Bird {
  x: number;
  y: number;
  vx: number;
  vy: number;
  wingPhase: number;
  wingSpeed: number;
  size: number;
  opacity: number;
  color: string;
}

interface TileBirdsFlyingProps {
  trigger: number;
  tileRef?: React.RefObject<HTMLDivElement>;
  config?: CelebrationConfig;
}

const DEFAULT_COUNT = 6;
const COLORS = ['#2d3436', '#636e72', '#b2bec3', '#dfe6e9', '#0984e3', '#74b9ff'];

function drawBird(ctx: CanvasRenderingContext2D, b: Bird, t: number) {
  ctx.save();
  ctx.translate(b.x, b.y);

  const angle = Math.atan2(b.vy, b.vx);
  ctx.rotate(angle);

  ctx.globalAlpha = b.opacity;
  ctx.fillStyle = b.color;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 0.5;

  const flap = Math.sin(t * b.wingSpeed + b.wingPhase);
  const s = b.size;

  // Body
  ctx.beginPath();
  ctx.ellipse(0, 0, s, s * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.beginPath();
  ctx.arc(s * 0.8, -s * 0.1, s * 0.3, 0, Math.PI * 2);
  ctx.fill();

  // Beak
  ctx.fillStyle = '#fab1a0';
  ctx.beginPath();
  ctx.moveTo(s * 1.1, -s * 0.1);
  ctx.lineTo(s * 1.4, 0);
  ctx.lineTo(s * 1.1, s * 0.1);
  ctx.fill();

  // Wings
  ctx.fillStyle = b.color;
  const wingY = flap * s;

  // Far wing
  ctx.beginPath();
  ctx.moveTo(-s * 0.2, 0);
  ctx.bezierCurveTo(-s * 0.5, -s * 2, s * 0.5, -s * 2, s * 0.2, 0);
  ctx.save();
  ctx.scale(1, flap > 0 ? 0.3 : 1);
  ctx.fill();
  ctx.restore();

  // Near wing
  ctx.beginPath();
  ctx.moveTo(-s * 0.2, 0);
  ctx.bezierCurveTo(-s * 0.5, s * 2, s * 0.5, s * 2, s * 0.2, 0);
  ctx.save();
  ctx.scale(1, flap < 0 ? 0.3 : 1);
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

export const TileBirdsFlying: React.FC<TileBirdsFlyingProps> = ({ trigger, tileRef, config }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const birdsRef = useRef<Bird[]>([]);
  const animationFrameRef = useRef<number>();
  const lastTimeRef = useRef(0);

  const intensity = Math.max(1, Math.min(100, config?.intensity ?? 100)) / 100;
  const count = Math.max(3, Math.min(15, config?.particleCount ?? DEFAULT_COUNT));
  const sizeMul = Math.max(0.5, Math.min(2, (config?.particleSize ?? 100) / 100));
  const speedMul = Math.max(0.2, Math.min(2, (config?.speed ?? 100) / 100));

  const createBirds = (canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    for (let i = 0; i < count; i++) {
      const speed = (1 + Math.random() * 1.5) * intensity * speedMul;
      birdsRef.current.push({
        x: -40 - Math.random() * 100,
        y: rect.height * (0.1 + Math.random() * 0.8),
        vx: speed,
        vy: (Math.random() - 0.5) * 0.2 * speedMul,
        wingPhase: Math.random() * Math.PI * 2,
        wingSpeed: (10 + Math.random() * 5) * speedMul,
        size: (5 + Math.random() * 5) * sizeMul,
        opacity: (0.8 + Math.random() * 0.2) * intensity,
        color: COLORS[Math.floor(Math.random() * COLORS.length)]
      });
    }
  };

  const animate = (time: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (!lastTimeRef.current) lastTimeRef.current = time;
    const t = time / 1000;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const rect = canvas.getBoundingClientRect();

    birdsRef.current = birdsRef.current.filter((b) => {
      // Natural drift
      b.vy += Math.sin(t * speedMul + b.wingPhase) * 0.01 * speedMul;
      b.x += b.vx;
      b.y += b.vy;

      if (b.x > rect.width + 50) return false;
      drawBird(ctx, b, t);
      return true;
    });

    if (birdsRef.current.length > 0) {
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

    birdsRef.current = [];
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    lastTimeRef.current = 0;
    createBirds(canvas);
    animationFrameRef.current = requestAnimationFrame(animate);

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

