import React, { useState, useEffect, useRef, useCallback } from 'react';
import { isEscapeDialogOpen } from '../hooks/useEscapeToClose';

interface SnakeGameWidgetProps {
    onClose?: () => void;
}

type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
type Position = { x: number; y: number };

const CANVAS_SIZE = 600;
const GAME_SPEED = 100;

export const SnakeGameWidget: React.FC<SnakeGameWidgetProps> = ({ onClose }) => {
    const widgetRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [gridSize, setGridSize] = useState(20);
    const [snake, setSnake] = useState<Position[]>([{ x: 10, y: 10 }]);
    const [food, setFood] = useState<Position>({ x: 5, y: 5 });
    const [direction, setDirection] = useState<Direction>('RIGHT');
    const [gameOver, setGameOver] = useState(false);
    const [score, setScore] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const [highContrast, setHighContrast] = useState(false);

    // Calculate dynamic cell size based on fixed canvas size
    const cellSize = CANVAS_SIZE / gridSize;

    // Generate random food position
    const generateFood = useCallback((): Position => {
        const x = Math.floor(Math.random() * gridSize);
        const y = Math.floor(Math.random() * gridSize);
        return { x, y };
    }, [gridSize]);

    // Check if position is occupied by snake
    const isPositionOccupied = useCallback((pos: Position, snakeBody: Position[] = snake): boolean => {
        return snakeBody.some(segment => segment.x === pos.x && segment.y === pos.y);
    }, [snake]);

    // Reset game when grid size changes
    useEffect(() => {
        resetGame();
    }, [gridSize]);

    // Initialize food position only once on mount
    useEffect(() => {
        resetGame();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Handle keyboard controls
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !e.ctrlKey && !e.shiftKey && !e.metaKey && !e.altKey) {
                if (isEscapeDialogOpen()) return;
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
                case 'w':
                    if (direction !== 'DOWN') setDirection('UP');
                    break;
                case 'ArrowDown':
                case 's':
                    if (direction !== 'UP') setDirection('DOWN');
                    break;
                case 'ArrowLeft':
                case 'a':
                    if (direction !== 'RIGHT') setDirection('LEFT');
                    break;
                case 'ArrowRight':
                case 'd':
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
                    head.x < 0 || head.x >= gridSize ||
                    head.y < 0 || head.y >= gridSize ||
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
    }, [direction, food, gameOver, isPaused, generateFood, isPositionOccupied, gridSize]);

    // Draw game
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw grid (subtle)
        ctx.strokeStyle = '#f1f5f9'; // lighter grid for cleaner look
        ctx.lineWidth = 0.5;
        if (!highContrast) {
            for (let i = 0; i <= gridSize; i++) {
                ctx.beginPath();
                ctx.moveTo(i * cellSize, 0);
                ctx.lineTo(i * cellSize, CANVAS_SIZE);
                ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(0, i * cellSize);
                ctx.lineTo(CANVAS_SIZE, i * cellSize);
                ctx.stroke();
            }
        }

        // Draw food (circle)
        const foodRadius = cellSize * 0.35;
        const foodCenterX = food.x * cellSize + cellSize / 2;
        const foodCenterY = food.y * cellSize + cellSize / 2;

        ctx.beginPath();
        ctx.arc(foodCenterX, foodCenterY, foodRadius, 0, Math.PI * 2);
        ctx.fillStyle = highContrast ? '#ff0000' : '#ef4444';
        ctx.fill();
        ctx.closePath();

        // Draw snake (smooth line)
        if (snake.length > 0) {
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.lineWidth = cellSize * 0.8;
            ctx.strokeStyle = highContrast ? '#0000ff' : '#10b981';

            ctx.beginPath();
            // Start from center of head
            ctx.moveTo(snake[0].x * cellSize + cellSize / 2, snake[0].y * cellSize + cellSize / 2);

            // Draw lines to subsequent segments
            for (let i = 1; i < snake.length; i++) {
                ctx.lineTo(snake[i].x * cellSize + cellSize / 2, snake[i].y * cellSize + cellSize / 2);
            }
            ctx.stroke();

            // Draw head specifically if we want to distinguish it (e.g. darker shade)
            ctx.beginPath();
            ctx.arc(snake[0].x * cellSize + cellSize / 2, snake[0].y * cellSize + cellSize / 2, cellSize * 0.4, 0, Math.PI * 2);
            ctx.fillStyle = highContrast ? '#0000aa' : '#059669';
            ctx.fill();
        }

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
    }, [snake, food, gameOver, score, highContrast, cellSize, gridSize]);

    const resetGame = () => {
        const startX = Math.floor(gridSize / 2);
        const startY = Math.floor(gridSize / 2);
        const initialSnake = [{ x: startX, y: startY }];

        setSnake(initialSnake);
        setDirection('RIGHT');
        setGameOver(false);
        setScore(0);
        setIsPaused(false);
        let newFood = generateFood();
        while (initialSnake.some(s => s.x === newFood.x && s.y === newFood.y)) {
            newFood = generateFood();
        }
        setFood(newFood);
    };

    const toggleHighContrast = () => {
        setHighContrast(prev => !prev);
    };

    return (
        <div
            ref={widgetRef}
            className="bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 p-4"
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
                <div className="w-full aspect-square bg-slate-100 dark:bg-slate-700 rounded overflow-hidden relative" style={{ width: CANVAS_SIZE, height: CANVAS_SIZE }}>
                    <canvas
                        ref={canvasRef}
                        width={CANVAS_SIZE}
                        height={CANVAS_SIZE}
                        className="w-full h-full"
                        aria-label="Snake game grid"
                        aria-describedby="snake-game-instructions"
                        tabIndex={0}
                    />
                    <div id="snake-game-instructions" className="sr-only">
                        Use arrow keys to move the snake. Space bar to pause.
                        Collect the red food squares to grow your snake and increase your score.
                        Avoid hitting the walls or your own tail.
                    </div>
                    {(gameOver || isPaused) && (
                        <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center">
                            <p className="text-white font-bold text-lg">
                                {gameOver ? 'Game Over!' : 'Paused'}
                            </p>
                            <p className="text-white mb-4">
                                {gameOver ? `Score: ${score}` : 'Press Space to resume'}
                            </p>
                            <div className="flex items-center">
                                <button
                                    onClick={() => resetGame()}
                                    className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded font-medium transition-colors"
                                >
                                    {gameOver ? 'Play Again' : 'Restart'}
                                </button>
                                <button
                                    onClick={toggleHighContrast}
                                    className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded font-medium transition-colors ml-2"
                                    aria-label={`Toggle high contrast mode. Currently ${highContrast ? 'on' : 'off'}`}
                                >
                                    High Contrast
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Controls */}
                <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-3">
                        <label htmlFor="grid-size" className="text-xs font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">
                            Grid Size:
                        </label>
                        <input
                            id="grid-size"
                            type="range"
                            min="10"
                            max="50"
                            value={gridSize}
                            onChange={(e) => setGridSize(Number(e.target.value))}
                            className="flex-1 h-2 bg-slate-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer accent-brand-500"
                            title="Adjust grid size (number of squares)"
                        />
                        <span className="text-xs text-slate-500 dark:text-slate-400 w-12 text-right">
                            {gridSize}x
                        </span>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 text-center">
                        <p>Use arrow keys or WASD to move. Space to pause.</p>
                    </div>
                </div>
            </div>
        </div>
    );
};
