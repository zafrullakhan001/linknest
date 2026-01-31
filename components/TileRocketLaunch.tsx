import React, { useEffect, useRef } from 'react';
import type { CelebrationConfig } from '../types';

interface Rocket {
  x: number;
  y: number;
  vx: number;
  vy: number;
  trail: Array<{ x: number; y: number; life: number }>;
  color: string;
  size: number;
  burst: boolean;
}

interface TileRocketLaunchProps {
  trigger: number;
  tileRef?: React.RefObject<HTMLDivElement>;
  config?: CelebrationConfig;
}

const COLORS = ['#ff6b35', '#f7c59f', '#ff4757', '#ffa502', '#e74c3c', '#ff6348', '#ff9f43'];

function drawRocket(ctx: CanvasRenderingContext2D, r: Rocket) {
  ctx.save();
  ctx.translate(r.x, r.y);
  const angle = Math.atan2(r.vy, r.vx);
  ctx.rotate(angle);

  ctx.fillStyle = r.color;
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(r.size * 2, 0);
  ctx.lineTo(-r.size * 1.2, -r.size * 0.8);
  ctx.lineTo(-r.size * 0.8, 0);
  ctx.lineTo(-r.size * 1.2, r.size * 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(-r.size * 0.8, -r.size * 0.4);
  ctx.lineTo(-r.size * 1.5, 0);
  ctx.lineTo(-r.size * 0.8, r.size * 0.4);
  ctx.closePath();
  ctx.fill();

  for (let i = 0; i < r.trail.length; i++) {
    const t = r.trail[i];
    ctx.globalAlpha = t.life;
    ctx.fillStyle = `rgba(255, ${100 + i * 5}, 50, 0.8)`;
    ctx.beginPath();
    ctx.arc(-r.size * 2 - i * 2, (Math.random() - 0.5) * 4, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

export const TileRocketLaunch: React.FC<TileRocketLaunchProps> = ({ trigger, tileRef, config }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rocketsRef = useRef<Rocket[]>([]);
  const animationFrameRef = useRef<number>();
  const burstParticlesRef = useRef<Array<{ x: number; y: number; vx: number; vy: number; life: number; color: string }>>([]);

  const intensity = Math.max(1, Math.min(100, config?.intensity ?? 100)) / 100;
  const count = Math.max(2, Math.min(8, config?.particleCount ?? 4));
  const sizeMul = Math.max(0.5, Math.min(2, (config?.particleSize ?? 100) / 100));

  const createRocket = (canvas: HTMLCanvasElement): Rocket => {
    const rect = canvas.getBoundingClientRect();
    const x = rect.width * (0.2 + Math.random() * 0.6);
    const vy = (-0.4 - Math.random() * 0.3) * intensity;
    return {
      x,
      y: rect.height + 20,
      vx: (Math.random() - 0.5) * 0.1,
      vy,
      trail: [],
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: (6 + Math.random() * 4) * sizeMul,
      burst: false,
    };
  };

  const createBurst = (x: number, y: number, color: string) => {
    const particleCount = 25 + Math.floor(Math.random() * 15);
    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount + Math.random();
      const speed = 0.15 + Math.random() * 0.2;
      burstParticlesRef.current.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        color,
      });
    }
  };

  const animate = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const rect = canvas.getBoundingClientRect();

    rocketsRef.current = rocketsRef.current.filter((r) => {
      if (r.burst) return false;
      r.x += r.vx;
      r.y += r.vy;
      r.trail.push({ x: r.x, y: r.y, life: 1 });
      if (r.trail.length > 15) r.trail.shift();
      for (const t of r.trail) t.life -= 0.05;

      if (r.y < rect.height * 0.3) {
        createBurst(r.x, r.y, r.color);
        return false;
      }
      drawRocket(ctx, r);
      return true;
    });

    burstParticlesRef.current = burstParticlesRef.current.filter((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.008;
      p.life -= 0.02;
      if (p.life <= 0) return false;
      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return true;
    });

    if (rocketsRef.current.length > 0 || burstParticlesRef.current.length > 0) {
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

    rocketsRef.current = [];
    burstParticlesRef.current = [];
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);

    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        rocketsRef.current.push(createRocket(canvas));
      }, i * 400);
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
