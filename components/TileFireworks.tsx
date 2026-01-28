import React, { useEffect, useState, useRef } from 'react';

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    color: string;
    size: number;
    lineLength: number;
}

interface TileFireworksProps {
    trigger: number;
    tileRef?: React.RefObject<HTMLDivElement>;
}

export const TileFireworks: React.FC<TileFireworksProps> = ({ trigger, tileRef }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const particlesRef = useRef<Particle[]>([]);
    const animationFrameRef = useRef<number>();
    const [isActive, setIsActive] = useState(false);

    // Subtle grey colors for background effect
    const colors = [
        'rgba(120, 120, 120, 0.3)', // Light grey
        'rgba(100, 100, 100, 0.35)', // Medium grey
        'rgba(140, 140, 140, 0.25)', // Lighter grey
        'rgba(80, 80, 80, 0.4)',     // Darker grey
    ];

    const createFirework = (canvas: HTMLCanvasElement) => {
        const rect = canvas.getBoundingClientRect();
        // Random positions across the tile for variety
        const centerX = rect.width * (0.3 + Math.random() * 0.4);
        const centerY = rect.height * (0.3 + Math.random() * 0.4);

        // Create subtle bursts
        const burstCount = 1; // One burst at a time for subtlety

        for (let burst = 0; burst < burstCount; burst++) {
            const particleCount = 15; // Fewer particles for subtle effect
            const color = colors[Math.floor(Math.random() * colors.length)];

            for (let i = 0; i < particleCount; i++) {
                const angle = (Math.PI * 2 * i) / particleCount;
                const velocity = 1 + Math.random() * 1; // Even gentler velocity

                particlesRef.current.push({
                    x: centerX,
                    y: centerY,
                    vx: Math.cos(angle) * velocity,
                    vy: Math.sin(angle) * velocity,
                    life: 1,
                    maxLife: 1,
                    color: color,
                    size: 0.5, // Very thin lines
                    lineLength: 8 + Math.random() * 12, // Line length for streaks
                });
            }
        }
    };

    const animate = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear completely for transparent background
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Update and draw particles
        particlesRef.current = particlesRef.current.filter(particle => {
            // Update position
            particle.x += particle.vx;
            particle.y += particle.vy;

            // Apply gravity (lighter for subtle effect)
            particle.vy += 0.05;

            // Apply air resistance
            particle.vx *= 0.98;
            particle.vy *= 0.98;

            // Update life (slower fade)
            particle.life -= 0.01;

            // Draw particle as thin line (streak effect)
            if (particle.life > 0) {
                ctx.save();
                ctx.globalAlpha = particle.life * 0.6; // Lower opacity for background effect
                ctx.strokeStyle = particle.color;
                ctx.lineWidth = particle.size;
                ctx.lineCap = 'round';

                // Draw line from current position backwards along velocity
                ctx.beginPath();
                const prevX = particle.x - particle.vx * (particle.lineLength / 10);
                const prevY = particle.y - particle.vy * (particle.lineLength / 10);
                ctx.moveTo(prevX, prevY);
                ctx.lineTo(particle.x, particle.y);
                ctx.stroke();

                ctx.restore();
                return true;
            }
            return false;
        });

        // Continue animation if there are particles or keep active
        if (particlesRef.current.length > 0 || isActive) {
            animationFrameRef.current = requestAnimationFrame(animate);
        }
    };

    useEffect(() => {
        // Only trigger if trigger value is greater than 0
        if (trigger === 0) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        // Set canvas size to match tile size
        const updateCanvasSize = () => {
            if (tileRef?.current && canvas) {
                const rect = tileRef.current.getBoundingClientRect();
                canvas.width = rect.width;
                canvas.height = rect.height;
            }
        };

        updateCanvasSize();

        // Clear any existing particles and animation
        particlesRef.current = [];
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
        }

        // Trigger initial firework
        setIsActive(true);
        createFirework(canvas);
        animate();

        // Create additional fireworks at intervals (3-4 fireworks total, more spread out)
        const interval1 = setTimeout(() => {
            if (canvas) createFirework(canvas);
        }, 600);

        const interval2 = setTimeout(() => {
            if (canvas) createFirework(canvas);
        }, 1200);

        const interval3 = setTimeout(() => {
            if (canvas) createFirework(canvas);
        }, 1800);

        // Stop after a short duration
        const stopTimeout = setTimeout(() => {
            setIsActive(false);
        }, 2400);

        return () => {
            clearTimeout(interval1);
            clearTimeout(interval2);
            clearTimeout(interval3);
            clearTimeout(stopTimeout);
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
                opacity: 0.7, // Additional transparency
            }}
        />
    );
};
