import React, { useEffect, useRef } from 'react';
import type { CelebrationConfig } from '../types';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

interface TileRocketLaunchProps {
  trigger: number;
  tileRef?: React.RefObject<HTMLDivElement>;
  config?: CelebrationConfig;
}

const FIRE_COLORS = ['#ff4d4d', '#ff9f43', '#feca57', '#ffda79', '#ffffff'];

function drawRocket(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.save();
  ctx.translate(x, y);

  // Fins
  ctx.fillStyle = '#c0392b';
  ctx.beginPath();
  ctx.moveTo(-s * 0.5, 0);
  ctx.lineTo(-s * 0.8, s * 0.5);
  ctx.lineTo(s * 0.8, s * 0.5);
  ctx.lineTo(s * 0.5, 0);
  ctx.fill();

  // Body
  ctx.fillStyle = '#ecf0f1';
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.5, s * 0.5, s, 0, 0, Math.PI * 2);
  ctx.fill();

  // Window
  ctx.fillStyle = '#3498db';
  ctx.beginPath();
  ctx.arc(0, -s * 0.8, s * 0.2, 0, Math.PI * 2);
  ctx.fill();

  // Tip
  ctx.fillStyle = '#c0392b';
  ctx.beginPath();
  ctx.moveTo(-s * 0.4, -s * 1.2);
  ctx.quadraticCurveTo(0, -s * 2, s * 0.4, -s * 1.2);
  ctx.fill();

  ctx.restore();
}

export const TileRocketLaunch: React.FC<TileRocketLaunchProps> = ({ trigger, tileRef, config }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rocketPosRef = useRef({ x: 0, y: 0, vy: 0 });
  const animationFrameRef = useRef<number>();

  const intensity = Math.max(1, Math.min(100, config?.intensity ?? 100)) / 100;
  const sizeMul = Math.max(0.5, Math.min(2, (config?.particleSize ?? 100) / 100));
  const speedMul = Math.max(0.2, Math.min(2, (config?.speed ?? 100) / 100));

  const animate = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Update rocket
    rocketPosRef.current.vy -= 0.15 * intensity * speedMul;
    rocketPosRef.current.y += rocketPosRef.current.vy * speedMul;

    // Add fire particles
    if (rocketPosRef.current.y > -100) {
      for (let i = 0; i < 5; i++) {
        particlesRef.current.push({
          x: rocketPosRef.current.x + (Math.random() - 0.5) * 10,
          y: rocketPosRef.current.y,
          vx: (Math.random() - 0.5) * 2 * speedMul,
          vy: (2 + Math.random() * 3) * speedMul,
          life: 0,
          maxLife: (20 + Math.random() * 20) / speedMul,
          size: (4 + Math.random() * 8) * sizeMul,
          color: FIRE_COLORS[Math.floor(Math.random() * FIRE_COLORS.length)]
        });
      }
    }

    // Update particles
    particlesRef.current = particlesRef.current.filter(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life++;
      p.size *= Math.pow(0.95, speedMul);

      const alpha = 1 - p.life / p.maxLife;
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      return p.life < p.maxLife;
    });

    drawRocket(ctx, rocketPosRef.current.x, rocketPosRef.current.y, 10 * sizeMul);

    if (rocketPosRef.current.y > -200 || particlesRef.current.length > 0) {
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
      rocketPosRef.current = {
        x: rect.width / 2,
        y: rect.height + 50,
        vy: -2 * speedMul
      };
    }

    particlesRef.current = [];
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    animate();

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [trigger, tileRef, intensity, sizeMul, speedMul]);

  if (trigger === 0) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-10"
      style={{ borderRadius: 'inherit' }}
    />
  );
};
