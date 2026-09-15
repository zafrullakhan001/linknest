import React, { useEffect, useRef } from 'react';
import type { CelebrationConfig } from '../types';

interface Petal {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  size: number;
  color: string;
  secColor: string;
  opacity: number;
  sway: number;
  swaySpeed: number;
}

interface TilePetalsProps {
  trigger: number;
  tileRef?: React.RefObject<HTMLDivElement>;
  config?: CelebrationConfig;
}

const DEFAULT_COUNT = 18;
const COLORS = [
  { main: '#ff9ff3', sec: '#f368e0' },
  { main: '#ff7675', sec: '#ee5253' },
  { main: '#fab1a0', sec: '#ff7675' },
  { main: '#ffeaa7', sec: '#fdcb6e' },
  { main: '#fd79a8', sec: '#e84393' }
];

function drawPetal(ctx: CanvasRenderingContext2D, p: Petal) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rotation);

  ctx.globalAlpha = p.opacity;

  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, p.size * 1.5);
  grad.addColorStop(0, p.color);
  grad.addColorStop(1, p.secColor);
  ctx.fillStyle = grad;

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-p.size, -p.size, p.size, -p.size * 1.5, 0, 0);
  ctx.bezierCurveTo(-p.size * 0.5, p.size, p.size * 0.5, p.size, 0, 0);
  ctx.fill();

  ctx.restore();
}

export const TilePetals: React.FC<TilePetalsProps> = ({ trigger, tileRef, config }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const petalsRef = useRef<Petal[]>([]);
  const animationFrameRef = useRef<number>();

  const intensity = Math.max(1, Math.min(100, config?.intensity ?? 100)) / 100;
  const count = Math.max(8, Math.min(40, config?.particleCount ?? DEFAULT_COUNT));
  const sizeMul = Math.max(0.5, Math.min(2, (config?.particleSize ?? 100) / 100));
  const speedMul = Math.max(0.2, Math.min(2, (config?.speed ?? 100) / 100));

  const createPetals = (canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    for (let i = 0; i < count; i++) {
      const colorSet = COLORS[Math.floor(Math.random() * COLORS.length)];
      petalsRef.current.push({
        x: Math.random() * rect.width,
        y: -20 - Math.random() * 50,
        vx: (Math.random() - 0.5) * 0.5 * intensity * speedMul,
        vy: (0.5 + Math.random() * 1) * intensity * speedMul,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.05 * speedMul,
        size: (5 + Math.random() * 5) * sizeMul,
        color: colorSet.main,
        secColor: colorSet.sec,
        opacity: (0.7 + Math.random() * 0.3) * intensity,
        sway: Math.random() * Math.PI * 2,
        swaySpeed: (0.02 + Math.random() * 0.03) * speedMul
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
    const rect = canvas.getBoundingClientRect();

    petalsRef.current = petalsRef.current.filter((p) => {
      p.sway += p.swaySpeed;
      p.x += p.vx + Math.sin(p.sway) * 0.5 * speedMul;
      p.y += p.vy;
      p.rotation += p.rotationSpeed + Math.sin(t * speedMul) * 0.01;

      if (p.y > rect.height + 20) return false;
      drawPetal(ctx, p);
      return true;
    });

    if (petalsRef.current.length > 0) {
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

    petalsRef.current = [];
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    createPetals(canvas);
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

