import React, { useEffect, useRef, useCallback } from 'react';

export type CelebrationEffectType = 
  | 'none' 
  | 'fireworks' 
  | 'rocket-fireworks'
  | 'confetti' 
  | 'balloons' 
  | 'hearts' 
  | 'snow' 
  | 'bubbles' 
  | 'matrix' 
  | 'shooting-stars' 
  | 'floating-ribbons' 
  | 'sparkles'
  | 'rain'
  | 'leaves'
  | 'fireflies'
  | 'petals'
  | 'aurora'
  | 'cosmic'
  | 'meteors'
  | 'dandelion'
  | 'butterflies'
  | 'lightning';

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
  celebrationOpacity?: number;
  celebrationBurstInterval?: number;
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

// Firework particle - streak-based (same as TileFireworks for consistent look)
interface FireworkParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  lineLength: number;
  intensity: number;
}

// Tile-style fireworks palette (matches TileFireworks exactly)
const FIREWORKS_COLORS = [
  'rgba(255, 50, 50, 1.0)', 'rgba(50, 150, 255, 1.0)', 'rgba(255, 255, 50, 1.0)',
  'rgba(50, 255, 50, 1.0)', 'rgba(200, 50, 255, 1.0)', 'rgba(255, 120, 0, 1.0)',
  'rgba(255, 50, 180, 1.0)', 'rgba(0, 255, 255, 1.0)', 'rgba(150, 255, 100, 1.0)', 'rgba(255, 180, 100, 1.0)',
];

interface FireworkRocket {
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetY: number;
  color: string;
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

interface RainDrop { x: number; y: number; len: number; speed: number; opacity: number; sway: number; swayOffset: number; }
interface Leaf { x: number; y: number; vx: number; vy: number; size: number; color: string; rotation: number; rotSpeed: number; opacity: number; sway: number; swayO: number; }
interface Firefly { x: number; y: number; vx: number; vy: number; size: number; color: string; blink: number; blinkSpeed: number; }
interface Petal { x: number; y: number; vx: number; vy: number; size: number; color: string; rotation: number; rotSpeed: number; opacity: number; }
interface CosmicOrb { x: number; y: number; vx: number; vy: number; radius: number; color: string; pulse: number; }
interface DandelionSeed { x: number; y: number; vx: number; vy: number; size: number; opacity: number; rot: number; }
interface Butterfly { x: number; y: number; vx: number; vy: number; size: number; color: string; wingPhase: number; yOffset: number; }

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, opacity: number) {
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = color;
  ctx.translate(Math.round(x), Math.round(y));
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

function drawSnowflake(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, opacity: number, type: number) {
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = `rgba(220, 240, 255, ${opacity})`;
  ctx.lineWidth = Math.max(1, size * 0.2);
  ctx.lineCap = 'round';
  ctx.translate(Math.round(x), Math.round(y));
  
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

function drawSparkle(ctx: CanvasRenderingContext2D, sparkle: Sparkle) {
  ctx.save();
  ctx.globalAlpha = sparkle.life / sparkle.maxLife;
  ctx.translate(Math.round(sparkle.x), Math.round(sparkle.y));
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
  const balloonsRef = useRef<BalloonPiece[]>([]);
  const heartsRef = useRef<HeartPiece[]>([]);
  const snowflakesRef = useRef<Snowflake[]>([]);
  const bubblesRef = useRef<Bubble[]>([]);
  const matrixCharsRef = useRef<MatrixChar[]>([]);
  const shootingStarsRef = useRef<ShootingStar[]>([]);
  const ribbonsRef = useRef<Ribbon[]>([]);
  const sparklesRef = useRef<Sparkle[]>([]);
  const rocketsRef = useRef<FireworkRocket[]>([]);
  const rainRef = useRef<RainDrop[]>([]);
  const leavesRef = useRef<Leaf[]>([]);
  const firefliesRef = useRef<Firefly[]>([]);
  const petalsRef = useRef<Petal[]>([]);
  const cosmicRef = useRef<CosmicOrb[]>([]);
  const dandelionRef = useRef<DandelionSeed[]>([]);
  const butterfliesRef = useRef<Butterfly[]>([]);
  const auroraPhaseRef = useRef(0);
  const lightningRef = useRef(0);
  const meteorsRef = useRef<ShootingStar[]>([]);
  const lastFireworkRef = useRef(0);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const pixelRatioRef = useRef(1);

  const enabled = styles?.celebrationEffectEnabled ?? false;
  const effectType = (styles?.celebrationEffectType ?? 'none') as CelebrationEffectType;
  const showOnForeground = styles?.celebrationShowOnForeground ?? false;
  const intensity = clamp(styles?.celebrationIntensity ?? 50, 0, 100) / 100;
  const particleSizeScale = clamp(styles?.celebrationParticleSize ?? 3, 1, 5) / 3;
  const speedMul = 0.5 + (clamp(styles?.celebrationSpeed ?? 50, 0, 100) / 100) * 1.0;
  const opacityMul = clamp(styles?.celebrationOpacity ?? 100, 0, 100) / 100;
  const burstIntervalMs = clamp(styles?.celebrationBurstInterval ?? 1500, 500, 5000);
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
      const w = Math.floor(rect.width);
      const h = Math.floor(rect.height);
      const bufferW = Math.floor(w * ratio);
      const bufferH = Math.floor(h * ratio);
      canvas.width = bufferW;
      canvas.height = bufferH;
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.left = '';
      canvas.style.top = '';
    } else {
      const w = Math.floor(window.innerWidth);
      const h = Math.floor(window.innerHeight);
      canvas.width = Math.floor(w * ratio);
      canvas.height = Math.floor(h * ratio);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      canvas.style.left = '0';
      canvas.style.top = '0';
    }
    pixelRatioRef.current = ratio;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset first
      ctx.scale(ratio, ratio);
      ctx.imageSmoothingEnabled = true;
      (ctx as CanvasRenderingContext2D & { imageSmoothingQuality?: string }).imageSmoothingQuality = 'high';
    }
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
      rainRef.current = [];
      leavesRef.current = [];
      firefliesRef.current = [];
      petalsRef.current = [];
      cosmicRef.current = [];
      dandelionRef.current = [];
      butterfliesRef.current = [];
      meteorsRef.current = [];
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const getSize = () => {
      const ratio = pixelRatioRef.current || 1;
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
          size: (5 + Math.random() * 6) * sizeMul,
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
      const swayX = Math.sin(Date.now() * 0.001 * speedMul + c.swayOffset) * c.swayAmount;
      ctx.translate(Math.round(c.x + swayX), Math.round(c.y));
      ctx.rotate((c.rotation * Math.PI) / 180);
      ctx.fillStyle = c.color;
      
      switch (c.shape) {
        case 'square':
          ctx.fillRect(Math.round(-c.size / 2), Math.round(-c.size / 2), Math.round(c.size), Math.round(c.size));
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

    // ===== FIREWORKS EFFECT (TileFireworks logic - streak-based bursts) =====
    const fireworkParticleCount = Math.max(18, Math.min(60, Math.floor(baseCount * 0.8)));
    const createFireworkBurst = () => {
      const { width, height } = getSize();
      const centerX = width * (0.05 + Math.random() * 0.9);
      const centerY = height * (0.05 + Math.random() * 0.9);
      const color = FIREWORKS_COLORS[Math.floor(Math.random() * FIREWORKS_COLORS.length)];
      createFireworkBurstAt(centerX, centerY, color);
    };
    const createFireworkBurstAt = (centerX: number, centerY: number, color: string) => {
      for (let i = 0; i < fireworkParticleCount; i++) {
        const angle = (Math.PI * 2 * i) / fireworkParticleCount + (Math.random() - 0.5) * 0.5;
        const velocity = (0.2 + Math.random() * 0.4) * intensity * (0.8 + speedMul * 0.2);
        const baseLine = 45 + Math.random() * 55;
        particlesRef.current.push({
          x: centerX,
          y: centerY,
          vx: Math.cos(angle) * velocity,
          vy: Math.sin(angle) * velocity,
          life: 1,
          maxLife: 1,
          color,
          size: 1.0 * sizeMul,
          lineLength: baseLine * sizeMul,
          intensity,
        });
      }
    };
    const createRocket = () => {
      const { width, height } = getSize();
      const startX = width * (0.05 + Math.random() * 0.9);
      const color = FIREWORKS_COLORS[Math.floor(Math.random() * FIREWORKS_COLORS.length)];
      const fromTop = Math.random() < 0.5;
      if (fromTop) {
        const targetY = height * (0.5 + Math.random() * 0.45);
        rocketsRef.current.push({
          x: startX,
          y: -20,
          vx: (Math.random() - 0.5) * 0.6,
          vy: (2 + Math.random() * 2) * speedMul,
          targetY,
          color,
          trail: [],
        });
      } else {
        const targetY = height * (0.1 + Math.random() * 0.4);
        rocketsRef.current.push({
          x: startX,
          y: height + 20,
          vx: (Math.random() - 0.5) * 0.8,
          vy: -(2.5 + Math.random() * 2) * speedMul,
          targetY,
          color,
          trail: [],
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
      ctx.translate(Math.round(b.x + wx), Math.round(b.y));
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
      ctx.translate(Math.round(b.x + wx), Math.round(b.y));
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
      const fontSize = Math.max(14, 16 * sizeMul);
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

    const spawnRain = () => {
      const { width } = getSize();
      const count = Math.min(20 + Math.floor(baseCount * 0.5), 60);
      for (let i = 0; i < count; i++) {
        rainRef.current.push({
          x: Math.random() * width,
          y: -10 - Math.random() * 100,
          len: 8 + Math.random() * 16 * sizeMul,
          speed: (3 + Math.random() * 4) * speedMul * (0.7 + intensity * 0.3),
          opacity: 0.3 + Math.random() * 0.4,
          sway: 2 + Math.random() * 4,
          swayOffset: Math.random() * Math.PI * 2,
        });
      }
    };
    const spawnLeaves = () => {
      const { width, height } = getSize();
      const count = Math.min(baseCount, 40);
      const leafColors = ['#8B4513', '#A0522D', '#CD853F', '#D2691E', '#B8860B', '#DAA520', '#228B22', '#556B2F', '#6B8E23'];
      for (let i = 0; i < count; i++) {
        leavesRef.current.push({
          x: Math.random() * width,
          y: -20 - Math.random() * 80,
          vx: (Math.random() - 0.5) * 0.8 * speedMul,
          vy: (0.4 + Math.random() * 0.8) * speedMul * (0.8 + intensity * 0.3),
          size: (6 + Math.random() * 10) * sizeMul,
          color: leafColors[Math.floor(Math.random() * leafColors.length)],
          rotation: Math.random() * 360,
          rotSpeed: (Math.random() - 0.5) * 2,
          opacity: 0.6 + Math.random() * 0.4,
          sway: 15 + Math.random() * 25,
          swayO: Math.random() * Math.PI * 2,
        });
      }
    };
    const spawnFireflies = () => {
      const { width, height } = getSize();
      const count = Math.min(15 + Math.floor(baseCount * 0.3), 45);
      for (let i = 0; i < count; i++) {
        firefliesRef.current.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.3,
          vy: (Math.random() - 0.5) * 0.2,
          size: (2 + Math.random() * 3) * sizeMul,
          color: colors[Math.floor(Math.random() * colors.length)] || '#ffff88',
          blink: Math.random() * Math.PI * 2,
          blinkSpeed: 0.03 + Math.random() * 0.04,
        });
      }
    };
    const spawnPetals = () => {
      const { width } = getSize();
      const count = Math.min(baseCount, 35);
      const petalColors = ['#ff69b4', '#ff1493', '#ffb6c1', '#ffc0cb', '#db7093', '#ec4899', '#f472b6'];
      for (let i = 0; i < count; i++) {
        petalsRef.current.push({
          x: Math.random() * width,
          y: -20 - Math.random() * 100,
          vx: (Math.random() - 0.5) * 1.2 * speedMul,
          vy: (0.5 + Math.random() * 0.9) * speedMul * (0.8 + intensity * 0.3),
          size: (8 + Math.random() * 12) * sizeMul,
          color: petalColors[Math.floor(Math.random() * petalColors.length)],
          rotation: Math.random() * 360,
          rotSpeed: (Math.random() - 0.5) * 1.5,
          opacity: 0.7 + Math.random() * 0.3,
        });
      }
    };
    const spawnCosmic = () => {
      const { width, height } = getSize();
      const count = Math.min(20 + Math.floor(baseCount * 0.4), 50);
      for (let i = 0; i < count; i++) {
        cosmicRef.current.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.15,
          vy: (Math.random() - 0.5) * 0.1,
          radius: (3 + Math.random() * 8) * sizeMul,
          color: colors[Math.floor(Math.random() * colors.length)] || '#a78bfa',
          pulse: Math.random() * Math.PI * 2,
        });
      }
    };
    const spawnDandelion = () => {
      const { width, height } = getSize();
      const count = Math.min(baseCount, 30);
      for (let i = 0; i < count; i++) {
        dandelionRef.current.push({
          x: Math.random() * width,
          y: height + 20 + Math.random() * 80,
          vx: (Math.random() - 0.5) * 0.4 * speedMul,
          vy: (-0.5 - Math.random() * 0.6) * speedMul * (0.8 + intensity * 0.3),
          size: (4 + Math.random() * 6) * sizeMul,
          opacity: 0.4 + Math.random() * 0.4,
          rot: Math.random() * Math.PI * 2,
        });
      }
    };
    const spawnButterflies = () => {
      const { width, height } = getSize();
      const count = Math.min(12 + Math.floor(baseCount * 0.25), 30);
      for (let i = 0; i < count; i++) {
        butterfliesRef.current.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.5,
          vy: (Math.random() - 0.5) * 0.4,
          size: (10 + Math.random() * 14) * sizeMul,
          color: colors[Math.floor(Math.random() * colors.length)] || '#fbbf24',
          wingPhase: Math.random() * Math.PI * 2,
          yOffset: 0,
        });
      }
    };
    const spawnMeteor = () => {
      const { width, height } = getSize();
      meteorsRef.current.push({
        x: Math.random() * width * 0.5,
        y: height * (0.05 + Math.random() * 0.25),
        vx: (4 + Math.random() * 4) * speedMul,
        vy: (2 + Math.random() * 2) * speedMul * 0.5,
        length: 50 + Math.random() * 80,
        life: 1,
        maxLife: 1,
        color: '#ffffff',
        width: 3 * sizeMul,
      });
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
    let rainSpawnCount = 0;
    let leavesSpawnCount = 0;
    let firefliesSpawnCount = 0;
    let petalsSpawnCount = 0;
    let cosmicSpawnCount = 0;
    let dandelionSpawnCount = 0;
    let butterfliesSpawnCount = 0;
    let heartSpawnCount = 0;
    let snowSpawnCount = 0;
    let bubbleSpawnCount = 0;
    let matrixSpawnCount = 0;
    let ribbonSpawnCount = 0;
    let sparkleSpawnCount = 0;

    const animate = () => {
      const { width, height } = getSize();
      const now = Date.now();
      ctx.clearRect(0, 0, Math.ceil(width), Math.ceil(height));
      ctx.globalAlpha = opacityMul;

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

      const updateAndDrawStreakParticles = () => {
        particlesRef.current = particlesRef.current.filter((p) => {
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.004;
          p.vx *= 0.997;
          p.vy *= 0.997;
          p.life -= 0.0015 * speedMul;
          if (p.life <= 0) return false;
          ctx.save();
          ctx.globalAlpha = p.life * 0.6 * p.intensity;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(1, p.size);
          ctx.lineCap = 'round';
          const prevX = p.x - p.vx * (p.lineLength / 4);
          const prevY = p.y - p.vy * (p.lineLength / 4);
          ctx.beginPath();
          ctx.moveTo(Math.round(prevX), Math.round(prevY));
          ctx.lineTo(Math.round(p.x), Math.round(p.y));
          ctx.stroke();
          ctx.restore();
          return true;
        });
      };

      if (effectType === 'fireworks') {
        if (now - lastFireworkRef.current > burstIntervalMs / speedMul) {
          createFireworkBurst();
          lastFireworkRef.current = now;
        }
        updateAndDrawStreakParticles();
      }

      if (effectType === 'rocket-fireworks') {
        if (now - lastFireworkRef.current > (burstIntervalMs * 1.2) / speedMul && rocketsRef.current.length < 4) {
          createRocket();
          lastFireworkRef.current = now;
        }
        rocketsRef.current = rocketsRef.current.filter((r) => {
          r.x += r.vx;
          r.y += r.vy;
          r.vy += 0.02;
          r.trail.push({ x: r.x, y: r.y });
          if (r.trail.length > 10) r.trail.shift();
          if (r.trail.length > 1) {
            ctx.save();
            ctx.strokeStyle = r.color;
            ctx.lineWidth = Math.max(2, 3 * sizeMul);
            ctx.lineCap = 'round';
            ctx.globalAlpha = 0.9;
            ctx.beginPath();
            ctx.moveTo(Math.round(r.trail[0].x), Math.round(r.trail[0].y));
            for (let i = 1; i < r.trail.length; i++) {
              ctx.lineTo(Math.round(r.trail[i].x), Math.round(r.trail[i].y));
            }
            ctx.stroke();
            ctx.restore();
          }
          ctx.save();
          ctx.fillStyle = r.color;
          ctx.beginPath();
          ctx.arc(Math.round(r.x), Math.round(r.y), Math.max(3, 4 * sizeMul), 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          const exploded = r.vy > 0 ? (r.y >= r.targetY || r.vy < 0) : (r.y <= r.targetY || r.vy > 0);
          if (exploded) {
            createFireworkBurstAt(r.x, r.y, r.color);
            return false;
          }
          return true;
        });
        updateAndDrawStreakParticles();
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
        
        const fontSize = Math.max(14, 16 * sizeMul);
        ctx.font = `bold ${fontSize}px "Consolas", "Monaco", "Courier New", monospace`;
        ctx.textAlign = 'center';
        
        matrixCharsRef.current = matrixCharsRef.current.filter((m) => {
          m.y += m.speed;
          if (m.y > height + m.trailLength * fontSize) return false;
          for (let i = 0; i < m.trailLength; i++) {
            const trailY = Math.round(m.y - i * fontSize);
            if (trailY < -fontSize) continue;
            const alpha = Math.max(0, 1 - i / m.trailLength) * m.opacity * 0.65;
            ctx.fillStyle = i === 0 ? `rgba(200, 255, 200, ${m.opacity})` : `rgba(0, 255, 100, ${alpha})`;
            ctx.fillText(i === 0 ? m.char : MATRIX_CHARS[Math.floor((m.y * 0.1 + i) % MATRIX_CHARS.length)], Math.round(m.x), trailY);
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
          const tailLen = Math.min(s.length, 60);
          ctx.save();
          const gradient = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * tailLen, s.y - s.vy * tailLen);
          gradient.addColorStop(0, s.color);
          gradient.addColorStop(0.4, hexToRgba(s.color.startsWith('#') ? s.color : '#ffffff', 0.5));
          gradient.addColorStop(1, 'transparent');
          ctx.strokeStyle = gradient;
          ctx.lineWidth = Math.max(2, s.width);
          ctx.lineCap = 'round';
          ctx.globalAlpha = s.life;
          ctx.beginPath();
          ctx.moveTo(Math.round(s.x), Math.round(s.y));
          ctx.lineTo(Math.round(s.x - s.vx * tailLen * 0.5), Math.round(s.y - s.vy * tailLen * 0.5));
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

      // RAIN
      if (effectType === 'rain') {
        if (now - lastSpawn > 80 / speedMul && rainSpawnCount < 200) {
          spawnRain();
          lastSpawn = now;
          rainSpawnCount += 30;
        }
        rainRef.current = rainRef.current.filter((r) => {
          r.y += r.speed;
          r.x += Math.sin(now * 0.002 + r.swayOffset) * r.sway * 0.1;
          if (r.y > height + 30) return false;
          ctx.save();
          ctx.strokeStyle = `rgba(150, 200, 255, ${r.opacity})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(Math.round(r.x), Math.round(r.y));
          ctx.lineTo(Math.round(r.x), Math.round(r.y + r.len));
          ctx.stroke();
          ctx.restore();
          return true;
        });
        if (rainRef.current.length < 30) rainSpawnCount = Math.max(0, rainSpawnCount - 20);
      }

      // LEAVES
      if (effectType === 'leaves') {
        if (now - lastSpawn > 500 / speedMul && leavesSpawnCount < 120) {
          spawnLeaves();
          lastSpawn = now;
          leavesSpawnCount += baseCount;
        }
        leavesRef.current = leavesRef.current.filter((l) => {
          l.x += l.vx + Math.sin(now * 0.001 + l.swayO) * 0.5;
          l.y += l.vy;
          l.rotation += l.rotSpeed;
          if (l.y > height + 30) return false;
          ctx.save();
          ctx.globalAlpha = l.opacity;
          ctx.fillStyle = l.color;
          ctx.translate(Math.round(l.x), Math.round(l.y));
          ctx.rotate((l.rotation * Math.PI) / 180);
          ctx.beginPath();
          ctx.ellipse(0, 0, l.size, l.size * 0.6, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          return true;
        });
        if (leavesRef.current.length < 10) leavesSpawnCount = Math.max(0, leavesSpawnCount - 15);
      }

      // FIREFLIES
      if (effectType === 'fireflies') {
        if (now - lastSpawn > 600 / speedMul && firefliesSpawnCount < 80) {
          spawnFireflies();
          lastSpawn = now;
          firefliesSpawnCount += 20;
        }
        firefliesRef.current = firefliesRef.current.filter((f) => {
          f.x += f.vx;
          f.y += f.vy;
          f.blink += f.blinkSpeed;
          const glow = 0.4 + Math.sin(f.blink) * 0.5;
          ctx.save();
          ctx.fillStyle = f.color;
          ctx.globalAlpha = glow;
          ctx.beginPath();
          ctx.arc(Math.round(f.x), Math.round(f.y), f.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          return f.x >= -20 && f.x <= width + 20 && f.y >= -20 && f.y <= height + 20;
        });
        if (firefliesRef.current.length < 15) firefliesSpawnCount = Math.max(0, firefliesSpawnCount - 10);
      }

      // PETALS
      if (effectType === 'petals') {
        if (now - lastSpawn > 450 / speedMul && petalsSpawnCount < 100) {
          spawnPetals();
          lastSpawn = now;
          petalsSpawnCount += baseCount;
        }
        petalsRef.current = petalsRef.current.filter((p) => {
          p.x += p.vx + Math.sin(now * 0.001) * 0.3;
          p.y += p.vy;
          p.rotation += p.rotSpeed;
          if (p.y > height + 30) return false;
          ctx.save();
          ctx.globalAlpha = p.opacity;
          ctx.fillStyle = p.color;
          ctx.translate(Math.round(p.x), Math.round(p.y));
          ctx.rotate((p.rotation * Math.PI) / 180);
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size * 0.6, p.size, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          return true;
        });
        if (petalsRef.current.length < 8) petalsSpawnCount = Math.max(0, petalsSpawnCount - 12);
      }

      // AURORA
      if (effectType === 'aurora') {
        auroraPhaseRef.current += 0.005 * speedMul;
        const phase = auroraPhaseRef.current;
        for (let i = 0; i < 5; i++) {
          const gradient = ctx.createLinearGradient(0, 0, width, 0);
          const c1 = colors[i % colors.length] || '#0ea5e9';
          const c2 = colors[(i + 1) % colors.length] || '#8b5cf6';
          gradient.addColorStop(0, 'transparent');
          gradient.addColorStop(0.3, hexToRgba(c1, 0.15 + Math.sin(phase + i) * 0.1));
          gradient.addColorStop(0.5, hexToRgba(c2, 0.2 + Math.sin(phase + i * 1.2) * 0.1));
          gradient.addColorStop(0.7, hexToRgba(c1, 0.1 + Math.sin(phase + i * 0.8) * 0.08));
          gradient.addColorStop(1, 'transparent');
          ctx.fillStyle = gradient;
          ctx.fillRect(0, height * (0.1 + i * 0.2) + Math.sin(phase * 2 + i) * 30, width, height * 0.25);
        }
      }

      // COSMIC
      if (effectType === 'cosmic') {
        if (now - lastSpawn > 800 / speedMul && cosmicSpawnCount < 60) {
          spawnCosmic();
          lastSpawn = now;
          cosmicSpawnCount += 15;
        }
        cosmicRef.current = cosmicRef.current.filter((c) => {
          c.x += c.vx;
          c.y += c.vy;
          c.pulse += 0.03;
          const pulse = 0.5 + Math.sin(c.pulse) * 0.4;
          ctx.save();
          const grad = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.radius * 2);
          grad.addColorStop(0, hexToRgba(c.color, pulse * 0.8));
          grad.addColorStop(0.5, hexToRgba(c.color, pulse * 0.3));
          grad.addColorStop(1, 'transparent');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(Math.round(c.x), Math.round(c.y), c.radius * 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          return c.x >= -50 && c.x <= width + 50 && c.y >= -50 && c.y <= height + 50;
        });
        if (cosmicRef.current.length < 10) cosmicSpawnCount = Math.max(0, cosmicSpawnCount - 8);
      }

      // DANDELION
      if (effectType === 'dandelion') {
        if (now - lastSpawn > 400 / speedMul && dandelionSpawnCount < 80) {
          spawnDandelion();
          lastSpawn = now;
          dandelionSpawnCount += baseCount;
        }
        dandelionRef.current = dandelionRef.current.filter((d) => {
          d.x += d.vx + Math.sin(now * 0.002 + d.rot) * 0.2;
          d.y += d.vy;
          d.rot += 0.02;
          if (d.y < -20) return false;
          ctx.save();
          ctx.globalAlpha = d.opacity * (0.6 + Math.sin(d.rot) * 0.2);
          ctx.fillStyle = 'rgba(255, 255, 220, 0.9)';
          ctx.beginPath();
          ctx.arc(Math.round(d.x), Math.round(d.y), d.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          return true;
        });
        if (dandelionRef.current.length < 8) dandelionSpawnCount = Math.max(0, dandelionSpawnCount - 12);
      }

      // BUTTERFLIES
      if (effectType === 'butterflies') {
        if (now - lastSpawn > 700 / speedMul && butterfliesSpawnCount < 50) {
          spawnButterflies();
          lastSpawn = now;
          butterfliesSpawnCount += 12;
        }
        butterfliesRef.current = butterfliesRef.current.filter((b) => {
          b.x += b.vx;
          b.y += b.vy + Math.sin(b.wingPhase) * 0.5;
          b.wingPhase += 0.2;
          if (b.x < -50 || b.x > width + 50 || b.y < -50 || b.y > height + 50) return false;
          ctx.save();
          ctx.fillStyle = b.color;
          ctx.translate(Math.round(b.x), Math.round(b.y));
          const wing = Math.sin(b.wingPhase) * 0.4 + 0.6;
          ctx.beginPath();
          ctx.ellipse(-b.size * wing, 0, b.size * 0.4, b.size * 0.6, 0, 0, Math.PI * 2);
          ctx.ellipse(b.size * wing, 0, b.size * 0.4, b.size * 0.6, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          return true;
        });
        if (butterfliesRef.current.length < 5) butterfliesSpawnCount = Math.max(0, butterfliesSpawnCount - 6);
      }

      // METEORS
      if (effectType === 'meteors') {
        if (now - lastFireworkRef.current > 1500 / speedMul && meteorsRef.current.length < 2) {
          spawnMeteor();
          lastFireworkRef.current = now;
        }
        meteorsRef.current = meteorsRef.current.filter((s) => {
          s.x += s.vx;
          s.y += s.vy;
          s.life -= 0.008 * speedMul;
          if (s.life <= 0 || s.x > width + 100 || s.y > height) return false;
          const tailLen = Math.min(s.length, 80);
          ctx.save();
          const gradient = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * tailLen, s.y - s.vy * tailLen);
          gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
          gradient.addColorStop(0.3, 'rgba(200,220,255,0.5)');
          gradient.addColorStop(1, 'transparent');
          ctx.strokeStyle = gradient;
          ctx.lineWidth = s.width;
          ctx.lineCap = 'round';
          ctx.globalAlpha = s.life;
          ctx.beginPath();
          ctx.moveTo(Math.round(s.x), Math.round(s.y));
          ctx.lineTo(Math.round(s.x - s.vx * tailLen * 0.5), Math.round(s.y - s.vy * tailLen * 0.5));
          ctx.stroke();
          ctx.restore();
          return true;
        });
      }

      // LIGHTNING
      if (effectType === 'lightning') {
        if (now - lightningRef.current > 3000 / speedMul && Math.random() < 0.008) {
          lightningRef.current = now;
          ctx.save();
          ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.fillRect(0, 0, width, height);
          ctx.restore();
        }
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
    if (effectType === 'fireworks') {
      createFireworkBurst();
      createFireworkBurst();
      createFireworkBurst();
      lastFireworkRef.current = initialNow;
    }
    if (effectType === 'rocket-fireworks') {
      createRocket();
      createRocket();
      lastFireworkRef.current = initialNow;
    }
    if (effectType === 'rain') {
      spawnRain();
      lastSpawn = initialNow;
    }
    if (effectType === 'leaves') {
      spawnLeaves();
      lastSpawn = initialNow;
    }
    if (effectType === 'fireflies') {
      spawnFireflies();
      lastSpawn = initialNow;
    }
    if (effectType === 'petals') {
      spawnPetals();
      lastSpawn = initialNow;
    }
    if (effectType === 'cosmic') {
      spawnCosmic();
      lastSpawn = initialNow;
    }
    if (effectType === 'dandelion') {
      spawnDandelion();
      lastSpawn = initialNow;
    }
    if (effectType === 'butterflies') {
      spawnButterflies();
      lastSpawn = initialNow;
    }

    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [enabled, effectType, intensity, particleSizeScale, speedMul, colors, opacityMul, burstIntervalMs, resizeCanvas]);

  if (!enabled || effectType === 'none') return null;

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 w-full h-full pointer-events-none ${showOnForeground ? 'z-[9999]' : 'z-0'}`}
      style={{
        minWidth: 0,
        minHeight: 0,
        display: 'block',
      }}
      aria-hidden
    />
  );
};
