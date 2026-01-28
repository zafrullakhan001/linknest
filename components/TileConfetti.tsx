import React, { useEffect, useRef } from 'react';
import type { CelebrationConfig } from '../types';

interface ConfettiPiece {
    x: number;
    y: number;
    vx: number;
    vy: number;
    rotation: number;
    rotationSpeed: number;
    color: string;
    size: number;
    shape: 'square' | 'circle' | 'triangle';
    opacity: number;
}

interface TileConfettiProps {
    trigger: number;
    tileRef?: React.RefObject<HTMLDivElement>;
    config?: CelebrationConfig;
}

const DEFAULT_COUNT = 40;

export const TileConfetti: React.FC<TileConfettiProps> = ({ trigger, tileRef, config }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const confettiRef = useRef<ConfettiPiece[]>([]);
    const animationFrameRef = useRef<number>();

    const intensity = Math.max(1, Math.min(100, config?.intensity ?? 100)) / 100;
    const count = Math.max(5, Math.min(80, config?.particleCount ?? DEFAULT_COUNT));
    const sizeMul = Math.max(0.5, Math.min(2, (config?.particleSize ?? 100) / 100));

    const colors = [
        '#ff4d4d', '#4d94ff', '#ffff4d', '#4dff4d', '#d94dff', '#ff944d',
    ];

    const shapes: Array<'square' | 'circle' | 'triangle'> = ['square', 'circle', 'triangle'];

    const createConfetti = (canvas: HTMLCanvasElement) => {
        const rect = canvas.getBoundingClientRect();
        for (let i = 0; i < count; i++) {
            const baseSize = 4 + Math.random() * 5;
            confettiRef.current.push({
                x: Math.random() * rect.width,
                y: -20 - Math.random() * 50,
                vx: (Math.random() - 0.5) * 0.5 * intensity,
                vy: (0.2 + Math.random() * 0.4) * intensity,
                rotation: Math.random() * 360,
                rotationSpeed: (Math.random() - 0.5) * 1,
                color: colors[Math.floor(Math.random() * colors.length)],
                size: baseSize * sizeMul,
                shape: shapes[Math.floor(Math.random() * shapes.length)],
                opacity: 0.7 * intensity,
            });
        }
    };

    const drawShape = (
        ctx: CanvasRenderingContext2D,
        confetti: ConfettiPiece
    ) => {
        ctx.save();
        ctx.globalAlpha = confetti.opacity;
        ctx.translate(confetti.x, confetti.y);
        ctx.rotate((confetti.rotation * Math.PI) / 180);
        ctx.fillStyle = confetti.color;

        switch (confetti.shape) {
            case 'square':
                ctx.fillRect(-confetti.size / 2, -confetti.size / 2, confetti.size, confetti.size);
                break;
            case 'circle':
                ctx.beginPath();
                ctx.arc(0, 0, confetti.size / 2, 0, Math.PI * 2);
                ctx.fill();
                break;
            case 'triangle':
                ctx.beginPath();
                ctx.moveTo(0, -confetti.size / 2);
                ctx.lineTo(confetti.size / 2, confetti.size / 2);
                ctx.lineTo(-confetti.size / 2, confetti.size / 2);
                ctx.closePath();
                ctx.fill();
                break;
        }

        ctx.restore();
    };

    const animate = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        confettiRef.current = confettiRef.current.filter(confetti => {
            confetti.x += confetti.vx;
            confetti.y += confetti.vy;
            confetti.vy += 0.004; // Minimal gravity (50% slower than before)
            confetti.rotation += confetti.rotationSpeed;

            // Remove if out of bounds
            if (confetti.y > canvas.height + 20) {
                return false;
            }

            drawShape(ctx, confetti);
            return true;
        });

        if (confettiRef.current.length > 0) {
            animationFrameRef.current = requestAnimationFrame(animate);
        }
    };

    useEffect(() => {
        // Only trigger if trigger value is greater than 0
        if (trigger === 0) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        if (tileRef?.current && canvas) {
            const rect = tileRef.current.getBoundingClientRect();
            canvas.width = rect.width;
            canvas.height = rect.height;
        }

        // Clear any existing confetti and animation
        confettiRef.current = [];
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
        }

        createConfetti(canvas);
        animate();

        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [trigger, tileRef, intensity, count, sizeMul]);

    if (trigger === 0) return null;

    return (
        <canvas
            ref={canvasRef}
            className="absolute inset-0 pointer-events-none z-10"
            style={{
                borderRadius: 'inherit',
            }}
        />
    );
};
