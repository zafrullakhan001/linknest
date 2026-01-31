import React, { useEffect, useState, useRef } from 'react';
import type { CelebrationConfig } from '../types';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  intensity: number;
}

interface TileBurstFireworksProps {
  trigger: number;
  tileRef?: React.RefObject<HTMLDivElement>;
  config?: CelebrationConfig;
}

const DEFAULT_COUNT = 55;
const COLORS = ['#ff006e', '#8338ec', '#3a86ff', '#ffbe0b', '#fb5607', '#06d6a0', '#ff006e', '#8ac926', '#ffd166', '#ef476f'];

export const TileBurstFireworks: React.FC<TileBurstFireworksProps> = ({ trigger, tileRef, config }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animationFrameRef = useRef<number>();
  const [isActive, setIsActive] = useState(false);

  const intensity = Math.max(1, Math.min(100, config?.intensity ?? 100)) / 100;
  const particleCount = Math.max(20, Math.min(100, config?.particleCount ?? DEFAULT_COUNT));
  const sizeMul = Math.max(0.5, Math.min(2, (config?.particleSize ?? 100) / 100));

  const createBurst = (canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const centerX = rect.width * (0.25 + Math.random() * 0.5);
    const centerY = rect.height * (0.2 + Math.random() * 0.5);
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];

    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount + Math.random() * 0.3;
      const velocity = (0.25 + Math.random() * 0.5) * intensity;
      particlesRef.current.push({
        x: centerX,
        y: centerY,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life: 1,
        maxLife: 1,
        color,
        size: (1.5 + Math.random() * 2) * sizeMul,
        intensity,
      });
    }
  };

  const animate = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    particlesRef.current = particlesRef.current.filter((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.006;
      p.vx *= 0.99;
      p.vy *= 0.99;
      p.life -= 0.012;
      if (p.life > 0) {
        ctx.save();
        ctx.globalAlpha = p.life * 0.9 * p.intensity;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        return true;
      }
      return false;
    });

    if (particlesRef.current.length > 0 || isActive) {
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
    setIsActive(true);
    createBurst(canvas);
    animate();

    const intervals = [
      setTimeout(() => { if (canvas) createBurst(canvas); }, 600),
      setTimeout(() => { if (canvas) createBurst(canvas); }, 1200),
      setTimeout(() => { if (canvas) createBurst(canvas); }, 2000),
    ];
    const stopTimeout = setTimeout(() => setIsActive(false), 7000);

    return () => {
      intervals.forEach(clearTimeout);
      clearTimeout(stopTimeout);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [trigger, tileRef, intensity, particleCount, sizeMul]);

  if (trigger === 0) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-10"
      style={{ borderRadius: 'inherit' }}
    />
  );
};
