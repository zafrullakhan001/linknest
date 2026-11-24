import React, { useEffect, useRef } from 'react';
import type { CelebrationConfig } from '../types';

interface Snowflake {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  size: number;
  opacity: number;
}

interface TileSnowfallProps {
  trigger: number;
  tileRef?: React.RefObject<HTMLDivElement>;
  config?: CelebrationConfig;
}

const DEFAULT_BURST = 12;

export const TileSnowfall: React.FC<TileSnowfallProps> = ({ trigger, tileRef, config }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const snowflakesRef = useRef<Snowflake[]>([]);
  const animationFrameRef = useRef<number>();

  const intensity = Math.max(1, Math.min(100, config?.intensity ?? 100)) / 100;
  const burst = Math.max(5, Math.min(80, config?.particleCount ?? DEFAULT_BURST));
  const sizeMul = Math.max(0.5, Math.min(2, (config?.particleSize ?? 100) / 100));
  const speedMul = Math.max(0.2, Math.min(2, (config?.speed ?? 100) / 100));
  const maxFlakes = Math.max(burst * 4, 60);

  const addSnowflakes = (canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    for (let i = 0; i < burst; i++) {
      const baseSize = 2 + Math.random() * 4;
      const baseOpacity = 0.5 + Math.random() * 0.5;
      snowflakesRef.current.push({
        x: Math.random() * rect.width,
        y: -10 - Math.random() * 30,
        vx: (Math.random() - 0.5) * 0.15 * intensity * speedMul,
        vy: (0.08 + Math.random() * 0.12) * intensity * speedMul,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 0.3 * speedMul,
        size: baseSize * sizeMul,
        opacity: baseOpacity * intensity,
      });
    }
    if (snowflakesRef.current.length > maxFlakes) {
      snowflakesRef.current = snowflakesRef.current.slice(-maxFlakes);
    }
  };

  const drawFlake = (ctx: CanvasRenderingContext2D, f: Snowflake) => {
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate((f.rotation * Math.PI) / 180);
    ctx.globalAlpha = f.opacity;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.beginPath();
    // Simple 6-point snowflake shape
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI * 2 * i) / 6;
      const r = f.size;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  const animate = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    snowflakesRef.current = snowflakesRef.current.filter((f) => {
      f.x += f.vx;
      f.y += f.vy;
      f.rotation += f.rotationSpeed;
      if (f.y > canvas.height + 20) return false;
      drawFlake(ctx, f);
      return true;
    });

    if (snowflakesRef.current.length > 0) {
      animationFrameRef.current = requestAnimationFrame(animate);
    }
  };

  useEffect(() => {
    if (trigger === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const updateSize = () => {
      if (tileRef?.current && canvas) {
        const rect = tileRef.current.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
      }
    };
    updateSize();

    if (trigger === 1) {
      snowflakesRef.current = [];
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    }

    addSnowflakes(canvas);
    animate();

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [trigger, tileRef, intensity, burst, sizeMul, maxFlakes, speedMul]);

  if (trigger === 0) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-10"
      style={{ borderRadius: 'inherit' }}
    />
  );
};
