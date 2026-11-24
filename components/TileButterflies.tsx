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
  secondaryColor: string;
  opacity: number;
  sway: number;
  swaySpeed: number;
  noiseX: number;
  noiseY: number;
}

interface TileButterfliesProps {
  trigger: number;
  tileRef?: React.RefObject<HTMLDivElement>;
  config?: CelebrationConfig;
}

const DEFAULT_COUNT = 12;
const COLORS = [
  { main: '#ff6b9d', sec: '#ff9ff3' },
  { main: '#feca57', sec: '#ff9f43' },
  { main: '#48dbfb', sec: '#54a0ff' },
  { main: '#1dd1a1', sec: '#10ac84' },
  { main: '#5f27cd', sec: '#341f97' },
  { main: '#ff9f1c', sec: '#ffbf69' }
];

function drawButterfly(ctx: CanvasRenderingContext2D, b: Butterfly, t: number) {
  ctx.save();
  ctx.translate(b.x, b.y);

  // Angle based on velocity plus a bit of lean
  const angle = Math.atan2(b.vy, b.vx);
  ctx.rotate(angle + Math.PI / 2);

  const wingFlap = Math.sin(t * b.wingSpeed + b.wingPhase);
  const wingWidth = b.size * 0.8 * Math.abs(wingFlap);

  ctx.globalAlpha = b.opacity;

  // Draw wings
  const drawWing = (side: number) => {
    ctx.save();
    ctx.scale(side, 1);

    // Gradient for wings
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, b.size * 1.5);
    grad.addColorStop(0, b.color);
    grad.addColorStop(1, b.secondaryColor);
    ctx.fillStyle = grad;

    // Top wing
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(wingWidth * 1.5, -b.size * 1.5, wingWidth * 2, b.size * 0.5, 0, 0);
    ctx.fill();

    // Bottom wing
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(wingWidth * 1.2, b.size * 1.2, wingWidth * 1.5, b.size * 0.2, 0, 0);
    ctx.fill();

    ctx.restore();
  };

  drawWing(1);
  drawWing(-1);

  // Body
  ctx.fillStyle = '#2d3436';
  ctx.beginPath();
  ctx.ellipse(0, 0, b.size * 0.15, b.size * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Antennae
  ctx.strokeStyle = '#2d3436';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(-b.size * 0.1, -b.size * 0.4);
  ctx.quadraticCurveTo(-b.size * 0.3, -b.size * 0.8, -b.size * 0.2, -b.size * 1);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(b.size * 0.1, -b.size * 0.4);
  ctx.quadraticCurveTo(b.size * 0.3, -b.size * 0.8, b.size * 0.2, -b.size * 1);
  ctx.stroke();

  ctx.restore();
}

export const TileButterflies: React.FC<TileButterfliesProps> = ({ trigger, tileRef, config }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const butterfliesRef = useRef<Butterfly[]>([]);
  const animationFrameRef = useRef<number>();
  const lastTimeRef = useRef(0);

  const intensity = Math.max(1, Math.min(100, config?.intensity ?? 100)) / 100;
  const count = Math.max(4, Math.min(30, config?.particleCount ?? DEFAULT_COUNT));
  const sizeMul = Math.max(0.5, Math.min(2, (config?.particleSize ?? 100) / 100));
  const speedMul = Math.max(0.2, Math.min(2, (config?.speed ?? 100) / 100));

  const createButterflies = (canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    for (let i = 0; i < count; i++) {
      const colorSet = COLORS[Math.floor(Math.random() * COLORS.length)];
      butterfliesRef.current.push({
        x: Math.random() * rect.width,
        y: rect.height + 20 + Math.random() * 50, // Start below
        vx: (Math.random() - 0.5) * 2 * speedMul,
        vy: (-0.5 - Math.random() * 1) * speedMul,
        wingPhase: Math.random() * Math.PI * 2,
        wingSpeed: (10 + Math.random() * 5) * speedMul,
        size: (5 + Math.random() * 5) * sizeMul,
        color: colorSet.main,
        secondaryColor: colorSet.sec,
        opacity: (0.8 + Math.random() * 0.2) * intensity,
        sway: Math.random() * Math.PI * 2,
        swaySpeed: (0.02 + Math.random() * 0.05) * speedMul,
        noiseX: Math.random() * 1000,
        noiseY: Math.random() * 1000,
      } as any);
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

    butterfliesRef.current = butterfliesRef.current.filter((b: any) => {
      // Organic erratic movement
      b.noiseX += 0.01 * speedMul;
      b.noiseY += 0.01 * speedMul;

      b.vx += Math.sin(b.noiseX) * 0.15 * speedMul;
      b.vy += Math.cos(b.noiseY) * 0.1 * speedMul;

      // Keep within reasonable speed
      const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (speed > 3 * speedMul) {
        b.vx *= 0.95;
        b.vy *= 0.95;
      }

      b.x += b.vx;
      b.y += b.vy;

      // Screen wrap or bounce with fade
      if (b.x < -40 || b.x > rect.width + 40 || b.y < -40) return false;

      drawButterfly(ctx, b, t);
      return true;
    });

    if (butterfliesRef.current.length > 0) {
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

    butterfliesRef.current = [];
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    lastTimeRef.current = 0;
    createButterflies(canvas);
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

