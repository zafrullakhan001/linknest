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
  decay: number;
}

interface TileBurstFireworksProps {
  trigger: number;
  tileRef?: React.RefObject<HTMLDivElement>;
  config?: CelebrationConfig;
}

const DEFAULT_COUNT = 40;
const COLORS = ['#ff006e', '#8338ec', '#3a86ff', '#ffbe0b', '#fb5607', '#06d6a0', '#ff595e', '#ff924c', '#ffca3a', '#c5ca30', '#8ac926'];

export const TileBurstFireworks: React.FC<TileBurstFireworksProps> = ({ trigger, tileRef, config }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animationFrameRef = useRef<number>();

  const intensity = Math.max(1, Math.min(100, config?.intensity ?? 100)) / 100;
  const particleCount = Math.max(20, Math.min(80, config?.particleCount ?? DEFAULT_COUNT));
  const sizeMul = Math.max(0.7, Math.min(2.5, (config?.particleSize ?? 100) / 100));
  const speedMul = Math.max(0.2, Math.min(2, (config?.speed ?? 100) / 100));

  const createBurst = (canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const centerX = rect.width * (0.2 + Math.random() * 0.6);
    const centerY = rect.height * (0.2 + Math.random() * 0.5);
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];

    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 0.2;
      const velocity = (0.5 + Math.random() * 1.5) * intensity * speedMul;
      particlesRef.current.push({
        x: centerX,
        y: centerY,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life: 1,
        maxLife: 1,
        color,
        size: (1 + Math.random() * 2) * sizeMul,
        decay: (0.005 + Math.random() * 0.015) * speedMul,
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
      p.vy += 0.015 * speedMul; // Gravity
      p.vx *= Math.pow(0.98, speedMul);
      p.vy *= Math.pow(0.98, speedMul);
      p.life -= p.decay;

      if (p.life > 0) {
        ctx.save();
        ctx.globalAlpha = p.life;

        // Sparkling effect
        const sparkle = Math.sin(Date.now() * 0.05 * speedMul + p.x) * 0.3 + 0.7;

        ctx.shadowBlur = 4 * p.life;
        ctx.shadowColor = p.color;
        ctx.fillStyle = p.color;

        ctx.beginPath();
        const r = p.size * sparkle;
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
        return true;
      }
      return false;
    });

    if (particlesRef.current.length > 0) {
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

    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);

    // Multiple bursts over time
    createBurst(canvas);
    setTimeout(() => { if (canvasRef.current) createBurst(canvasRef.current); }, 500 / speedMul);
    setTimeout(() => { if (canvasRef.current) createBurst(canvasRef.current); }, 1100 / speedMul);

    animate();

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [trigger, tileRef, intensity, particleCount, sizeMul, speedMul]);

  if (trigger === 0) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-10"
      style={{ borderRadius: 'inherit' }}
    />
  );
};
