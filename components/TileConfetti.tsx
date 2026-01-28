import React, { useEffect, useState, useRef } from 'react';

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
}

interface TileConfettiProps {
    trigger: number;
    tileRef?: React.RefObject<HTMLDivElement>;
}

export const TileConfetti: React.FC<TileConfettiProps> = ({ trigger, tileRef }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const confettiRef = useRef<ConfettiPiece[]>([]);
    const animationFrameRef = useRef<number>();

    // Subtle grey colors for background confetti
    const colors = [
        'rgba(120, 120, 120, 0.4)',
        'rgba(100, 100, 100, 0.45)',
        'rgba(140, 140, 140, 0.35)',
        'rgba(80, 80, 80, 0.5)',
    ];

    const shapes: Array<'square' | 'circle' | 'triangle'> = ['square', 'circle', 'triangle'];

    const createConfetti = (canvas: HTMLCanvasElement) => {
        const rect = canvas.getBoundingClientRect();
        const count = 25; // Subtle amount

        for (let i = 0; i < count; i++) {
            confettiRef.current.push({
                x: Math.random() * rect.width,
                y: -20 - Math.random() * 50, // Start above the tile
                vx: (Math.random() - 0.5) * 2,
                vy: 1 + Math.random() * 2,
                rotation: Math.random() * 360,
                rotationSpeed: (Math.random() - 0.5) * 5,
                color: colors[Math.floor(Math.random() * colors.length)],
                size: 3 + Math.random() * 4,
                shape: shapes[Math.floor(Math.random() * shapes.length)],
            });
        }
    };

    const drawShape = (
        ctx: CanvasRenderingContext2D,
        confetti: ConfettiPiece
    ) => {
        ctx.save();
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
            confetti.vy += 0.05; // Gravity
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
    }, [trigger, tileRef]);

    if (trigger === 0) return null;

    return (
        <canvas
            ref={canvasRef}
            className="absolute inset-0 pointer-events-none z-0"
            style={{
                borderRadius: 'inherit',
                opacity: 0.6,
            }}
        />
    );
};
