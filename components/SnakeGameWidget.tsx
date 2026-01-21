import React, { useState, useEffect, useRef, useCallback } from 'react';

interface SnakeGameWidgetProps {
    onClose?: () => void;
}

type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
type Position = { x: number; y: number };

const GRID_SIZE = 20;
const CELL_SIZE = 15;
const GAME_SPEED = 100;

export const SnakeGameWidget: React.FC<SnakeGameWidgetProps> = ({ onClose }) => {
    const widgetRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [snake, setSnake] = useState<Position[]>([{ x: 10, y: 10 }]);
    const [food, setFood] = useState<Position>({ x: 5, y: 5 });
    const [direction, setDirection] = useState<Direction>('RIGHT');
    const [gameOver, setGameOver] = useState(false);
    const [score, setScore] = useState(0);
    const [isPaused, setIsPaused] = useState(false);

    // Generate random food position
    const generateFood = useCallback((): Position => {
        const x = Math.floor(Math.random() * GRID_SIZE);
        const y = Math.floor(Math.random() * GRID_SIZE);
        return { x, y };
    }, []);

    // Check if position is occupied by snake
    const isPositionOccupied = useCallback((pos: Position, snakeBody: Position[] = snake): boolean => {
        return snakeBody.some(segment => segment.x === pos.x && segment.y === pos.y);
    }, [snake]);

    // Initialize food position
    useEffect(() => {
        let newFood = generateFood();
        while (isPositionOccupied(newFood)) {
            newFood = generateFood();
        }
        setFood(newFood);
    }, [generateFood, isPositionOccupied]);

    // Handle keyboard controls
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !e.ctrlKey && !e.shiftKey && !e.metaKey && !e.altKey) {
                const target = e.target as HTMLElement;
                if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
                    return;
                }
                if (widgetRef.current) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (onClose) onClose();
                }
                return;
            }

            if (e.key === ' ') {
                e.preventDefault();
                setIsPaused(prev => !prev);
                return;
            }

            if (isPaused || gameOver) return;

            switch (e.key) {
                case 'ArrowUp':
                    if (direction !== 'DOWN') setDirection('UP');
                    break;
                case 'ArrowDown':
                    if (direction !== 'UP') setDirection('DOWN');
                    break;
                case 'ArrowLeft':
                    if (direction !== 'RIGHT') setDirection('LEFT');
                    break;
                case 'ArrowRight':
                    if (direction !== 'LEFT') setDirection('RIGHT');
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [direction, isPaused, gameOver, onClose]);

    // Game loop
    useEffect(() => {
        if (gameOver || isPaused) return;

        const moveSnake = () => {
            setSnake(prevSnake => {
                const head = { ...prevSnake[0] };

                // Move head based on direction
                switch (direction) {
                    case 'UP':
                        head.y -= 1;
                        break;
                    case 'DOWN':
                        head.y += 1;
                        break;
                    case 'LEFT':
                        head.x -= 1;
                        break;
                    case 'RIGHT':
                        head.x += 1;
                        break;
                }

                // Check for collisions
                if (
                    head.x < 0 || head.x >= GRID_SIZE ||
                    head.y < 0 || head.y >= GRID_SIZE ||
                    prevSnake.some((segment, index) => index > 0 && segment.x === head.x && segment.y === head.y)
                ) {
                    setGameOver(true);
                    return prevSnake;
                }

                const newSnake = [head, ...prevSnake];

                // Check if snake ate food
                if (head.x === food.x && head.y === food.y) {
                    setScore(prev => prev + 10);
                    let newFood = generateFood();
                    while (isPositionOccupied(newFood, newSnake)) {
                        newFood = generateFood();
                    }
                    setFood(newFood);
                } else {
                    // Remove tail if no food eaten
                    newSnake.pop();
                }

                return newSnake;
            });
        };

        const gameInterval = setInterval(moveSnake, GAME_SPEED);
        return () => clearInterval(gameInterval);
    }, [direction, food, gameOver, isPaused, generateFood, isPositionOccupied]);

    // Draw game
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw grid
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 0.5;
        for (let i = 0; i <= GRID_SIZE; i++) {
            ctx.beginPath();
            ctx.moveTo(i * CELL_SIZE, 0);
            ctx.lineTo(i * CELL_SIZE, GRID_SIZE * CELL_SIZE);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(0, i * CELL_SIZE);
            ctx.lineTo(GRID_SIZE * CELL_SIZE, i * CELL_SIZE);
            ctx.stroke();
        }

        // Draw food
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(food.x * CELL_SIZE, food.y * CELL_SIZE, CELL_SIZE, CELL_SIZE);

        // Draw snake
        snake.forEach((segment, index) => {
            ctx.fillStyle = index === 0 ? '#10b981' : '#34d399';
            ctx.fillRect(segment.x * CELL_SIZE, segment.y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
        });

        // Draw game over message
        if (gameOver) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.fillStyle = 'white';
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Game Over!', canvas.width / 2, canvas.height / 2 - 20);
            ctx.fillText(`Score: ${score}`, canvas.width / 2, canvas.height / 2 + 20);
        }
    }, [snake, food, gameOver, score]);

    const resetGame = () => {
        setSnake([{ x: 10, y: 10 }]);
        setDirection('RIGHT');
        setGameOver(false);
        setScore(0);
        setIsPaused(false);
        const newFood = generateFood();
        setFood(newFood);
    };

    return (
        <div
            ref={widgetRef}
            className="bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 p-4 min-w-[280px] max-w-[320px]"
        >
            <div className="mb-3">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                        Snake Game
                    </h3>
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                            Score: {score}
                        </span>
                        {onClose && (
                            <button
                                onClick={onClose}
                                className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 rounded transition-colors"
                                title="Close Snake Game Widget"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        )}
                    </div>
                </div>

                {/* Game Area */}
                <div className="w-full aspect-square bg-slate-100 dark:bg-slate-700 rounded overflow-hidden relative">
                    <canvas
                        ref={canvasRef}
                        width={GRID_SIZE * CELL_SIZE}
                        height={GRID_SIZE * CELL_SIZE}
                        className="w-full h-full"
                    />
                    {(gameOver || isPaused) && (
                        <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center">
                            <p className="text-white font-bold text-lg">
                                {gameOver ? 'Game Over!' : 'Paused'}
                            </p>
                            <p className="text-white mb-4">
                                {gameOver ? `Score: ${score}` : 'Press Space to resume'}
                            </p>
                            <button
                                onClick={resetGame}
                                className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded font-medium transition-colors"
                            >
                                {gameOver ? 'Play Again' : 'Restart'}
                            </button>
                        </div>
                    )}
                </div>

                {/* Controls */}
                <div className="mt-3 text-xs text-slate-500 dark:text-slate-400 text-center">
                    <p>Use arrow keys to move. Space to pause.</p>
                </div>
            </div>
        </div>
    );
};
