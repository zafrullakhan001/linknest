import React, { useEffect, useRef, useCallback } from 'react';

export type CelebrationEffectType = 
  | 'none' 
  | 'fireworks' 
  | 'confetti' 
  | 'balloons' 
  | 'hearts' 
  | 'snow' 
  | 'bubbles' 
  | 'matrix' 
  | 'shooting-stars' 
  | 'floating-ribbons' 
  | 'sparkles';

export interface CelebrationEffectStyles {
  celebrationEffectEnabled: boolean;
  celebrationEffectType: CelebrationEffectType;
  celebrationIntensity: number;
  celebrationParticleSize: number;
  celebrationSpeed: number;
  celebrationColor1: string;
  celebrationColor2: string;
  celebrationColor3: string;
  celebrationShowOnForeground: boolean;
}

// Confetti piece for continuous falling
interface ConfettiPiece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  color: string;
  size: number;
  shape: 'square' | 'circle' | 'triangle' | 'star';
  opacity: number;
  swayAmount: number;
  swaySpeed: number;
  swayOffset: number;
}

// Firework particle with enhanced physics
interface FireworkParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  trail: { x: number; y: number }[];
  type: 'spark' | 'ember' | 'trail';
  brightness: number;
}

// Firework rocket that explodes
interface FireworkRocket {
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetY: number;
  color: string;
  exploded: boolean;
  trail: { x: number; y: number }[];
}

// Balloon for rising effect
interface BalloonPiece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  radiusX: number;
  radiusY: number;
  wobble: number;
  wobbleSpeed: number;
  opacity: number;
  stringLength: number;
}

// Heart particle
interface HeartPiece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  opacity: number;
  pulse: number;
  pulseSpeed: number;
  rotation: number;
}

// Snowflake
interface Snowflake {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  swayAmount: number;
  swaySpeed: number;
  swayOffset: number;
  crystalType: number;
}

// Bubble
interface Bubble {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  opacity: number;
  wobble: number;
  shineOffset: number;
}

// Matrix rain character
interface MatrixChar {
  x: number;
  y: number;
  char: string;
  speed: number;
  opacity: number;
  trailLength: number;
}

// Shooting star
interface ShootingStar {
  x: number;
  y: number;
  vx: number;
  vy: number;
  length: number;
  life: number;
  maxLife: number;
  color: string;
  width: number;
}

// Floating ribbon
interface Ribbon {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  width: number;
  length: number;
  points: { x: number; y: number }[];
  wavePhase: number;
  waveSpeed: number;
}

// Sparkle
interface Sparkle {
  x: number;
  y: number;
  size: number;
  maxSize: number;
  life: number;
  maxLife: number;
  color: string;
  rays: number;
  rotation: number;
  rotationSpeed: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// Helper to draw a heart shape
function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, opacity: number) {
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = color;
  ctx.translate(x, y);
  ctx.beginPath();
  const topCurveHeight = size * 0.3;
  ctx.moveTo(0, topCurveHeight);
  ctx.bezierCurveTo(0, 0, -size / 2, 0, -size / 2, topCurveHeight);
  ctx.bezierCurveTo(-size / 2, (size + topCurveHeight) / 2, 0, size, 0, size);
  ctx.bezierCurveTo(0, size, size / 2, (size + topCurveHeight) / 2, size / 2, topCurveHeight);
  ctx.bezierCurveTo(size / 2, 0, 0, 0, 0, topCurveHeight);
  ctx.closePath();
  ctx.fill();
  
  // Add shine
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.beginPath();
  ctx.ellipse(-size * 0.15, topCurveHeight * 0.8, size * 0.1, size * 0.15, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Helper to draw a snowflake crystal
function drawSnowflake(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, opacity: number, type: number) {
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = `rgba(220, 240, 255, ${opacity})`;
  ctx.lineWidth = size * 0.15;
  ctx.lineCap = 'round';
  ctx.translate(x, y);
  
  const arms = 6;
  for (let i = 0; i < arms; i++) {
    ctx.rotate(Math.PI / 3);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, size);
    ctx.stroke();
    
    // Branch details based on type
    if (type > 0) {
      ctx.beginPath();
      ctx.moveTo(0, size * 0.5);
      ctx.lineTo(size * 0.3, size * 0.7);
      ctx.moveTo(0, size * 0.5);
      ctx.lineTo(-size * 0.3, size * 0.7);
      ctx.stroke();
    }
    if (type > 1) {
      ctx.beginPath();
      ctx.moveTo(0, size * 0.7);
      ctx.lineTo(size * 0.2, size * 0.9);
      ctx.moveTo(0, size * 0.7);
      ctx.lineTo(-size * 0.2, size * 0.9);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// Helper to draw a sparkle/star
function drawSparkle(ctx: CanvasRenderingContext2D, sparkle: Sparkle) {
  ctx.save();
  ctx.globalAlpha = sparkle.life / sparkle.maxLife;
  ctx.translate(sparkle.x, sparkle.y);
  ctx.rotate(sparkle.rotation);
  
  const progress = 1 - (sparkle.life / sparkle.maxLife);
  const currentSize = sparkle.size + (sparkle.maxSize - sparkle.size) * Math.sin(progress * Math.PI);
  
  // Draw rays
  ctx.fillStyle = sparkle.color;
  for (let i = 0; i < sparkle.rays; i++) {
    ctx.rotate((Math.PI * 2) / sparkle.rays);
    ctx.beginPath();
    ctx.ellipse(0, currentSize * 0.5, currentSize * 0.15, currentSize, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // Center glow
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, currentSize * 0.5);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
  gradient.addColorStop(0.5, sparkle.color);
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, currentSize * 0.5, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.restore();
}

// Matrix characters
const MATRIX_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*()*&^%+-/~{[|`]}日本語アイウエオカキクケコ';

export const CelebrationEffects: React.FC<{
  styles: CelebrationEffectStyles | null;
  containerRef?: React.RefObject<HTMLDivElement | null>;
}> = ({ styles, containerRef }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const confettiRef = useRef<ConfettiPiece[]>([]);
  const particlesRef = useRef<FireworkParticle[]>([]);
  const rocketsRef = useRef<FireworkRocket[]>([]);
  const balloonsRef = useRef<BalloonPiece[]>([]);
  const heartsRef = useRef<HeartPiece[]>([]);
  const snowflakesRef = useRef<Snowflake[]>([]);
  const bubblesRef = useRef<Bubble[]>([]);
  const matrixCharsRef = useRef<MatrixChar[]>([]);
  const shootingStarsRef = useRef<ShootingStar[]>([]);
  const ribbonsRef = useRef<Ribbon[]>([]);
  const sparklesRef = useRef<Sparkle[]>([]);
  const lastFireworkRef = useRef(0);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const enabled = styles?.celebrationEffectEnabled ?? false;
  const effectType = (styles?.celebrationEffectType ?? 'none') as CelebrationEffectType;
  const showOnForeground = styles?.celebrationShowOnForeground ?? false;
  const intensity = clamp(styles?.celebrationIntensity ?? 50, 0, 100) / 100;
  const particleSizeScale = clamp(styles?.celebrationParticleSize ?? 3, 1, 5) / 3; // Better scale
  const speedMul = 0.5 + (clamp(styles?.celebrationSpeed ?? 50, 0, 100) / 100) * 1.0;
  const colors = [
    styles?.celebrationColor1 ?? '#ec4899',
    styles?.celebrationColor2 ?? '#8b5cf6',
    styles?.celebrationColor3 ?? '#f59e0b',
  ].filter(Boolean);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const el = containerRef?.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      canvas.width = w * ratio;
      canvas.height = h * ratio;
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.left = '';
      canvas.style.top = '';
    } else {
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = w * ratio;
      canvas.height = h * ratio;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      canvas.style.left = '0';
      canvas.style.top = '0';
    }
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }, [containerRef]);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    const el = containerRef?.current;
    if (el) {
      resizeObserverRef.current = new ResizeObserver(resizeCanvas);
      resizeObserverRef.current.observe(el);
    }
    const canvas = canvasRef.current;
    if (canvas && !containerRef) {
      resizeObserverRef.current = new ResizeObserver(resizeCanvas);
      resizeObserverRef.current.observe(canvas);
    }
    return () => {
      window.removeEventListener('resize', resizeCanvas);
      resizeObserverRef.current?.disconnect();
    };
  }, [resizeCanvas, containerRef]);

  useEffect(() => {
    if (!enabled || effectType === 'none') {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      confettiRef.current = [];
      particlesRef.current = [];
      rocketsRef.current = [];
      balloonsRef.current = [];
      heartsRef.current = [];
      snowflakesRef.current = [];
      bubblesRef.current = [];
      matrixCharsRef.current = [];
      shootingStarsRef.current = [];
      ribbonsRef.current = [];
      sparklesRef.current = [];
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const getSize = () => {
      const ratio = window.devicePixelRatio || 1;
      return { width: canvas.width / ratio, height: canvas.height / ratio };
    };
    const baseCount = 30 + Math.floor(intensity * 50);
    const sizeMul = Math.max(0.5, particleSizeScale);

    // ===== CONFETTI EFFECT =====
    const spawnConfetti = () => {
      const { width } = getSize();
      const count = Math.min(baseCount, 80);
      const shapes: Array<'square' | 'circle' | 'triangle' | 'star'> = ['square', 'circle', 'triangle', 'star'];
      for (let i = 0; i < count; i++) {
        confettiRef.current.push({
          x: Math.random() * width,
          y: -20 - Math.random() * 80,
          vx: (Math.random() - 0.5) * 1.5 * speedMul,
          vy: (0.8 + Math.random() * 1.2) * speedMul * (0.8 + intensity * 0.4),
          rotation: Math.random() * 360,
          rotationSpeed: (Math.random() - 0.5) * 3 * speedMul,
          color: colors[Math.floor(Math.random() * colors.length)] || '#ec4899',
          size: (4 + Math.random() * 5) * sizeMul,
          shape: shapes[Math.floor(Math.random() * shapes.length)],
          opacity: 0.7 + Math.random() * 0.3,
          swayAmount: (Math.random() - 0.5) * 30,
          swaySpeed: 0.02 + Math.random() * 0.03,
          swayOffset: Math.random() * Math.PI * 2,
        });
      }
    };

    const drawConfettiPiece = (c: ConfettiPiece) => {
      ctx.save();
      ctx.globalAlpha = c.opacity;
      
      // Apply sway
      const swayX = Math.sin(Date.now() * 0.001 * speedMul + c.swayOffset) * c.swayAmount;
      ctx.translate(c.x + swayX, c.y);
      ctx.rotate((c.rotation * Math.PI) / 180);
      ctx.fillStyle = c.color;
      
      // Add shadow for depth
      ctx.shadowColor = 'rgba(0,0,0,0.2)';
      ctx.shadowBlur = 2;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;
      
      switch (c.shape) {
        case 'square':
          ctx.fillRect(-c.size / 2, -c.size / 2, c.size, c.size);
          break;
        case 'circle':
          ctx.beginPath();
          ctx.arc(0, 0, c.size / 2, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'triangle':
          ctx.beginPath();
          ctx.moveTo(0, -c.size / 2);
          ctx.lineTo(c.size / 2, c.size / 2);
          ctx.lineTo(-c.size / 2, c.size / 2);
          ctx.closePath();
          ctx.fill();
          break;
        case 'star':
          ctx.beginPath();
          for (let i = 0; i < 5; i++) {
            ctx.lineTo(Math.cos((18 + i * 72) * Math.PI / 180) * c.size / 2,
                      -Math.sin((18 + i * 72) * Math.PI / 180) * c.size / 2);
            ctx.lineTo(Math.cos((54 + i * 72) * Math.PI / 180) * c.size / 4,
                      -Math.sin((54 + i * 72) * Math.PI / 180) * c.size / 4);
          }
          ctx.closePath();
          ctx.fill();
          break;
      }
      ctx.restore();
    };

    // ===== FIREWORKS EFFECT =====
    const createFireworkRocket = () => {
      const { width, height } = getSize();
      const startX = width * (0.1 + Math.random() * 0.8);
      const targetY = height * (0.15 + Math.random() * 0.35);
      const color = colors[Math.floor(Math.random() * colors.length)] || '#ec4899';
      
      rocketsRef.current.push({
        x: startX,
        y: height,
        vx: (Math.random() - 0.5) * 1,
        vy: -(3 + Math.random() * 2) * speedMul,
        targetY,
        color,
        exploded: false,
        trail: [],
      });
    };

    const explodeFirework = (rocket: FireworkRocket) => {
      const particleCount = Math.max(20, Math.min(80, Math.floor(baseCount * 1.5)));
      const explosionTypes = ['circle', 'heart', 'star', 'random'] as const;
      const type = explosionTypes[Math.floor(Math.random() * explosionTypes.length)];
      
      for (let i = 0; i < particleCount; i++) {
        let angle: number;
        let velocity: number;
        
        switch (type) {
          case 'heart':
            const t = (i / particleCount) * Math.PI * 2;
            angle = t;
            velocity = (1 + Math.sin(t) * 0.3) * speedMul * (0.8 + Math.random() * 0.4);
            break;
          case 'star':
            angle = (Math.PI * 2 * i) / particleCount + Math.sin(i * 0.5) * 0.3;
            velocity = (1.5 + Math.random() * 1) * speedMul;
            break;
          default:
            angle = (Math.PI * 2 * i) / particleCount + Math.random() * 0.5;
            velocity = (1 + Math.random() * 1.5) * speedMul;
        }
        
        particlesRef.current.push({
          x: rocket.x,
          y: rocket.y,
          vx: Math.cos(angle) * velocity,
          vy: Math.sin(angle) * velocity,
          life: 1,
          maxLife: 1,
          color: rocket.color,
          size: (1.5 + Math.random() * 1.5) * sizeMul,
          trail: [],
          type: Math.random() > 0.7 ? 'ember' : 'spark',
          brightness: 1,
        });
      }
      
      // Add some secondary sparkles
      for (let i = 0; i < 10; i++) {
        sparklesRef.current.push({
          x: rocket.x + (Math.random() - 0.5) * 30,
          y: rocket.y + (Math.random() - 0.5) * 30,
          size: 2,
          maxSize: (8 + Math.random() * 12) * sizeMul,
          life: 30 + Math.random() * 20,
          maxLife: 30 + Math.random() * 20,
          color: rocket.color,
          rays: 4 + Math.floor(Math.random() * 4),
          rotation: Math.random() * Math.PI * 2,
          rotationSpeed: (Math.random() - 0.5) * 0.2,
        });
      }
    };

    // ===== BALLOONS EFFECT =====
    const spawnBalloons = () => {
      const { width, height } = getSize();
      const count = Math.min(Math.floor(baseCount * 0.5), 25);
      for (let i = 0; i < count; i++) {
        const radiusX = (8 + Math.random() * 8) * sizeMul;
        balloonsRef.current.push({
          x: Math.random() * width,
          y: height + 40 + Math.random() * 100,
          vx: (Math.random() - 0.5) * 0.3 * speedMul,
          vy: (-0.8 - Math.random() * 1.2) * speedMul * (0.8 + intensity * 0.4),
          color: colors[Math.floor(Math.random() * colors.length)] || '#ec4899',
          radiusX,
          radiusY: radiusX * 1.25,
          wobble: Math.random() * Math.PI * 2,
          wobbleSpeed: 0.015 + Math.random() * 0.02,
          opacity: 0.75 + Math.random() * 0.25,
          stringLength: 25 + Math.random() * 20,
        });
      }
    };

    const drawBalloon = (b: BalloonPiece) => {
      ctx.save();
      const wx = Math.sin(b.wobble) * 3;
      ctx.translate(b.x + wx, b.y);
      ctx.globalAlpha = b.opacity;
      
      // Create gradient for 3D effect
      const gradient = ctx.createRadialGradient(-b.radiusX * 0.3, -b.radiusY * 0.3, 0, 0, 0, b.radiusX);
      gradient.addColorStop(0, lightenColor(b.color, 40));
      gradient.addColorStop(0.4, b.color);
      gradient.addColorStop(1, darkenColor(b.color, 30));
      
      ctx.fillStyle = gradient;
      ctx.strokeStyle = darkenColor(b.color, 20);
      ctx.lineWidth = 1;
      
      // Balloon body
      ctx.beginPath();
      ctx.ellipse(0, 0, b.radiusX, b.radiusY, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      
      // Shine/highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.beginPath();
      ctx.ellipse(-b.radiusX * 0.3, -b.radiusY * 0.35, b.radiusX * 0.25, b.radiusY * 0.2, -0.3, 0, Math.PI * 2);
      ctx.fill();
      
      // Knot
      ctx.fillStyle = darkenColor(b.color, 20);
      ctx.beginPath();
      ctx.moveTo(-3, b.radiusY - 2);
      ctx.lineTo(3, b.radiusY - 2);
      ctx.lineTo(0, b.radiusY + 4);
      ctx.closePath();
      ctx.fill();
      
      // String
      ctx.strokeStyle = 'rgba(100, 100, 100, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, b.radiusY + 4);
      const sway = Math.sin(b.wobble * 1.5) * 5;
      ctx.quadraticCurveTo(sway, b.radiusY + b.stringLength * 0.5, sway * 0.5, b.radiusY + b.stringLength);
      ctx.stroke();
      
      ctx.restore();
    };

    // ===== HEARTS EFFECT =====
    const spawnHearts = () => {
      const { width, height } = getSize();
      const count = Math.min(baseCount, 50);
      for (let i = 0; i < count; i++) {
        heartsRef.current.push({
          x: Math.random() * width,
          y: height + 20 + Math.random() * 80,
          vx: (Math.random() - 0.5) * 0.5 * speedMul,
          vy: (-0.6 - Math.random() * 0.8) * speedMul * (0.8 + intensity * 0.4),
          size: (10 + Math.random() * 15) * sizeMul,
          color: colors[Math.floor(Math.random() * colors.length)] || '#ec4899',
          opacity: 0.6 + Math.random() * 0.4,
          pulse: 0,
          pulseSpeed: 0.05 + Math.random() * 0.05,
          rotation: (Math.random() - 0.5) * 0.3,
        });
      }
    };

    // ===== SNOW EFFECT =====
    const spawnSnowflakes = () => {
      const { width } = getSize();
      const count = Math.min(baseCount, 60);
      for (let i = 0; i < count; i++) {
        snowflakesRef.current.push({
          x: Math.random() * width,
          y: -20 - Math.random() * 100,
          vx: (Math.random() - 0.5) * 0.5 * speedMul,
          vy: (0.3 + Math.random() * 0.5) * speedMul * (0.7 + intensity * 0.3),
          size: (3 + Math.random() * 6) * sizeMul,
          opacity: 0.4 + Math.random() * 0.5,
          swayAmount: 10 + Math.random() * 20,
          swaySpeed: 0.01 + Math.random() * 0.02,
          swayOffset: Math.random() * Math.PI * 2,
          crystalType: Math.floor(Math.random() * 3),
        });
      }
    };

    // ===== BUBBLES EFFECT =====
    const spawnBubbles = () => {
      const { width, height } = getSize();
      const count = Math.min(baseCount, 40);
      for (let i = 0; i < count; i++) {
        bubblesRef.current.push({
          x: Math.random() * width,
          y: height + 20 + Math.random() * 100,
          vx: (Math.random() - 0.5) * 0.2 * speedMul,
          vy: (-0.4 - Math.random() * 0.6) * speedMul * (0.8 + intensity * 0.4),
          radius: (5 + Math.random() * 10) * sizeMul,
          color: colors[Math.floor(Math.random() * colors.length)] || '#ec4899',
          opacity: 0.2 + Math.random() * 0.3,
          wobble: Math.random() * Math.PI * 2,
          shineOffset: Math.random() * 0.5,
        });
      }
    };

    const drawBubble = (b: Bubble) => {
      ctx.save();
      const wx = Math.sin(b.wobble) * 2;
      ctx.translate(b.x + wx, b.y);
      ctx.globalAlpha = b.opacity;
      
      // Bubble body with gradient
      const gradient = ctx.createRadialGradient(-b.radius * 0.3, -b.radius * 0.3, 0, 0, 0, b.radius);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
      gradient.addColorStop(0.5, hexToRgba(b.color, 0.2));
      gradient.addColorStop(1, hexToRgba(b.color, 0.1));
      
      ctx.fillStyle = gradient;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1;
      
      ctx.beginPath();
      ctx.arc(0, 0, b.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      
      // Shine
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.beginPath();
      ctx.ellipse(-b.radius * 0.3 + b.shineOffset * 5, -b.radius * 0.3, b.radius * 0.25, b.radius * 0.15, -0.5, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.restore();
    };

    // ===== MATRIX EFFECT =====
    const spawnMatrixChars = () => {
      const { width } = getSize();
      const fontSize = 14 * sizeMul;
      const columns = Math.floor(width / fontSize);
      
      for (let i = 0; i < Math.min(columns * 0.3, 15); i++) {
        matrixCharsRef.current.push({
          x: Math.floor(Math.random() * columns) * fontSize,
          y: -fontSize - Math.random() * 500,
          char: MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)],
          speed: (1 + Math.random() * 2) * speedMul * (0.8 + intensity * 0.4),
          opacity: 0.3 + Math.random() * 0.7,
          trailLength: 5 + Math.floor(Math.random() * 10),
        });
      }
    };

    // ===== SHOOTING STARS EFFECT =====
    const spawnShootingStar = () => {
      const { width, height } = getSize();
      const startY = height * (0.05 + Math.random() * 0.3);
      const color = colors[Math.floor(Math.random() * colors.length)] || '#ffffff';
      
      shootingStarsRef.current.push({
        x: Math.random() * width * 0.5,
        y: startY,
        vx: (3 + Math.random() * 3) * speedMul * (0.8 + intensity * 0.4),
        vy: (1 + Math.random() * 1.5) * speedMul * 0.5,
        length: 30 + Math.random() * 50,
        life: 1,
        maxLife: 1,
        color,
        width: 2 * sizeMul,
      });
    };

    // ===== RIBBONS EFFECT =====
    const spawnRibbons = () => {
      const { width, height } = getSize();
      const count = Math.min(Math.floor(baseCount * 0.4), 15);
      for (let i = 0; i < count; i++) {
        ribbonsRef.current.push({
          x: Math.random() * width,
          y: -50 - Math.random() * 100,
          vx: (Math.random() - 0.5) * 1 * speedMul,
          vy: (0.5 + Math.random() * 0.8) * speedMul * (0.8 + intensity * 0.4),
          color: colors[Math.floor(Math.random() * colors.length)] || '#ec4899',
          width: (3 + Math.random() * 3) * sizeMul,
          length: 40 + Math.random() * 40,
          points: [],
          wavePhase: Math.random() * Math.PI * 2,
          waveSpeed: 0.02 + Math.random() * 0.03,
        });
      }
    };

    const drawRibbon = (r: Ribbon) => {
      ctx.save();
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = r.color;
      
      // Draw ribbon as a series of connected segments
      for (let i = 0; i < r.points.length - 1; i++) {
        const point = r.points[i];
        const nextPoint = r.points[i + 1];
        const wave = Math.sin(r.wavePhase + i * 0.2) * 10;
        
        ctx.beginPath();
        ctx.moveTo(point.x + wave - r.width / 2, point.y);
        ctx.lineTo(point.x + wave + r.width / 2, point.y);
        ctx.lineTo(nextPoint.x + wave + r.width / 2, nextPoint.y);
        ctx.lineTo(nextPoint.x + wave - r.width / 2, nextPoint.y);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    };

    // ===== SPARKLES EFFECT =====
    const spawnRandomSparkles = () => {
      const { width, height } = getSize();
      const count = Math.min(baseCount, 30);
      for (let i = 0; i < count; i++) {
        sparklesRef.current.push({
          x: Math.random() * width,
          y: Math.random() * height,
          size: 1,
          maxSize: (5 + Math.random() * 10) * sizeMul,
          life: 20 + Math.random() * 40,
          maxLife: 20 + Math.random() * 40,
          color: colors[Math.floor(Math.random() * colors.length)] || '#ffffff',
          rays: 4 + Math.floor(Math.random() * 4),
          rotation: Math.random() * Math.PI * 2,
          rotationSpeed: (Math.random() - 0.5) * 0.1,
        });
      }
    };

    // Helper functions for colors
    function lightenColor(hex: string, percent: number): string {
      const num = parseInt(hex.replace('#', ''), 16);
      const amt = Math.round(2.55 * percent);
      const R = (num >> 16) + amt;
      const G = ((num >> 8) & 0x00ff) + amt;
      const B = (num & 0x0000ff) + amt;
      return `#${(0x1000000 + (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 + 
        (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 + 
        (B < 255 ? (B < 1 ? 0 : B) : 255))
        .toString(16).slice(1)}`;
    }

    function darkenColor(hex: string, percent: number): string {
      const num = parseInt(hex.replace('#', ''), 16);
      const amt = Math.round(2.55 * percent);
      const R = (num >> 16) - amt;
      const G = ((num >> 8) & 0x00ff) - amt;
      const B = (num & 0x0000ff) - amt;
      return `#${(0x1000000 + (R > 0 ? R : 0) * 0x10000 + 
        (G > 0 ? G : 0) * 0x100 + 
        (B > 0 ? B : 0))
        .toString(16).slice(1)}`;
    }

    function hexToRgba(hex: string, alpha: number): string {
      const num = parseInt(hex.replace('#', ''), 16);
      const r = (num >> 16) & 0xff;
      const g = (num >> 8) & 0xff;
      const b = num & 0xff;
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    let lastSpawn = 0;
    let confettiSpawnCount = 0;
    let balloonSpawnCount = 0;
    let heartSpawnCount = 0;
    let snowSpawnCount = 0;
    let bubbleSpawnCount = 0;
    let matrixSpawnCount = 0;
    let ribbonSpawnCount = 0;
    let sparkleSpawnCount = 0;

    const animate = () => {
      const { width, height } = getSize();
      const now = Date.now();
      ctx.clearRect(0, 0, width, height);

      // CONFETTI
      if (effectType === 'confetti') {
        if (now - lastSpawn > 400 / speedMul && confettiSpawnCount < 250) {
          spawnConfetti();
          lastSpawn = now;
          confettiSpawnCount += baseCount;
        }
        confettiRef.current = confettiRef.current.filter((c) => {
          c.x += c.vx;
          c.y += c.vy;
          c.vy += 0.005 * speedMul;
          c.rotation += c.rotationSpeed;
          if (c.y > height + 40) return false;
          drawConfettiPiece(c);
          return true;
        });
        if (confettiRef.current.length < 30) confettiSpawnCount = Math.max(0, confettiSpawnCount - 40);
      }

      // FIREWORKS
      if (effectType === 'fireworks') {
        // Spawn rockets
        if (now - lastFireworkRef.current > 1200 / speedMul && rocketsRef.current.length < 3) {
          createFireworkRocket();
          lastFireworkRef.current = now;
        }
        
        // Update and draw rockets
        rocketsRef.current = rocketsRef.current.filter((r) => {
          if (r.exploded) return false;
          
          r.x += r.vx;
          r.y += r.vy;
          r.vy += 0.02; // Gravity
          r.trail.push({ x: r.x, y: r.y });
          if (r.trail.length > 8) r.trail.shift();
          
          // Draw rocket trail
          if (r.trail.length > 1) {
            ctx.save();
            ctx.strokeStyle = r.color;
            ctx.lineWidth = 2 * sizeMul;
            ctx.lineCap = 'round';
            ctx.globalAlpha = 0.8;
            ctx.beginPath();
            ctx.moveTo(r.trail[0].x, r.trail[0].y);
            for (let i = 1; i < r.trail.length; i++) {
              ctx.lineTo(r.trail[i].x, r.trail[i].y);
            }
            ctx.stroke();
            ctx.restore();
          }
          
          // Draw rocket head
          ctx.save();
          ctx.fillStyle = r.color;
          ctx.shadowColor = r.color;
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.arc(r.x, r.y, 3 * sizeMul, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          
          // Check if reached target height or started falling
          if (r.y <= r.targetY || r.vy > 0) {
            r.exploded = true;
            explodeFirework(r);
            return false;
          }
          return true;
        });
        
        // Update and draw particles
        particlesRef.current = particlesRef.current.filter((p) => {
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.015; // Gravity
          p.vx *= 0.98;
          p.vy *= 0.98;
          p.life -= 0.008 * speedMul;
          p.brightness = p.life;
          
          if (p.life <= 0) return false;
          
          ctx.save();
          ctx.globalAlpha = p.life * 0.9;
          ctx.fillStyle = p.color;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 8 * p.life;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          return true;
        });
      }

      // BALLOONS
      if (effectType === 'balloons') {
        if (now - lastSpawn > 800 / speedMul && balloonSpawnCount < 80) {
          spawnBalloons();
          lastSpawn = now;
          balloonSpawnCount += Math.floor(baseCount * 0.5);
        }
        balloonsRef.current = balloonsRef.current.filter((b) => {
          b.x += b.vx;
          b.y += b.vy;
          b.wobble += b.wobbleSpeed;
          if (b.y < -80) return false;
          drawBalloon(b);
          return true;
        });
        if (balloonsRef.current.length < 8) balloonSpawnCount = Math.max(0, balloonSpawnCount - 15);
      }

      // HEARTS
      if (effectType === 'hearts') {
        if (now - lastSpawn > 600 / speedMul && heartSpawnCount < 100) {
          spawnHearts();
          lastSpawn = now;
          heartSpawnCount += baseCount;
        }
        heartsRef.current = heartsRef.current.filter((h) => {
          h.x += h.vx;
          h.y += h.vy;
          h.pulse += h.pulseSpeed;
          const pulseScale = 1 + Math.sin(h.pulse) * 0.15;
          if (h.y < -50) return false;
          drawHeart(ctx, h.x, h.y, h.size * pulseScale, h.color, h.opacity);
          return true;
        });
        if (heartsRef.current.length < 10) heartSpawnCount = Math.max(0, heartSpawnCount - 20);
      }

      // SNOW
      if (effectType === 'snow') {
        if (now - lastSpawn > 300 / speedMul && snowSpawnCount < 150) {
          spawnSnowflakes();
          lastSpawn = now;
          snowSpawnCount += baseCount;
        }
        snowflakesRef.current = snowflakesRef.current.filter((s) => {
          s.x += s.vx + Math.sin(now * 0.001 * speedMul + s.swayOffset) * 0.3;
          s.y += s.vy;
          if (s.y > height + 20) return false;
          drawSnowflake(ctx, s.x, s.y, s.size, s.opacity, s.crystalType);
          return true;
        });
        if (snowflakesRef.current.length < 20) snowSpawnCount = Math.max(0, snowSpawnCount - 30);
      }

      // BUBBLES
      if (effectType === 'bubbles') {
        if (now - lastSpawn > 500 / speedMul && bubbleSpawnCount < 60) {
          spawnBubbles();
          lastSpawn = now;
          bubbleSpawnCount += Math.floor(baseCount * 0.6);
        }
        bubblesRef.current = bubblesRef.current.filter((b) => {
          b.x += b.vx;
          b.y += b.vy;
          b.wobble += 0.02;
          if (b.y < -30) return false;
          drawBubble(b);
          return true;
        });
        if (bubblesRef.current.length < 8) bubbleSpawnCount = Math.max(0, bubbleSpawnCount - 12);
      }

      // MATRIX
      if (effectType === 'matrix') {
        if (now - lastSpawn > 200 / speedMul && matrixSpawnCount < 50) {
          spawnMatrixChars();
          lastSpawn = now;
          matrixSpawnCount += 15;
        }
        
        const fontSize = 14 * sizeMul;
        ctx.font = `bold ${fontSize}px monospace`;
        ctx.textAlign = 'center';
        
        matrixCharsRef.current = matrixCharsRef.current.filter((m) => {
          m.y += m.speed;
          if (m.y > height + m.trailLength * fontSize) return false;
          
          // Draw trail
          for (let i = 0; i < m.trailLength; i++) {
            const trailY = m.y - i * fontSize;
            if (trailY < -fontSize) continue;
            const alpha = Math.max(0, 1 - i / m.trailLength) * m.opacity * 0.6;
            ctx.fillStyle = `rgba(0, 255, 100, ${alpha})`;
            if (i === 0) {
              ctx.fillStyle = `rgba(200, 255, 200, ${m.opacity})`;
              ctx.shadowColor = '#0f0';
              ctx.shadowBlur = 5;
            } else {
              ctx.shadowBlur = 0;
            }
            ctx.fillText(i === 0 ? m.char : MATRIX_CHARS[Math.floor((m.y * 0.1 + i) % MATRIX_CHARS.length)], m.x, trailY);
          }
          return true;
        });
        if (matrixCharsRef.current.length < 10) matrixSpawnCount = Math.max(0, matrixSpawnCount - 20);
      }

      // SHOOTING STARS
      if (effectType === 'shooting-stars') {
        if (Math.random() < 0.02 * intensity * speedMul && shootingStarsRef.current.length < 3) {
          spawnShootingStar();
        }
        
        shootingStarsRef.current = shootingStarsRef.current.filter((s) => {
          s.x += s.vx;
          s.y += s.vy;
          s.life -= 0.01 * speedMul;
          if (s.life <= 0 || s.x > width + s.length || s.y > height) return false;
          
          ctx.save();
          const gradient = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * s.length * 0.1, s.y - s.vy * s.length * 0.1);
          gradient.addColorStop(0, s.color);
          gradient.addColorStop(1, 'transparent');
          ctx.strokeStyle = gradient;
          ctx.lineWidth = s.width;
          ctx.lineCap = 'round';
          ctx.globalAlpha = s.life;
          ctx.shadowColor = s.color;
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(s.x - s.vx * 3, s.y - s.vy * 3);
          ctx.stroke();
          ctx.restore();
          return true;
        });
      }

      // RIBBONS
      if (effectType === 'floating-ribbons') {
        if (now - lastSpawn > 700 / speedMul && ribbonSpawnCount < 40) {
          spawnRibbons();
          lastSpawn = now;
          ribbonSpawnCount += Math.floor(baseCount * 0.4);
        }
        ribbonsRef.current = ribbonsRef.current.filter((r) => {
          r.x += r.vx;
          r.y += r.vy;
          r.wavePhase += r.waveSpeed;
          r.points.push({ x: r.x, y: r.y });
          if (r.points.length > r.length) r.points.shift();
          if (r.y > height + 50) return false;
          drawRibbon(r);
          return true;
        });
        if (ribbonsRef.current.length < 5) ribbonSpawnCount = Math.max(0, ribbonSpawnCount - 10);
      }

      // SPARKLES
      if (effectType === 'sparkles') {
        if (now - lastSpawn > 400 / speedMul && sparkleSpawnCount < 60) {
          spawnRandomSparkles();
          lastSpawn = now;
          sparkleSpawnCount += baseCount;
        }
        sparklesRef.current = sparklesRef.current.filter((s) => {
          s.life--;
          s.rotation += s.rotationSpeed;
          if (s.life <= 0) return false;
          drawSparkle(ctx, s);
          return true;
        });
        if (sparklesRef.current.length < 15) sparkleSpawnCount = Math.max(0, sparkleSpawnCount - 25);
      }

      // Draw sparkles (used by fireworks and can be standalone)
      sparklesRef.current = sparklesRef.current.filter((s) => {
        s.life--;
        s.rotation += s.rotationSpeed;
        if (s.life <= 0) return false;
        drawSparkle(ctx, s);
        return true;
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    // Initial spawn
    const initialNow = Date.now();
    if (effectType === 'confetti') {
      spawnConfetti();
      lastSpawn = initialNow;
    }
    if (effectType === 'balloons') {
      spawnBalloons();
      lastSpawn = initialNow;
    }
    if (effectType === 'hearts') {
      spawnHearts();
      lastSpawn = initialNow;
    }
    if (effectType === 'snow') {
      spawnSnowflakes();
      lastSpawn = initialNow;
    }
    if (effectType === 'bubbles') {
      spawnBubbles();
      lastSpawn = initialNow;
    }
    if (effectType === 'sparkles') {
      spawnRandomSparkles();
      lastSpawn = initialNow;
    }

    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [enabled, effectType, intensity, particleSizeScale, speedMul, colors, resizeCanvas]);

  if (!enabled || effectType === 'none') return null;

  return (
    <canvas
      ref={canvasRef}
      className={`fixed pointer-events-none ${showOnForeground ? 'z-[9999]' : 'z-0'}`}
      style={{
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
        minWidth: 0,
        minHeight: 0,
      }}
      aria-hidden
    />
  );
};
