import React, { useEffect, useRef } from 'react';

interface Bubble {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  opacity: number;
  wobble: number;
  wobbleSpeed: number;
}

interface TileBubblesProps {
  trigger: number;
  tileRef?: React.RefObject<HTMLDivElement>;
}

export const TileBubbles: React.FC<TileBubblesProps> = ({ trigger, tileRef }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bubblesRef = useRef<Bubble[]>([]);
  const animationFrameRef = useRef<number>();

  const createBubbles = (canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const count = 20;
    bubblesRef.current = [];
    for (let i = 0; i < count; i++) {
      bubblesRef.current.push({
        x: Math.random() * rect.width,
        y: rect.height + 5 + Math.random() * 20,
        vx: (Math.random() - 0.5) * 0.12,
        vy: -0.15 - Math.random() * 0.2,
        radius: 3 + Math.random() * 5,
        opacity: 0.15 + Math.random() * 0.2,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.02 + Math.random() * 0.03,
      });
    }
  };

  const drawBubble = (ctx: CanvasRenderingContext2D, b: Bubble) => {
    ctx.save();
    const wx = Math.sin(b.wobble) * 2;
    ctx.translate(b.x + wx, b.y);
    ctx.globalAlpha = b.opacity;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.fillStyle = 'rgba(200, 230, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, b.radius, 0, Math.PI * 2);
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

    bubblesRef.current = bubblesRef.current.filter((b) => {
      b.x += b.vx;
      b.y += b.vy;
      b.wobble += b.wobbleSpeed;
      if (b.y < -b.radius - 10) return false;
      drawBubble(ctx, b);
      return true;
    });

    if (bubblesRef.current.length > 0) {
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

    bubblesRef.current = [];
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    createBubbles(canvas);
    animate();

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [trigger, tileRef]);

  if (trigger === 0) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-10"
      style={{ borderRadius: 'inherit' }}
    />
  );
};
