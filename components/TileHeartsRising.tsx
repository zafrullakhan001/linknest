import React, { useEffect, useRef } from 'react';
import type { CelebrationConfig } from '../types';

interface Heart {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  size: number;
  opacity: number;
}

interface TileHeartsRisingProps {
  trigger: number;
  tileRef?: React.RefObject<HTMLDivElement>;
  config?: CelebrationConfig;
}

const RED = '#e53935';
const DEFAULT_COUNT = 18;
const DEFAULT_MAX = 75;

function drawHeartPath(ctx: CanvasRenderingContext2D, size: number) {
  const scale = size / 16;
  ctx.beginPath();
  for (let i = 0; i <= 360; i++) {
    const t = (i * Math.PI) / 180;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    const px = x * scale;
    const py = -y * scale;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export const TileHeartsRising: React.FC<TileHeartsRisingProps> = ({ trigger, tileRef, config }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const heartsRef = useRef<Heart[]>([]);
  const animationFrameRef = useRef<number>();

  const intensity = Math.max(1, Math.min(100, config?.intensity ?? 100)) / 100;
  const count = Math.max(5, Math.min(80, config?.particleCount ?? DEFAULT_COUNT));
  const sizeMul = Math.max(0.5, Math.min(2, (config?.particleSize ?? 100) / 100));
  const maxHearts = Math.max(count * 3, 60);

  const addHearts = (canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    for (let i = 0; i < count; i++) {
      const baseSize = 9 + Math.random() * 11;
      const baseOpacity = 0.75 + Math.random() * 0.25;
      heartsRef.current.push({
        x: Math.random() * rect.width,
        y: rect.height + 15 + Math.random() * 50,
        vx: (Math.random() - 0.5) * 0.25 * intensity,
        vy: (-0.18 - Math.random() * 0.22) * intensity,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 0.6,
        size: baseSize * sizeMul,
        opacity: baseOpacity * intensity,
      });
    }
    if (heartsRef.current.length > maxHearts) {
      heartsRef.current = heartsRef.current.slice(-maxHearts);
    }
  };

  const drawHeart = (ctx: CanvasRenderingContext2D, h: Heart) => {
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.rotate((h.rotation * Math.PI) / 180);
    ctx.globalAlpha = h.opacity;
    ctx.fillStyle = RED;
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = Math.max(1, h.size * 0.06);
    drawHeartPath(ctx, h.size);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  };

  const animate = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    heartsRef.current = heartsRef.current.filter((h) => {
      h.x += h.vx;
      h.y += h.vy;
      h.rotation += h.rotationSpeed;
      if (h.y < -30) return false;
      drawHeart(ctx, h);
      return true;
    });

    if (heartsRef.current.length > 0) {
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

    if (trigger === 1) {
      heartsRef.current = [];
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    }

    addHearts(canvas);
    animate();

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [trigger, tileRef, intensity, count, sizeMul, maxHearts]);

  if (trigger === 0) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-10"
      style={{ borderRadius: 'inherit' }}
    />
  );
};
