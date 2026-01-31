import React, { useEffect, useRef } from 'react';
import type { CelebrationConfig } from '../types';

interface Leaf {
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

interface TileLeavesProps {
  trigger: number;
  tileRef?: React.RefObject<HTMLDivElement>;
  config?: CelebrationConfig;
}

const DEFAULT_COUNT = 15;
const COLORS = ['#d35400', '#e67e22', '#f39c12', '#8b4513', '#cd853f', '#daa520', '#b8860b', '#a0522d'];

function drawLeaf(ctx: CanvasRenderingContext2D, l: Leaf) {
  ctx.save();
  ctx.translate(l.x, l.y);
  ctx.rotate((l.rotation * Math.PI) / 180);
  ctx.globalAlpha = l.opacity;
  ctx.fillStyle = l.color;
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.ellipse(0, 0, l.size * 1.5, l.size * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export const TileLeaves: React.FC<TileLeavesProps> = ({ trigger, tileRef, config }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const leavesRef = useRef<Leaf[]>([]);
  const animationFrameRef = useRef<number>();

  const intensity = Math.max(1, Math.min(100, config?.intensity ?? 100)) / 100;
  const count = Math.max(6, Math.min(35, config?.particleCount ?? DEFAULT_COUNT));
  const sizeMul = Math.max(0.5, Math.min(2, (config?.particleSize ?? 100) / 100));

  const createLeaves = (canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    for (let i = 0; i < count; i++) {
      leavesRef.current.push({
        x: Math.random() * rect.width,
        y: -10 - Math.random() * 40,
        vx: (Math.random() - 0.5) * 0.15 * intensity,
        vy: (0.06 + Math.random() * 0.1) * intensity,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 0.8,
        size: (5 + Math.random() * 8) * sizeMul,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        opacity: (0.5 + Math.random() * 0.4) * intensity,
      });
    }
  };

  const animate = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();

    leavesRef.current = leavesRef.current.filter((l) => {
      l.x += l.vx + Math.sin(l.rotation * 0.05) * 0.25;
      l.y += l.vy;
      l.rotation += l.rotationSpeed;
      if (l.y > rect.height + 25) return false;
      drawLeaf(ctx, l);
      return true;
    });

    if (leavesRef.current.length > 0) {
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

    leavesRef.current = [];
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    createLeaves(canvas);
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
