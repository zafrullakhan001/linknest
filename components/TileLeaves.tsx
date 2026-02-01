import React, { useEffect, useRef } from 'react';
import type { CelebrationConfig } from '../types';

interface Leaf {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationX: number;
  rotationSpeed: number;
  rotationXSpeed: number;
  size: number;
  color: string;
  opacity: number;
  type: number;
}

interface TileLeavesProps {
  trigger: number;
  tileRef?: React.RefObject<HTMLDivElement>;
  config?: CelebrationConfig;
}

const DEFAULT_COUNT = 15;
const COLORS = ['#d35400', '#e67e22', '#f39c12', '#c0392b', '#27ae60'];

function drawLeaf(ctx: CanvasRenderingContext2D, l: Leaf) {
  ctx.save();
  ctx.translate(l.x, l.y);
  ctx.rotate(l.rotation);
  ctx.scale(Math.cos(l.rotationX), 1);

  ctx.globalAlpha = l.opacity;
  ctx.fillStyle = l.color;

  const s = l.size;
  ctx.beginPath();
  if (l.type === 0) { // Maple-ish
    ctx.moveTo(0, -s);
    ctx.lineTo(s * 0.3, -s * 0.3);
    ctx.lineTo(s, -s * 0.3);
    ctx.lineTo(s * 0.4, s * 0.1);
    ctx.lineTo(s * 0.7, s * 0.8);
    ctx.lineTo(0, s * 0.4);
    ctx.lineTo(-s * 0.7, s * 0.8);
    ctx.lineTo(-s * 0.4, s * 0.1);
    ctx.lineTo(-s, -s * 0.3);
    ctx.lineTo(-s * 0.3, -s * 0.3);
  } else { // Oval
    ctx.ellipse(0, 0, s, s * 0.6, 0, 0, Math.PI * 2);
  }
  ctx.fill();

  // Stem
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, s * 1.2);
  ctx.stroke();

  ctx.restore();
}

export const TileLeaves: React.FC<TileLeavesProps> = ({ trigger, tileRef, config }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const leavesRef = useRef<Leaf[]>([]);
  const animationFrameRef = useRef<number>();

  const intensity = Math.max(1, Math.min(100, config?.intensity ?? 100)) / 100;
  const count = Math.max(5, Math.min(30, config?.particleCount ?? 12));
  const sizeMul = Math.max(0.5, Math.min(2, (config?.particleSize ?? 100) / 100));
  const speedMul = Math.max(0.2, Math.min(2, (config?.speed ?? 100) / 100));

  const createLeaves = (canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    for (let i = 0; i < count; i++) {
      leavesRef.current.push({
        x: Math.random() * rect.width,
        y: -10 - Math.random() * 50,
        vx: (Math.random() - 0.5) * 0.5 * intensity * speedMul,
        vy: (0.5 + Math.random() * 0.8) * intensity * speedMul,
        rotation: Math.random() * Math.PI * 2,
        rotationX: Math.random() * Math.PI,
        rotationSpeed: (Math.random() - 0.5) * 0.05 * speedMul,
        rotationXSpeed: (0.02 + Math.random() * 0.05) * speedMul,
        size: (6 + Math.random() * 6) * sizeMul,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        opacity: (0.7 + Math.random() * 0.3) * intensity,
        type: Math.random() > 0.5 ? 0 : 1
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

    leavesRef.current = leavesRef.current.filter((l) => {
      l.x += l.vx + Math.sin(l.rotationX) * 0.5 * speedMul;
      l.y += l.vy;
      l.rotation += l.rotationSpeed;
      l.rotationX += l.rotationXSpeed;

      if (l.y > rect.height + 20) return false;
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

    if (tileRef?.current) {
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
