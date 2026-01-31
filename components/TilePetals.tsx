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
  opacity: number;
}

interface TilePetalsProps {
  trigger: number;
  tileRef?: React.RefObject<HTMLDivElement>;
  config?: CelebrationConfig;
}

const DEFAULT_COUNT = 18;
const COLORS = ['#ff9ff3', '#f368e0', '#ff6b81', '#ffa8a8', '#fd79a8', '#e84393', '#ff7675', '#fab1a0', '#ffeaa7'];

function drawPetal(ctx: CanvasRenderingContext2D, p: Petal) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate((p.rotation * Math.PI) / 180);
  ctx.globalAlpha = p.opacity;
  ctx.fillStyle = p.color;
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.ellipse(0, 0, p.size, p.size * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export const TilePetals: React.FC<TilePetalsProps> = ({ trigger, tileRef, config }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const petalsRef = useRef<Petal[]>([]);
  const animationFrameRef = useRef<number>();

  const intensity = Math.max(1, Math.min(100, config?.intensity ?? 100)) / 100;
  const count = Math.max(8, Math.min(40, config?.particleCount ?? DEFAULT_COUNT));
  const sizeMul = Math.max(0.5, Math.min(2, (config?.particleSize ?? 100) / 100));

  const createPetals = (canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    for (let i = 0; i < count; i++) {
      petalsRef.current.push({
        x: Math.random() * rect.width,
        y: -10 - Math.random() * 30,
        vx: (Math.random() - 0.5) * 0.12 * intensity,
        vy: (0.08 + Math.random() * 0.12) * intensity,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 1.2,
        size: (4 + Math.random() * 6) * sizeMul,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        opacity: (0.6 + Math.random() * 0.35) * intensity,
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

    petalsRef.current = petalsRef.current.filter((p) => {
      p.x += p.vx + Math.sin(p.rotation * 0.1) * 0.2;
      p.y += p.vy;
      p.rotation += p.rotationSpeed;
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

    if (tileRef?.current && canvas) {
      const rect = tileRef.current.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    }

    petalsRef.current = [];
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    createPetals(canvas);
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
