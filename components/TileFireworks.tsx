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

    // Higher intensity colors
    const colors = [
        'rgba(255, 50, 50, 1.0)',   // Bright Red
        'rgba(50, 150, 255, 1.0)',  // Bright Azure
        'rgba(255, 255, 50, 1.0)',  // Bright Yellow
        'rgba(50, 255, 50, 1.0)',   // Bright Lime
        'rgba(200, 50, 255, 1.0)',  // Bright Purple
        'rgba(255, 120, 0, 1.0)',   // Bright Orange
        'rgba(255, 50, 180, 1.0)',  // Bright Pink
        'rgba(0, 255, 255, 1.0)',   // Bright Cyan
        'rgba(150, 255, 100, 1.0)', // Bright Mint
        'rgba(255, 180, 100, 1.0)', // Bright Peach
    ];

    const createFirework = (canvas: HTMLCanvasElement) => {
        const rect = canvas.getBoundingClientRect();
        // Random positions across the tile for variety
        const centerX = rect.width * (0.2 + Math.random() * 0.6);
        const centerY = rect.height * (0.2 + Math.random() * 0.6);

        // Create bursts
        const particleCount = 45; // Slightly more particles
        const color = colors[Math.floor(Math.random() * colors.length)];

        for (let i = 0; i < particleCount; i++) {
            const angle = (Math.PI * 2 * i) / particleCount;
            const velocity = 0.2 + Math.random() * 0.4;

            particlesRef.current.push({
                x: centerX,
                y: centerY,
                vx: Math.cos(angle) * velocity,
                vy: Math.sin(angle) * velocity,
                life: 1,
                maxLife: 1,
                color: color,
                size: 1.0, // Restored slightly for more perceived intensity
                lineLength: 45 + Math.random() * 55, // Even longer strands
            });
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

            // Apply gravity (extremely minimal for super slow drift)
            particle.vy += 0.004;

            // Apply air resistance (very high for slow motion)
            particle.vx *= 0.997;
            particle.vy *= 0.997;

            // Update life (extremely slow fade)
            particle.life -= 0.0015;
            // Draw particle as thin line (streak effect)
            if (particle.life > 0) {
                ctx.save();
                ctx.globalAlpha = particle.life * 0.6; // Reduced intensity by 30%
                ctx.strokeStyle = particle.color;
                ctx.lineWidth = particle.size;
                ctx.lineCap = 'round';

                // Draw line from current position backwards along velocity
                ctx.beginPath();
                // Extended strand drawing
                const prevX = particle.x - particle.vx * (particle.lineLength / 4);
                const prevY = particle.y - particle.vy * (particle.lineLength / 4);
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

        // Create many more fireworks at varied intervals
        const intervals = [
            setTimeout(() => { if (canvas) createFirework(canvas); }, 500),
            setTimeout(() => { if (canvas) createFirework(canvas); }, 1000),
            setTimeout(() => { if (canvas) createFirework(canvas); }, 1500),
            setTimeout(() => { if (canvas) createFirework(canvas); }, 2000),
            setTimeout(() => { if (canvas) createFirework(canvas); }, 2500),
            setTimeout(() => { if (canvas) createFirework(canvas); }, 3000),
            setTimeout(() => { if (canvas) createFirework(canvas); }, 3500),
            setTimeout(() => { if (canvas) createFirework(canvas); }, 4000),
        ];

        // Stop after longer duration due to slower fade
        const stopTimeout = setTimeout(() => {
            setIsActive(false);
        }, 8000);

        return () => {
            intervals.forEach(clearTimeout);
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
            className="absolute inset-0 pointer-events-none z-10"
            style={{
                borderRadius: 'inherit',
            }}
        />
    );
};
