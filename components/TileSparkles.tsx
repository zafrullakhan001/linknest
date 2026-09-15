import React, { useEffect, useRef } from 'react';
import type { CelebrationConfig } from '../types';

interface Sparkle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  rotationSpeed: number;
  opacity: number;
  life: number;
  maxLife: number;
  color: string;
}

interface TileSparklesProps {
  trigger: number;
  tileRef?: React.RefObject<HTMLDivElement>;
  config?: CelebrationConfig;
}

const COLORS = ['#fff', '#feca57', '#ffd32a', '#fffa65', '#fff200'];

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, points: number, inset: number) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const angle = (i * Math.PI) / points;
    const radius = i % 2 === 0 ? r : r * inset;
    ctx.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
  }
  ctx.closePath();
  ctx.fill();
}

export const TileSparkles: React.FC<TileSparklesProps> = ({ trigger, tileRef, config }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sparklesRef = useRef<Sparkle[]>([]);
  const animationFrameRef = useRef<number>();

  const intensity = Math.max(1, Math.min(100, config?.intensity ?? 100)) / 100;
  const count = Math.max(10, Math.min(50, config?.particleCount ?? 20));
  const sizeMul = Math.max(0.5, Math.min(2, (config?.particleSize ?? 100) / 100));
  const speedMul = Math.max(0.2, Math.min(2, (config?.speed ?? 100) / 100));

  const createSparkles = (canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    for (let i = 0; i < count; i++) {
      sparklesRef.current.push({
        x: Math.random() * rect.width,
        y: Math.random() * rect.height,
        vx: (Math.random() - 0.5) * 0.5 * speedMul,
        vy: (Math.random() - 0.5) * 0.5 * speedMul,
        size: (2 + Math.random() * 4) * sizeMul,
        rotation: Math.random() * Math.PI,
        rotationSpeed: (Math.random() - 0.5) * 0.1 * speedMul,
        opacity: 0,
        life: 0,
        maxLife: (40 + Math.random() * 40) / speedMul,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      });
    }
  };

  const animate = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    sparklesRef.current = sparklesRef.current.filter((s) => {
      s.x += s.vx;
      s.y += s.vy;
      s.rotation += s.rotationSpeed;
      s.life++;

      const halfLife = s.maxLife / 2;
      s.opacity = s.life < halfLife ? s.life / halfLife : 1 - (s.life - halfLife) / halfLife;

      const scale = s.opacity * (0.8 + Math.sin(s.life * 0.2 * speedMul) * 0.2);

      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rotation);
      ctx.globalAlpha = Math.max(0, s.opacity * intensity);

      // Glow
      ctx.shadowBlur = 10;
      ctx.shadowColor = s.color;

      ctx.fillStyle = s.color;
      drawStar(ctx, 0, 0, s.size * scale, 4, 0.3);

      ctx.restore();

      return s.life < s.maxLife;
    });

    if (sparklesRef.current.length > 0) {
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

    sparklesRef.current = [];
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    createSparkles(canvas);
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
