import React, { useEffect, useRef } from 'react';
import type { CelebrationConfig } from '../types';

interface RainbowParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hue: number;
  size: number;
  opacity: number;
}

interface TileRainbowProps {
  trigger: number;
  tileRef?: React.RefObject<HTMLDivElement>;
  config?: CelebrationConfig;
}

const DEFAULT_COUNT = 30;

export const TileRainbow: React.FC<TileRainbowProps> = ({ trigger, tileRef, config }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<RainbowParticle[]>([]);
  const animationFrameRef = useRef<number>();

  const intensity = Math.max(1, Math.min(100, config?.intensity ?? 100)) / 100;
  const count = Math.max(15, Math.min(60, config?.particleCount ?? DEFAULT_COUNT));
  const sizeMul = Math.max(0.5, Math.min(2, (config?.particleSize ?? 100) / 100));

  const createParticles = (canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.2;
      const hue = (i / count) * 360;
      const speed = (0.08 + Math.random() * 0.1) * intensity;
      particlesRef.current.push({
        x: centerX + Math.cos(angle) * 20,
        y: centerY + Math.sin(angle) * 20,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        hue,
        size: (3 + Math.random() * 5) * sizeMul,
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

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    particlesRef.current = particlesRef.current.filter((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.98;
      p.vy *= 0.98;
      if (Math.abs(p.x - rect.width / 2) > rect.width * 0.7 || Math.abs(p.y - rect.height / 2) > rect.height * 0.7) return false;
      ctx.save();
      ctx.globalAlpha = p.opacity * (0.6 + 0.4 * Math.sin(Date.now() * 0.005 + p.hue));
      ctx.fillStyle = `hsl(${p.hue}, 90%, 65%)`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return true;
    });

    if (particlesRef.current.length > 0) {
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

    particlesRef.current = [];
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    createParticles(canvas);
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
