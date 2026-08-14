import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isEscapeDialogOpen } from '../hooks/useEscapeToClose';
import { useMobile } from '../hooks/useMobile';

interface SnakeGameWidgetProps {
    onClose?: () => void;
}

type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
type Position = { x: number; y: number };
type FoodType = 'apple' | 'golden' | 'slow' | 'speed' | 'ghost' | 'shrink';
type PowerType = 'slow' | 'speed' | 'ghost';
type DifficultyId = 'easy' | 'normal' | 'hard' | 'insane';
type ArenaId = 'small' | 'medium' | 'large';
type WallMode = 'solid' | 'wrap';
type ThemeId = 'neon' | 'forest' | 'sunset' | 'ice' | 'contrast';
type Screen = 'menu' | 'playing' | 'paused' | 'over';

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    max: number;
    size: number;
    color: string;
    g: number;
}

interface Floater {
    x: number;
    y: number;
    text: string;
    life: number;
    color: string;
}

interface Theme {
    id: ThemeId;
    name: string;
    bg0: string;
    bg1: string;
    grid: string;
    border: string;
    snakeHead: string;
    snakeTail: string;
    snakeGlow: string;
    obstacle: string;
    text: string;
    contrast: boolean;
}

const CANVAS_SIZE = 480;
const STORAGE_KEY = 'linknest_snake_arcade_v1';

const DIR_VEC: Record<Direction, Position> = {
    UP: { x: 0, y: -1 },
    DOWN: { x: 0, y: 1 },
    LEFT: { x: -1, y: 0 },
    RIGHT: { x: 1, y: 0 },
};

const OPPOSITE: Record<Direction, Direction> = {
    UP: 'DOWN',
    DOWN: 'UP',
    LEFT: 'RIGHT',
    RIGHT: 'LEFT',
};

const DIFFICULTY: Record<DifficultyId, { label: string; tick: number; lives: number; obstacleLevel: number }> = {
    easy: { label: 'Easy', tick: 145, lives: 3, obstacleLevel: 99 },
    normal: { label: 'Normal', tick: 105, lives: 2, obstacleLevel: 4 },
    hard: { label: 'Hard', tick: 78, lives: 1, obstacleLevel: 2 },
    insane: { label: 'Insane', tick: 52, lives: 1, obstacleLevel: 1 },
};

const ARENA: Record<ArenaId, number> = {
    small: 14,
    medium: 18,
    large: 22,
};

const THEMES: Record<ThemeId, Theme> = {
    neon: {
        id: 'neon', name: 'Neon', bg0: '#070b14', bg1: '#0d1b2a', grid: '#1b3a4b',
        border: '#22d3ee', snakeHead: '#5efce8', snakeTail: '#0ea5e9', snakeGlow: '#22d3ee',
        obstacle: '#334155', text: '#e2e8f0', contrast: false,
    },
    forest: {
        id: 'forest', name: 'Forest', bg0: '#07140c', bg1: '#10261a', grid: '#1d3f2a',
        border: '#4ade80', snakeHead: '#86efac', snakeTail: '#15803d', snakeGlow: '#4ade80',
        obstacle: '#1f3d2b', text: '#dcfce7', contrast: false,
    },
    sunset: {
        id: 'sunset', name: 'Sunset', bg0: '#14080e', bg1: '#2a1018', grid: '#4a2030',
        border: '#fb7185', snakeHead: '#fdba74', snakeTail: '#e11d48', snakeGlow: '#fb7185',
        obstacle: '#3f1d2b', text: '#ffe4e6', contrast: false,
    },
    ice: {
        id: 'ice', name: 'Ice', bg0: '#061018', bg1: '#0b1c2c', grid: '#1e4976',
        border: '#7dd3fc', snakeHead: '#e0f2fe', snakeTail: '#0284c7', snakeGlow: '#38bdf8',
        obstacle: '#16324a', text: '#e0f2fe', contrast: false,
    },
    contrast: {
        id: 'contrast', name: 'Contrast', bg0: '#000000', bg1: '#111111', grid: '#333333',
        border: '#ffffff', snakeHead: '#00ff00', snakeTail: '#009900', snakeGlow: '#00ff00',
        obstacle: '#666666', text: '#ffffff', contrast: true,
    },
};

const FOOD_META: Record<FoodType, { color: string; points: number; label: string; growth: number }> = {
    apple: { color: '#ff3b5c', points: 10, label: 'Apple', growth: 1 },
    golden: { color: '#ffd166', points: 50, label: 'Golden', growth: 3 },
    slow: { color: '#4cc9f0', points: 15, label: 'Chill', growth: 1 },
    speed: { color: '#ff9f1c', points: 15, label: 'Boost', growth: 1 },
    ghost: { color: '#c77dff', points: 20, label: 'Ghost', growth: 1 },
    shrink: { color: '#80ed99', points: 25, label: 'Mint', growth: 0 },
};

const FOOD_TYPES: FoodType[] = ['apple', 'golden', 'slow', 'speed', 'ghost', 'shrink'];

interface PersistState {
    difficulty: DifficultyId;
    arena: ArenaId;
    walls: WallMode;
    theme: ThemeId;
    sound: boolean;
    best: Record<DifficultyId, number>;
}

const DEFAULT_PERSIST: PersistState = {
    difficulty: 'normal',
    arena: 'medium',
    walls: 'solid',
    theme: 'neon',
    sound: true,
    best: { easy: 0, normal: 0, hard: 0, insane: 0 },
};

function loadPersist(): PersistState {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...DEFAULT_PERSIST, best: { ...DEFAULT_PERSIST.best } };
        const parsed = JSON.parse(raw) as Partial<PersistState>;
        return {
            difficulty: parsed.difficulty && DIFFICULTY[parsed.difficulty] ? parsed.difficulty : 'normal',
            arena: parsed.arena && ARENA[parsed.arena] ? parsed.arena : 'medium',
            walls: parsed.walls === 'wrap' ? 'wrap' : 'solid',
            theme: parsed.theme && THEMES[parsed.theme] ? parsed.theme : 'neon',
            sound: parsed.sound !== false,
            best: {
                easy: Number(parsed.best?.easy) || 0,
                normal: Number(parsed.best?.normal) || 0,
                hard: Number(parsed.best?.hard) || 0,
                insane: Number(parsed.best?.insane) || 0,
            },
        };
    } catch {
        return { ...DEFAULT_PERSIST, best: { ...DEFAULT_PERSIST.best } };
    }
}

function savePersist(state: PersistState) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
        /* ignore quota / private mode */
    }
}

function clamp(n: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, n));
}

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function withAlpha(hex: string, a: number): string {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function mixHex(a: string, b: string, t: number): string {
    const [ar, ag, ab] = hexToRgb(a);
    const [br, bg, bb] = hexToRgb(b);
    const r = Math.round(lerp(ar, br, t));
    const g = Math.round(lerp(ag, bg, t));
    const bl = Math.round(lerp(ab, bb, t));
    return `rgb(${r}, ${g}, ${bl})`;
}

function samePos(a: Position, b: Position): boolean {
    return a.x === b.x && a.y === b.y;
}

function occupies(list: Position[], pos: Position): boolean {
    return list.some((p) => samePos(p, pos));
}

let audioCtx: AudioContext | null = null;

function getAudio(): AudioContext | null {
    const AC = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    return audioCtx;
}

function playTone(freq: number, duration: number, type: OscillatorType = 'square', volume = 0.07, slideTo?: number) {
    const ctx = getAudio();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo != null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), ctx.currentTime + duration);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
}

const Sfx = {
    enabled: true,
    eat() {
        if (!this.enabled) return;
        playTone(420, 0.07, 'square', 0.06);
        playTone(640, 0.09, 'square', 0.04);
    },
    special() {
        if (!this.enabled) return;
        playTone(520, 0.08, 'triangle', 0.07);
        playTone(780, 0.12, 'triangle', 0.05);
        playTone(1040, 0.14, 'sine', 0.04);
    },
    die() {
        if (!this.enabled) return;
        playTone(280, 0.28, 'sawtooth', 0.08, 70);
    },
    level() {
        if (!this.enabled) return;
        playTone(660, 0.08, 'square', 0.05);
        setTimeout(() => playTone(880, 0.1, 'square', 0.05), 80);
    },
    pause() {
        if (!this.enabled) return;
        playTone(240, 0.06, 'sine', 0.04);
    },
    win() {
        if (!this.enabled) return;
        [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => playTone(f, 0.14, 'triangle', 0.06), i * 90));
    },
};

function pickFoodType(level: number): FoodType {
    const bonus = Math.min(0.12, level * 0.015);
    const r = Math.random();
    if (r < 0.62 - bonus) return 'apple';
    if (r < 0.72) return 'golden';
    if (r < 0.80) return 'slow';
    if (r < 0.88) return 'speed';
    if (r < 0.95) return 'ghost';
    return 'shrink';
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
}

export const SnakeGameWidget: React.FC<SnakeGameWidgetProps> = ({ onClose }) => {
    const isMobile = useMobile();
    const widgetRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const swipeRef = useRef<{ x: number; y: number } | null>(null);

    const initial = useMemo(() => loadPersist(), []);
    const [screen, setScreen] = useState<Screen>('menu');
    const [difficulty, setDifficulty] = useState<DifficultyId>(initial.difficulty);
    const [arena, setArena] = useState<ArenaId>(initial.arena);
    const [walls, setWalls] = useState<WallMode>(initial.walls);
    const [themeId, setThemeId] = useState<ThemeId>(initial.theme);
    const [sound, setSound] = useState(initial.sound);
    const [best, setBest] = useState<Record<DifficultyId, number>>(initial.best);
    const [score, setScore] = useState(0);
    const [level, setLevel] = useState(1);
    const [combo, setCombo] = useState(0);
    const [lives, setLives] = useState(DIFFICULTY[initial.difficulty].lives);
    const [newRecord, setNewRecord] = useState(false);
    const [won, setWon] = useState(false);
    const screenRef = useRef<Screen>('menu');
    const scoreRef = useRef(0);
    const persistRef = useRef<PersistState>(initial);
    const shakeRef = useRef(0);
    const particlesRef = useRef<Particle[]>([]);
    const floatersRef = useRef<Floater[]>([]);

    const gameRef = useRef({
        snake: [{ x: 9, y: 9 }] as Position[],
        prevSnake: [{ x: 9, y: 9 }] as Position[],
        dir: 'RIGHT' as Direction,
        queue: [] as Direction[],
        food: { x: 4, y: 4, type: 'apple' as FoodType },
        obstacles: [] as Position[],
        combo: 0,
        comboTimer: 0,
        level: 1,
        eaten: 0,
        lives: 2,
        growth: 0,
        power: null as { type: PowerType; left: number } | null,
        invuln: 0,
        lastTick: 0,
        won: false,
        dead: false,
    });

    const gridSize = ARENA[arena];
    const theme = THEMES[themeId];
    const diff = DIFFICULTY[difficulty];

    persistRef.current = { difficulty, arena, walls, theme: themeId, sound, best };
    Sfx.enabled = sound;

    useEffect(() => {
        savePersist(persistRef.current);
    }, [difficulty, arena, walls, themeId, sound, best]);

    const burst = useCallback((x: number, y: number, color: string, count: number, speed = 2.4) => {
        const cell = CANVAS_SIZE / ARENA[persistRef.current.arena];
        const px = x * cell + cell / 2;
        const py = y * cell + cell / 2;
        for (let i = 0; i < count; i++) {
            const ang = (Math.PI * 2 * i) / count + Math.random() * 0.4;
            const spd = speed * (0.4 + Math.random());
            particlesRef.current.push({
                x: px,
                y: py,
                vx: Math.cos(ang) * spd,
                vy: Math.sin(ang) * spd,
                life: 28 + Math.random() * 18,
                max: 46,
                size: 1.6 + Math.random() * 2.4,
                color,
                g: 0.04,
            });
        }
        if (particlesRef.current.length > 120) {
            particlesRef.current.splice(0, particlesRef.current.length - 120);
        }
    }, []);

    const addFloater = useCallback((x: number, y: number, text: string, color: string) => {
        const cell = CANVAS_SIZE / ARENA[persistRef.current.arena];
        floatersRef.current.push({
            x: x * cell + cell / 2,
            y: y * cell + cell / 2,
            text,
            life: 50,
            color,
        });
    }, []);

    const randomEmpty = useCallback((snake: Position[], obstacles: Position[], extra?: Position): Position => {
        const g = ARENA[persistRef.current.arena];
        for (let i = 0; i < 500; i++) {
            const p = { x: Math.floor(Math.random() * g), y: Math.floor(Math.random() * g) };
            if (occupies(snake, p) || occupies(obstacles, p) || (extra && samePos(p, extra))) continue;
            return p;
        }
        return { x: 0, y: 0 };
    }, []);

    const spawnFood = useCallback((snake: Position[], obstacles: Position[], levelNum: number) => {
        const pos = randomEmpty(snake, obstacles);
        return { ...pos, type: pickFoodType(levelNum) };
    }, [randomEmpty]);

    const initGame = useCallback(() => {
        const g = ARENA[persistRef.current.arena];
        const mid = Math.floor(g / 2);
        const snake: Position[] = [
            { x: mid, y: mid },
            { x: mid - 1, y: mid },
            { x: mid - 2, y: mid },
        ];
        const food = spawnFood(snake, [], 1);
        gameRef.current = {
            snake,
            prevSnake: snake.map((s) => ({ ...s })),
            dir: 'RIGHT',
            queue: [],
            food,
            obstacles: [],
            combo: 0,
            comboTimer: 0,
            level: 1,
            eaten: 0,
            lives: DIFFICULTY[persistRef.current.difficulty].lives,
            growth: 0,
            power: null,
            invuln: 0,
            lastTick: performance.now(),
            won: false,
            dead: false,
        };
        particlesRef.current = [];
        floatersRef.current = [];
        shakeRef.current = 0;
        scoreRef.current = 0;
        setScore(0);
        setLevel(1);
        setCombo(0);
        setLives(DIFFICULTY[persistRef.current.difficulty].lives);
        setNewRecord(false);
        setWon(false);
    }, [spawnFood]);

    const queueDir = useCallback((next: Direction) => {
        if (screenRef.current !== 'playing') return;
        const g = gameRef.current;
        const last = g.queue.length ? g.queue[g.queue.length - 1] : g.dir;
        if (next === last || next === OPPOSITE[last]) return;
        if (g.queue.length < 2) g.queue.push(next);
    }, []);

    const finishGame = useCallback((didWin: boolean) => {
        const g = gameRef.current;
        g.dead = !didWin;
        g.won = didWin;
        screenRef.current = 'over';
        setScreen('over');
        setWon(didWin);
        const diffId = persistRef.current.difficulty;
        const currentBest = persistRef.current.best[diffId] || 0;
        if (scoreRef.current > currentBest) {
            const nextBest = { ...persistRef.current.best, [diffId]: scoreRef.current };
            setBest(nextBest);
            setNewRecord(true);
        } else {
            setNewRecord(false);
        }
        if (didWin) Sfx.win();
        else Sfx.die();
        if (navigator.vibrate) navigator.vibrate(didWin ? [20, 40, 20] : [50, 40, 80]);
    }, []);

    const loseLifeOrDie = useCallback((head: Position) => {
        const g = gameRef.current;
        const cellColor = THEMES[persistRef.current.theme].snakeHead;
        burst(head.x, head.y, cellColor, 22, 3.2);
        shakeRef.current = 8;
        if (g.lives > 1) {
            g.lives -= 1;
            setLives(g.lives);
            const grid = ARENA[persistRef.current.arena];
            const mid = Math.floor(grid / 2);
            g.snake = [
                { x: mid, y: mid },
                { x: mid - 1, y: mid },
                { x: mid - 2, y: mid },
            ];
            g.prevSnake = g.snake.map((s) => ({ ...s }));
            g.dir = 'RIGHT';
            g.queue = [];
            g.invuln = 18;
            g.power = null;
            Sfx.die();
            if (navigator.vibrate) navigator.vibrate(30);
            return;
        }
        finishGame(false);
    }, [burst, finishGame]);

    const tick = useCallback(() => {
        const g = gameRef.current;
        if (g.dead || g.won) return;
        const cfg = persistRef.current;
        const grid = ARENA[cfg.arena];
        const wallMode = cfg.walls;
        const ghost = g.power?.type === 'ghost';

        if (g.queue.length) g.dir = g.queue.shift() as Direction;
        const vec = DIR_VEC[g.dir];
        const head = { x: g.snake[0].x + vec.x, y: g.snake[0].y + vec.y };

        if (head.x < 0 || head.x >= grid || head.y < 0 || head.y >= grid) {
            if (wallMode === 'wrap' || ghost) {
                head.x = (head.x + grid) % grid;
                head.y = (head.y + grid) % grid;
            } else {
                loseLifeOrDie(g.snake[0]);
                return;
            }
        }

        const hitSelf = g.snake.some((seg, i) => i > 0 && samePos(seg, head));
        const hitObs = occupies(g.obstacles, head);
        if ((hitSelf || hitObs) && !ghost && g.invuln <= 0) {
            loseLifeOrDie(head);
            return;
        }

        g.prevSnake = g.snake.map((s) => ({ ...s }));
        const nextSnake = [head, ...g.snake];
        const eating = samePos(head, g.food);

        if (eating) {
            const meta = FOOD_META[g.food.type];
            g.eaten += 1;
            if (g.comboTimer > 0) g.combo += 1;
            else g.combo = 1;
            g.comboTimer = 14;
            const multiplier = Math.min(4, 1 + (g.combo - 1) * 0.5);
            const gained = Math.round(meta.points * multiplier);
            scoreRef.current += gained;
            setScore(scoreRef.current);
            setCombo(g.combo);

            if (g.food.type === 'shrink') {
                nextSnake.pop();
                const shrinkBy = Math.min(3, nextSnake.length - 1);
                if (shrinkBy > 0) nextSnake.splice(nextSnake.length - shrinkBy, shrinkBy);
            } else {
                g.growth += Math.max(0, meta.growth - 1);
            }

            if (g.food.type === 'slow') g.power = { type: 'slow', left: 42 };
            if (g.food.type === 'speed') g.power = { type: 'speed', left: 32 };
            if (g.food.type === 'ghost') g.power = { type: 'ghost', left: 28 };

            const nextLevel = 1 + Math.floor(g.eaten / 5);
            if (nextLevel > g.level) {
                g.level = nextLevel;
                setLevel(g.level);
                Sfx.level();
                addFloater(head.x, head.y - 0.4, `LEVEL ${g.level}`, '#fde68a');
                const d = DIFFICULTY[cfg.difficulty];
                if (g.level >= d.obstacleLevel) {
                    const extra = 1 + (cfg.difficulty === 'insane' ? 1 : 0);
                    for (let i = 0; i < extra; i++) {
                        const p = randomEmpty(nextSnake, g.obstacles, g.food);
                        if (!occupies(nextSnake, p)) g.obstacles.push(p);
                    }
                }
            }

            burst(g.food.x, g.food.y, meta.color, g.food.type === 'golden' ? 20 : 12, g.food.type === 'golden' ? 3.4 : 2.2);
            addFloater(head.x, head.y, `+${gained}${g.combo > 1 ? ` x${multiplier.toFixed(1)}` : ''}`, meta.color);
            shakeRef.current = g.food.type === 'golden' ? 5 : 2;
            if (g.food.type === 'apple') Sfx.eat();
            else Sfx.special();
            if (navigator.vibrate) navigator.vibrate(12);

            const maxCells = grid * grid - g.obstacles.length;
            if (nextSnake.length >= maxCells) {
                g.snake = nextSnake;
                scoreRef.current += 250;
                setScore(scoreRef.current);
                finishGame(true);
                return;
            }

            g.food = spawnFood(nextSnake, g.obstacles, g.level);
        } else if (g.growth > 0) {
            g.growth -= 1;
        } else {
            nextSnake.pop();
        }

        if (!eating && g.comboTimer > 0) {
            g.comboTimer -= 1;
            if (g.comboTimer === 0) {
                g.combo = 0;
                setCombo(0);
            }
        }

        if (g.power) {
            g.power.left -= 1;
            if (g.power.left <= 0) g.power = null;
        }
        if (g.invuln > 0) g.invuln -= 1;

        g.snake = nextSnake;
    }, [addFloater, burst, finishGame, loseLifeOrDie, randomEmpty, spawnFood]);

    const currentTickMs = useCallback((): number => {
        const g = gameRef.current;
        const base = DIFFICULTY[persistRef.current.difficulty].tick * Math.pow(0.94, Math.max(0, g.level - 1));
        let ms = base;
        if (g.power?.type === 'speed') ms *= 0.55;
        if (g.power?.type === 'slow') ms *= 1.65;
        return clamp(ms, 38, 220);
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const fit = () => {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = CANVAS_SIZE * dpr;
            canvas.height = CANVAS_SIZE * dpr;
            canvas.style.width = `${CANVAS_SIZE}px`;
            canvas.style.height = `${CANVAS_SIZE}px`;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        fit();

        let raf = 0;
        let alive = true;

        const drawFoodIcon = (cx: number, cy: number, r: number, type: FoodType, pulse: number) => {
            const color = FOOD_META[type].color;
            const th = THEMES[persistRef.current.theme];
            if (!th.contrast) {
                ctx.beginPath();
                ctx.arc(cx, cy, r * 2.1 * pulse, 0, Math.PI * 2);
                ctx.fillStyle = withAlpha(color, 0.18);
                ctx.fill();
            }
            const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
            grad.addColorStop(0, mixHex('#ffffff', color, 0.25));
            grad.addColorStop(1, color);
            ctx.beginPath();
            ctx.arc(cx, cy, r * pulse, 0, Math.PI * 2);
            ctx.fillStyle = th.contrast ? color : grad;
            ctx.fill();
            ctx.beginPath();
            ctx.arc(cx - r * 0.28, cy - r * 0.28, r * 0.22, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.55)';
            ctx.fill();
            if (type === 'golden') {
                ctx.fillStyle = '#fff7cc';
                ctx.beginPath();
                for (let i = 0; i < 5; i++) {
                    const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
                    const inner = a + Math.PI / 5;
                    ctx.lineTo(cx + Math.cos(a) * r * 0.45, cy + Math.sin(a) * r * 0.45);
                    ctx.lineTo(cx + Math.cos(inner) * r * 0.18, cy + Math.sin(inner) * r * 0.18);
                }
                ctx.closePath();
                ctx.fill();
            }
        };

        const drawSnake = (
            snake: Position[],
            prev: Position[],
            t: number,
            cell: number,
            dir: Direction,
            now: number,
            ghost: boolean,
            blink: boolean,
        ) => {
            const th = THEMES[persistRef.current.theme];
            const grid = ARENA[persistRef.current.arena];
            if (blink && Math.floor(now / 80) % 2 === 0) return;

            const posAt = (i: number): Position => {
                const to = snake[i];
                const from = prev[i] ?? prev[prev.length - 1] ?? to;
                const dx = Math.abs(from.x - to.x);
                const dy = Math.abs(from.y - to.y);
                if (dx > grid / 2 || dy > grid / 2) return to;
                return { x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t) };
            };

            ctx.save();
            ctx.globalAlpha = ghost ? 0.55 : 1;
            for (let i = snake.length - 1; i >= 0; i--) {
                const p = posAt(i);
                const k = snake.length === 1 ? 1 : 1 - i / (snake.length - 1);
                const radius = cell * lerp(0.30, 0.46, k);
                const cx = p.x * cell + cell / 2;
                const cy = p.y * cell + cell / 2;
                const col = mixHex(th.snakeTail, th.snakeHead, k);
                if (!th.contrast) {
                    ctx.beginPath();
                    ctx.arc(cx, cy, radius * 1.55, 0, Math.PI * 2);
                    ctx.fillStyle = withAlpha(th.snakeGlow, 0.12 + k * 0.12);
                    ctx.fill();
                }
                ctx.beginPath();
                ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                ctx.fillStyle = col;
                ctx.fill();
                ctx.beginPath();
                ctx.arc(cx - radius * 0.28, cy - radius * 0.28, radius * 0.32, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255,255,255,0.28)';
                ctx.fill();
            }

            const head = posAt(0);
            const hx = head.x * cell + cell / 2;
            const hy = head.y * cell + cell / 2;
            const vec = DIR_VEC[dir];
            const perp = { x: -vec.y, y: vec.x };
            const eyeOff = cell * 0.16;
            const eyeR = Math.max(2.2, cell * 0.09);
            const drawEye = (side: number) => {
                const ex = hx + perp.x * eyeOff * side + vec.x * cell * 0.08;
                const ey = hy + perp.y * eyeOff * side + vec.y * cell * 0.08;
                ctx.beginPath();
                ctx.arc(ex, ey, eyeR, 0, Math.PI * 2);
                ctx.fillStyle = '#f8fafc';
                ctx.fill();
                ctx.beginPath();
                ctx.arc(ex + vec.x * eyeR * 0.35, ey + vec.y * eyeR * 0.35, eyeR * 0.45, 0, Math.PI * 2);
                ctx.fillStyle = '#0f172a';
                ctx.fill();
            };
            drawEye(-1);
            drawEye(1);

            if (Math.sin(now / 90) > 0.15) {
                ctx.strokeStyle = '#fb7185';
                ctx.lineWidth = Math.max(1.5, cell * 0.06);
                ctx.lineCap = 'round';
                ctx.beginPath();
                const tx = hx + vec.x * cell * 0.42;
                const ty = hy + vec.y * cell * 0.42;
                ctx.moveTo(hx + vec.x * cell * 0.28, hy + vec.y * cell * 0.28);
                ctx.lineTo(tx, ty);
                ctx.lineTo(tx + perp.x * cell * 0.08 - vec.x * cell * 0.04, ty + perp.y * cell * 0.08 - vec.y * cell * 0.04);
                ctx.moveTo(tx, ty);
                ctx.lineTo(tx - perp.x * cell * 0.08 - vec.x * cell * 0.04, ty - perp.y * cell * 0.08 - vec.y * cell * 0.04);
                ctx.stroke();
            }
            ctx.restore();
        };

        const drawDemo = (now: number, cell: number, grid: number) => {
            const n = 16;
            const segs: Position[] = [];
            for (let i = 0; i < n; i++) {
                const a = now / 900 - i * 0.22;
                segs.push({
                    x: (grid - 1) * (0.5 + 0.32 * Math.sin(a)),
                    y: (grid - 1) * (0.5 + 0.28 * Math.sin(a * 1.35 + 0.6)),
                });
            }
            drawSnake(segs, segs, 1, cell, 'RIGHT', now, false, false);
            const foods: FoodType[] = ['apple', 'golden', 'ghost'];
            foods.forEach((type, i) => {
                const a = now / 1400 + i * 2.1;
                const fx = 2 + ((Math.sin(a) + 1) / 2) * (grid - 5);
                const fy = 2 + i * ((grid - 4) / 3);
                drawFoodIcon(fx * cell + cell / 2, fy * cell + cell / 2, cell * 0.28, type, 0.92 + 0.08 * Math.sin(now / 200 + i));
            });
        };

        const loop = (now: number) => {
            if (!alive) return;
            const cfg = persistRef.current;
            const th = THEMES[cfg.theme];
            const grid = ARENA[cfg.arena];
            const cell = CANVAS_SIZE / grid;
            const g = gameRef.current;
            const currentScreen = screenRef.current;

            if (currentScreen === 'playing') {
                const step = currentTickMs();
                if (now - g.lastTick >= step) {
                    const catchup = Math.min(3, Math.floor((now - g.lastTick) / step));
                    for (let i = 0; i < Math.max(1, catchup); i++) tick();
                    g.lastTick = now;
                }
            }

            particlesRef.current = particlesRef.current.filter((p) => {
                p.x += p.vx;
                p.y += p.vy;
                p.vy += p.g;
                p.vx *= 0.97;
                p.life -= 1;
                return p.life > 0;
            });
            floatersRef.current = floatersRef.current.filter((f) => {
                f.y -= 0.45;
                f.life -= 1;
                return f.life > 0;
            });
            if (shakeRef.current > 0) shakeRef.current *= 0.86;
            if (shakeRef.current < 0.2) shakeRef.current = 0;

            ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
            ctx.save();
            if (shakeRef.current > 0 && currentScreen === 'playing') {
                ctx.translate((Math.random() - 0.5) * shakeRef.current, (Math.random() - 0.5) * shakeRef.current);
            }

            const bg = ctx.createLinearGradient(0, 0, CANVAS_SIZE, CANVAS_SIZE);
            bg.addColorStop(0, th.bg0);
            bg.addColorStop(1, th.bg1);
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

            ctx.strokeStyle = withAlpha(th.grid, th.contrast ? 0.55 : 0.35);
            ctx.lineWidth = th.contrast ? 1 : 0.8;
            for (let i = 0; i <= grid; i++) {
                ctx.beginPath();
                ctx.moveTo(i * cell, 0);
                ctx.lineTo(i * cell, CANVAS_SIZE);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(0, i * cell);
                ctx.lineTo(CANVAS_SIZE, i * cell);
                ctx.stroke();
            }

            const vignette = ctx.createRadialGradient(
                CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE * 0.2,
                CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE * 0.72,
            );
            vignette.addColorStop(0, 'rgba(0,0,0,0)');
            vignette.addColorStop(1, 'rgba(0,0,0,0.45)');
            ctx.fillStyle = vignette;
            ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

            ctx.strokeStyle = withAlpha(th.border, 0.55);
            ctx.lineWidth = 3;
            roundRect(ctx, 1.5, 1.5, CANVAS_SIZE - 3, CANVAS_SIZE - 3, 10);
            ctx.stroke();

            if (currentScreen === 'menu') {
                drawDemo(now, cell, grid);
            } else {
                g.obstacles.forEach((o) => {
                    const pad = cell * 0.12;
                    roundRect(ctx, o.x * cell + pad, o.y * cell + pad, cell - pad * 2, cell - pad * 2, 4);
                    ctx.fillStyle = th.obstacle;
                    ctx.fill();
                    ctx.strokeStyle = withAlpha(th.border, 0.45);
                    ctx.lineWidth = 1.4;
                    ctx.stroke();
                });

                const pulse = 0.88 + 0.12 * Math.sin(now / 180);
                drawFoodIcon(
                    g.food.x * cell + cell / 2,
                    g.food.y * cell + cell / 2,
                    cell * 0.32,
                    g.food.type,
                    pulse,
                );

                const interp = currentScreen === 'playing'
                    ? clamp((now - g.lastTick) / currentTickMs(), 0, 1)
                    : 1;
                const blink = g.invuln > 0;
                drawSnake(g.snake, g.prevSnake, interp, cell, g.dir, now, g.power?.type === 'ghost', blink);
            }

            particlesRef.current.forEach((p) => {
                ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.globalAlpha = 1;

            floatersRef.current.forEach((f) => {
                ctx.globalAlpha = clamp(f.life / 50, 0, 1);
                ctx.fillStyle = f.color;
                ctx.font = 'bold 14px ui-sans-serif, system-ui, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(f.text, f.x, f.y);
            });
            ctx.globalAlpha = 1;

            if (currentScreen === 'playing' || currentScreen === 'paused') {
                ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
                ctx.textAlign = 'left';
                ctx.fillStyle = withAlpha(th.text, 0.9);
                ctx.fillText(`Lv ${g.level}`, 12, 20);
                if (g.combo > 1) {
                    ctx.fillStyle = '#fbbf24';
                    ctx.fillText(`COMBO x${Math.min(4, 1 + (g.combo - 1) * 0.5).toFixed(1)}`, 12, 36);
                }
                if (g.power) {
                    const metaColor = FOOD_META[g.power.type].color;
                    const w = 110 * (g.power.left / (g.power.type === 'slow' ? 42 : g.power.type === 'speed' ? 32 : 28));
                    ctx.fillStyle = 'rgba(0,0,0,0.45)';
                    roundRect(ctx, CANVAS_SIZE - 128, 8, 116, 16, 8);
                    ctx.fill();
                    ctx.fillStyle = metaColor;
                    roundRect(ctx, CANVAS_SIZE - 126, 10, Math.max(4, w), 12, 6);
                    ctx.fill();
                    ctx.fillStyle = '#0f172a';
                    ctx.font = 'bold 9px ui-sans-serif, system-ui, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(g.power.type.toUpperCase(), CANVAS_SIZE - 70, 20);
                }
            }

            ctx.restore();
            raf = requestAnimationFrame(loop);
        };

        raf = requestAnimationFrame(loop);
        return () => {
            alive = false;
            cancelAnimationFrame(raf);
        };
    }, [currentTickMs, tick]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !e.ctrlKey && !e.shiftKey && !e.metaKey && !e.altKey) {
                if (isEscapeDialogOpen()) return;
                const target = e.target as HTMLElement;
                if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
                if (widgetRef.current && onClose) {
                    e.preventDefault();
                    e.stopPropagation();
                    onClose();
                }
                return;
            }

            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

            if (screenRef.current === 'menu' && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                startPlay();
                return;
            }

            if (e.key === ' ' || e.key === 'p' || e.key === 'P') {
                if (screenRef.current === 'playing' || screenRef.current === 'paused') {
                    e.preventDefault();
                    togglePause();
                }
                return;
            }

            if (screenRef.current !== 'playing') return;

            const map: Record<string, Direction> = {
                ArrowUp: 'UP', w: 'UP', W: 'UP',
                ArrowDown: 'DOWN', s: 'DOWN', S: 'DOWN',
                ArrowLeft: 'LEFT', a: 'LEFT', A: 'LEFT',
                ArrowRight: 'RIGHT', d: 'RIGHT', D: 'RIGHT',
            };
            const dir = map[e.key];
            if (dir) {
                e.preventDefault();
                queueDir(dir);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onClose, queueDir]);

    const startPlay = () => {
        getAudio();
        initGame();
        screenRef.current = 'playing';
        setScreen('playing');
    };

    const togglePause = () => {
        if (screenRef.current === 'playing') {
            screenRef.current = 'paused';
            setScreen('paused');
            Sfx.pause();
        } else if (screenRef.current === 'paused') {
            gameRef.current.lastTick = performance.now();
            screenRef.current = 'playing';
            setScreen('playing');
        }
    };

    const backToMenu = () => {
        screenRef.current = 'menu';
        setScreen('menu');
    };

    const onSwipeStart = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (screen !== 'playing') return;
        swipeRef.current = { x: e.clientX, y: e.clientY };
    };

    const onSwipeEnd = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const start = swipeRef.current;
        swipeRef.current = null;
        if (!start || screen !== 'playing') return;
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
        if (Math.abs(dx) > Math.abs(dy)) queueDir(dx > 0 ? 'RIGHT' : 'LEFT');
        else queueDir(dy > 0 ? 'DOWN' : 'UP');
    };

    const padBtn = (dir: Direction, label: string, extra = '') => (
        <button
            type="button"
            className={`w-12 h-12 rounded-xl bg-white/10 hover:bg-white/20 active:bg-cyan-400/40 border border-white/15 text-white text-lg font-bold backdrop-blur-sm transition ${extra}`}
            onPointerDown={(e) => {
                e.preventDefault();
                queueDir(dir);
            }}
            aria-label={`Move ${dir.toLowerCase()}`}
        >
            {label}
        </button>
    );

    const chipBtn = (key: string, active: boolean, onClick: () => void, children: React.ReactNode) => (
        <button
            key={key}
            type="button"
            onClick={onClick}
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold tracking-wide transition ${
                active
                    ? 'bg-cyan-400 text-slate-950 shadow-[0_0_16px_rgba(34,211,238,0.45)]'
                    : 'bg-white/8 text-slate-300 hover:bg-white/14 border border-white/10'
            }`}
        >
            {children}
        </button>
    );

    const overlayCard = (title: string, subtitle: string, actions: React.ReactNode, extra?: React.ReactNode) => (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/55 backdrop-blur-[3px] px-5 text-center">
            <p className="text-[10px] tracking-[0.35em] uppercase text-cyan-300/80 mb-1">Arcade</p>
            <h4 className="text-3xl font-black text-white drop-shadow-[0_0_18px_rgba(34,211,238,0.45)]">{title}</h4>
            <p className="text-slate-200 mt-1 mb-4 text-sm">{subtitle}</p>
            {extra}
            <div className="flex flex-wrap items-center justify-center gap-2">{actions}</div>
        </div>
    );

    return (
        <div
            ref={widgetRef}
            className="rounded-2xl overflow-hidden border border-cyan-400/25 bg-slate-950 text-slate-100 shadow-[0_20px_60px_rgba(2,6,23,0.55),0_0_40px_rgba(34,211,238,0.12)]"
            style={{ width: CANVAS_SIZE + 24 }}
            role="dialog"
            aria-label="Snake Game"
        >
            <div className="px-3 pt-3 pb-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                        <h3 className="text-sm font-black tracking-[0.22em] text-cyan-300">SNAKE</h3>
                        {screen !== 'menu' && (
                            <span className="text-[10px] uppercase tracking-widest text-slate-500">Lv {level}</span>
                        )}
                    </div>
                    {screen !== 'menu' && (
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="font-mono text-base font-bold text-white tabular-nums">{score}</span>
                            {combo > 1 && <span className="text-[10px] font-bold text-amber-300">x{Math.min(4, 1 + (combo - 1) * 0.5).toFixed(1)}</span>}
                            <span className="text-[10px] text-slate-500">best {best[difficulty]}</span>
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    {screen !== 'menu' && (
                        <div className="flex items-center gap-0.5 mr-1" aria-label={`${lives} lives remaining`}>
                            {Array.from({ length: diff.lives }).map((_, i) => (
                                <span key={i} className={`text-[11px] ${i < lives ? 'text-rose-400' : 'text-slate-700'}`}>●</span>
                            ))}
                        </div>
                    )}
                    {screen === 'playing' || screen === 'paused' ? (
                        <button
                            type="button"
                            onClick={togglePause}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
                            title={screen === 'paused' ? 'Resume' : 'Pause'}
                        >
                            {screen === 'paused' ? (
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M8 5v14l11-7z" /></svg>
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M6 5h4v14H6zm8 0h4v14h-4z" /></svg>
                            )}
                        </button>
                    ) : null}
                    <button
                        type="button"
                        onClick={() => setSound((s) => !s)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
                        title={sound ? 'Mute' : 'Unmute'}
                        aria-label={sound ? 'Mute sound' : 'Unmute sound'}
                    >
                        {sound ? (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M11 5 6 9H3v6h3l5 4V5z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" /></svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M11 5 6 9H3v6h3l5 4V5z" /><path d="m16 9 6 6M22 9l-6 6" /></svg>
                        )}
                    </button>
                    {onClose && (
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/10"
                            title="Close Snake Game"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    )}
                </div>
            </div>

            <div className="relative mx-3 mb-3 rounded-xl overflow-hidden ring-1 ring-cyan-400/20" style={{ width: CANVAS_SIZE, height: CANVAS_SIZE }}>
                <canvas
                    ref={canvasRef}
                    width={CANVAS_SIZE}
                    height={CANVAS_SIZE}
                    className="block w-full h-full touch-none"
                    aria-label="Snake game arena"
                    aria-describedby="snake-game-instructions"
                    tabIndex={0}
                    onPointerDown={onSwipeStart}
                    onPointerUp={onSwipeEnd}
                    onPointerCancel={() => { swipeRef.current = null; }}
                />
                <div id="snake-game-instructions" className="sr-only">
                    Use arrow keys or WASD to move. Space pauses. Eat glowing food to score. Special food grants chill, boost, ghost, or shrink. Avoid walls, obstacles, and your tail. Swipe on mobile.
                </div>

                {screen === 'menu' && (
                    <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-slate-950/92 via-slate-950/55 to-slate-950/20 px-4 pt-6 pb-4 overflow-y-auto">
                        <div className="text-center mb-3">
                            <p className="text-[10px] tracking-[0.4em] uppercase text-cyan-300/90">LinkNest Arcade</p>
                            <h4 className="text-4xl font-black text-white tracking-tight drop-shadow-[0_0_22px_rgba(34,211,238,0.5)]">SNAKE</h4>
                            <p className="text-xs text-slate-400 mt-1">Neon arenas, power-ups, combos, and climbing speed.</p>
                        </div>
                        <button
                            type="button"
                            onClick={startPlay}
                            className="w-full py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black tracking-[0.2em] text-sm shadow-[0_0_28px_rgba(34,211,238,0.45)] transition"
                        >
                            PLAY
                        </button>
                        <div className="mt-3 space-y-2 text-left">
                            <div>
                                <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Difficulty</p>
                                <div className="grid grid-cols-4 gap-1">
                                    {(Object.keys(DIFFICULTY) as DifficultyId[]).map((id) =>
                                        chipBtn(id, difficulty === id, () => setDifficulty(id), DIFFICULTY[id].label),
                                    )}
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Arena</p>
                                    <div className="flex gap-1">
                                        {(Object.keys(ARENA) as ArenaId[]).map((id) =>
                                            chipBtn(id, arena === id, () => setArena(id), id[0].toUpperCase() + id.slice(1)),
                                        )}
                                    </div>
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Walls</p>
                                    <div className="flex gap-1">
                                        {chipBtn('solid', walls === 'solid', () => setWalls('solid'), 'Solid')}
                                        {chipBtn('wrap', walls === 'wrap', () => setWalls('wrap'), 'Wrap')}
                                    </div>
                                </div>
                            </div>
                            <div>
                                <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Theme</p>
                                <div className="flex items-center gap-2">
                                    {(Object.keys(THEMES) as ThemeId[]).map((id) => (
                                        <button
                                            key={id}
                                            type="button"
                                            title={THEMES[id].name}
                                            onClick={() => setThemeId(id)}
                                            className={`w-6 h-6 rounded-full border-2 transition ${themeId === id ? 'border-white scale-110' : 'border-white/20'}`}
                                            style={{ background: `linear-gradient(135deg, ${THEMES[id].snakeHead}, ${THEMES[id].snakeTail})` }}
                                            aria-label={THEMES[id].name}
                                        />
                                    ))}
                                </div>
                            </div>
                            <p className="text-[10px] text-slate-500 leading-relaxed">
                                Best · Easy {best.easy} · Normal {best.normal} · Hard {best.hard} · Insane {best.insane}
                            </p>
                            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400">
                                {FOOD_TYPES.map((t) => (
                                    <span key={t} className="inline-flex items-center gap-1">
                                        <span className="w-2 h-2 rounded-full" style={{ background: FOOD_META[t].color }} />
                                        {FOOD_META[t].label} +{FOOD_META[t].points}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {screen === 'paused' && overlayCard(
                    'Paused',
                    'Space or P to resume',
                    <>
                        <button type="button" onClick={togglePause} className="px-4 py-2 rounded-xl bg-cyan-400 text-slate-950 font-bold text-sm">Resume</button>
                        <button type="button" onClick={startPlay} className="px-4 py-2 rounded-xl bg-white/10 text-white font-semibold text-sm border border-white/15">Restart</button>
                        <button type="button" onClick={backToMenu} className="px-4 py-2 rounded-xl bg-white/10 text-white font-semibold text-sm border border-white/15">Menu</button>
                    </>,
                )}

                {screen === 'over' && overlayCard(
                    won ? 'You Win!' : 'Game Over',
                    `${newRecord ? 'New record · ' : ''}Score ${score} · Level ${level}`,
                    <>
                        <button type="button" onClick={startPlay} className="px-4 py-2 rounded-xl bg-cyan-400 text-slate-950 font-bold text-sm">Play Again</button>
                        <button type="button" onClick={backToMenu} className="px-4 py-2 rounded-xl bg-white/10 text-white font-semibold text-sm border border-white/15">Menu</button>
                    </>,
                    <p className="text-[11px] text-slate-400 mb-3">
                        Best on {DIFFICULTY[difficulty].label}: {Math.max(best[difficulty], score)}
                    </p>,
                )}

                {screen === 'playing' && isMobile && (
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 grid grid-cols-3 gap-1.5 pointer-events-auto">
                        <span />
                        {padBtn('UP', '▲')}
                        <span />
                        {padBtn('LEFT', '◀')}
                        <button
                            type="button"
                            className="w-12 h-12 rounded-xl bg-white/10 border border-white/15 text-white text-[10px] font-bold"
                            onPointerDown={(e) => { e.preventDefault(); togglePause(); }}
                        >
                            PAUSE
                        </button>
                        {padBtn('RIGHT', '▶')}
                        <span />
                        {padBtn('DOWN', '▼')}
                        <span />
                    </div>
                )}
            </div>

            <p className="px-3 pb-3 text-[10px] text-center text-slate-500">
                Arrows / WASD to steer · Space to pause · Swipe on the arena
            </p>
        </div>
    );
};
