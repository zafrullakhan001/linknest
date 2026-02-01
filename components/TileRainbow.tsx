import React, { useEffect, useRef } from 'react';
import type { CelebrationConfig } from '../types';

interface TileRainbowProps {
  trigger: number;
  tileRef?: React.RefObject<HTMLDivElement>;
  config?: CelebrationConfig;
}

const RAINBOW_COLORS = [
  'rgba(255, 0, 0, 0.6)',
  'rgba(255, 127, 0, 0.6)',
  'rgba(255, 255, 0, 0.6)',
  'rgba(0, 255, 0, 0.6)',
  'rgba(0, 0, 255, 0.6)',
  'rgba(75, 0, 130, 0.6)',
  'rgba(148, 0, 211, 0.6)'
];

export const TileRainbow: React.FC<TileRainbowProps> = ({ trigger, tileRef, config }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  const progressRef = useRef(0);

  const intensity = Math.max(1, Math.min(100, config?.intensity ?? 100)) / 100;
  const sizeMul = Math.max(0.5, Math.min(2, (config?.particleSize ?? 100) / 100));
  const speedMul = Math.max(0.2, Math.min(2, (config?.speed ?? 100) / 100));

  const animate = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const rect = canvas.getBoundingClientRect();

    progressRef.current += 0.01 * intensity * speedMul;
    if (progressRef.current > 1.2) progressRef.current = 1.2; // Stay full for a bit then fade?

    const centerX = rect.width / 2;
    const bottomY = rect.height;
    const radius = rect.width * 0.4 * sizeMul;
    const bandWidth = radius * 0.15;

    ctx.save();
    ctx.lineCap = 'round';

    // Draw each color band
    RAINBOW_COLORS.forEach((color, i) => {
      const r = radius - i * bandWidth;
      ctx.strokeStyle = color;
      ctx.lineWidth = bandWidth + 1;
      ctx.beginPath();
      // Animate the arc sweep
      const sweep = Math.min(1, progressRef.current) * Math.PI;
      ctx.arc(centerX, bottomY, r, Math.PI, Math.PI + sweep);
      ctx.stroke();
    });

    // Some sparkles around the rainbow
    if (progressRef.current > 0.5) {
      for (let i = 0; i < 3; i++) {
        const angle = Math.PI + Math.random() * Math.PI * Math.min(1, progressRef.current);
        const r = radius - Math.random() * bandWidth * 7;
        const x = centerX + Math.cos(angle) * r;
        const y = bottomY + Math.sin(angle) * r;

        ctx.fillStyle = '#fff';
        ctx.globalAlpha = (Math.sin(Date.now() * 0.01 * speedMul + i) * 0.5 + 0.5) * intensity;
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();

    if (progressRef.current < 1.2) {
      animationFrameRef.current = requestAnimationFrame(animate);
    } else {
      // Slowly fade out after staying full
      const fadeOut = () => {
        if (!canvasRef.current) return;
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;
        progressRef.current += 0.005 * speedMul;
        const opacity = Math.max(0, 1 - (progressRef.current - 1.2) * 2);

        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        ctx.save();
        ctx.globalAlpha = opacity * intensity;

        RAINBOW_COLORS.forEach((color, i) => {
          const r = radius - i * bandWidth;
          ctx.strokeStyle = color;
          ctx.lineWidth = bandWidth + 1;
          ctx.beginPath();
          ctx.arc(centerX, bottomY, r, Math.PI, 2 * Math.PI);
          ctx.stroke();
        });
        ctx.restore();

        if (opacity > 0) {
          animationFrameRef.current = requestAnimationFrame(fadeOut);
        }
      };
      animationFrameRef.current = requestAnimationFrame(fadeOut);
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

    progressRef.current = 0;
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
