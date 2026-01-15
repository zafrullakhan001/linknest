import React, { useState, useEffect, useRef } from 'react';

export const CalculatorWidget: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'standard' | 'percentage'>('standard');

  // Standard calculator state
  const [display, setDisplay] = useState<string>('0');
  const [previousValue, setPreviousValue] = useState<number | null>(null);
  const [operation, setOperation] = useState<string | null>(null);
  const [waitingForNewValue, setWaitingForNewValue] = useState<boolean>(false);

  // Percentage calculator state
  const [percentageValue, setPercentageValue] = useState<string>('');
  const [numberValue, setNumberValue] = useState<string>('');
  const [percentageResult, setPercentageResult] = useState<number | null>(null);
  const [percentageMode, setPercentageMode] = useState<'calculate' | 'find'>('calculate');

  const widgetRef = useRef<HTMLDivElement>(null);

  // Use refs to access latest state in keyboard handler
  const displayRef = useRef(display);
  const previousValueRef = useRef(previousValue);
  const operationRef = useRef(operation);
  const waitingForNewValueRef = useRef(waitingForNewValue);

  useEffect(() => {
    displayRef.current = display;
    previousValueRef.current = previousValue;
    operationRef.current = operation;
    waitingForNewValueRef.current = waitingForNewValue;
  }, [display, previousValue, operation, waitingForNewValue]);

  // Standard Calculator Functions
  const inputNumber = (num: string) => {
    if (waitingForNewValueRef.current) {
      setDisplay(num);
      setWaitingForNewValue(false);
    } else {
      setDisplay((prev) => prev === '0' ? num : prev + num);
    }
  };

  const inputDecimal = () => {
    if (waitingForNewValueRef.current) {
      setDisplay('0.');
      setWaitingForNewValue(false);
    } else {
      setDisplay((prev) => {
        if (prev.indexOf('.') === -1) {
          return prev + '.';
        }
        return prev;
      });
    }
  };

  const clear = () => {
    setDisplay('0');
    setPreviousValue(null);
    setOperation(null);
    setWaitingForNewValue(false);
  };

  const calculate = (firstValue: number, secondValue: number, op: string): number => {
    switch (op) {
      case '+':
        return firstValue + secondValue;
      case '-':
        return firstValue - secondValue;
      case '*':
        return firstValue * secondValue;
      case '/':
        return secondValue !== 0 ? firstValue / secondValue : 0;
      case '=':
        return secondValue;
      default:
        return secondValue;
    }
  };

  const performOperation = (nextOperation: string) => {
    const inputValue = parseFloat(displayRef.current);

    if (previousValueRef.current === null) {
      setPreviousValue(inputValue);
    } else if (operationRef.current) {
      const currentValue = previousValueRef.current || 0;
      const newValue = calculate(currentValue, inputValue, operationRef.current);
      setDisplay(String(newValue));
      setPreviousValue(newValue);
    }

    setWaitingForNewValue(true);
    setOperation(nextOperation);
  };

  const handleEquals = () => {
    const inputValue = parseFloat(displayRef.current);

    if (previousValueRef.current !== null && operationRef.current) {
      const newValue = calculate(previousValueRef.current, inputValue, operationRef.current);
      setDisplay(String(newValue));
      setPreviousValue(null);
      setOperation(null);
      setWaitingForNewValue(true);
    }
  };

  const handleButtonClick = (value: string) => {
    if (value >= '0' && value <= '9') {
      inputNumber(value);
    } else if (value === '.') {
      inputDecimal();
    } else if (value === 'C') {
      clear();
    } else if (value === '=') {
      handleEquals();
    } else {
      performOperation(value);
    }
  };

  // Percentage Calculator Functions
  const clearPercentage = () => {
    setPercentageValue('');
    setNumberValue('');
    setPercentageResult(null);
  };

  useEffect(() => {
    if (activeTab === 'percentage') {
      const value1 = parseFloat(percentageValue);
      const value2 = parseFloat(numberValue);

      if (!isNaN(value1) && !isNaN(value2)) {
        if (percentageMode === 'calculate') {
          // Calculate: value1% of value2
          const result = (value1 / 100) * value2;
          setPercentageResult(result);
        } else {
          // Find: value1 is what % of value2
          if (value2 !== 0) {
            const result = (value1 / value2) * 100;
            setPercentageResult(result);
          } else {
            setPercentageResult(null);
          }
        }
      } else {
        setPercentageResult(null);
      }
    }
  }, [percentageValue, numberValue, activeTab, percentageMode]);

  // Keyboard event handler (only for standard calculator)
  useEffect(() => {
    if (activeTab !== 'standard') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle keys if calculator widget is visible
      if (!widgetRef.current) return;

      // Check if user is typing in an input field (don't interfere)
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // Map keyboard keys to calculator buttons
      const keyMap: Record<string, string> = {
        // Number keys (top row and numpad)
        '0': '0',
        '1': '1',
        '2': '2',
        '3': '3',
        '4': '4',
        '5': '5',
        '6': '6',
        '7': '7',
        '8': '8',
        '9': '9',
        // Numpad keys
        'Numpad0': '0',
        'Numpad1': '1',
        'Numpad2': '2',
        'Numpad3': '3',
        'Numpad4': '4',
        'Numpad5': '5',
        'Numpad6': '6',
        'Numpad7': '7',
        'Numpad8': '8',
        'Numpad9': '9',
        // Operators
        '+': '+',
        '-': '-',
        '*': '*',
        '/': '/',
        'NumpadAdd': '+',
        'NumpadSubtract': '-',
        'NumpadMultiply': '*',
        'NumpadDivide': '/',
        // Decimal
        '.': '.',
        'NumpadDecimal': '.',
        // Equals
        '=': '=',
        'Enter': '=',
        'NumpadEnter': '=',
        // Clear
        'Escape': 'C',
        'Delete': 'C',
        'Backspace': 'C',
      };

      const mappedValue = keyMap[e.key];
      if (mappedValue) {
        e.preventDefault();
        e.stopPropagation();
        handleButtonClick(mappedValue);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeTab]); // Empty deps - using refs for state access

  return (
    <div
      ref={widgetRef}
      className="bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 p-4 min-w-[280px] max-w-[320px]"
    >
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
          Calculator
        </h3>

        {/* Tabs */}
        <div className="flex gap-1 mb-3">
          <button
            onClick={() => setActiveTab('standard')}
            className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors ${activeTab === 'standard'
                ? 'bg-brand-500 text-white'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
              }`}
          >
            Standard
          </button>
          <button
            onClick={() => setActiveTab('percentage')}
            className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors ${activeTab === 'percentage'
                ? 'bg-brand-500 text-white'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
              }`}
          >
            Percentage
          </button>
        </div>

        {activeTab === 'standard' ? (
          <>
            {/* Display */}
            <div className="bg-slate-900 dark:bg-slate-950 rounded p-3 mb-3">
              <div className="text-right text-2xl font-mono text-white overflow-x-auto">
                {display}
              </div>
            </div>

            {/* Buttons Grid */}
            <div className="grid grid-cols-4 gap-2">
              {/* Row 1 */}
              <button
                onClick={() => handleButtonClick('C')}
                className="col-span-2 px-4 py-3 bg-red-500 hover:bg-red-600 text-white rounded font-medium transition-colors"
              >
                Clear
              </button>
              <button
                onClick={() => handleButtonClick('/')}
                className="px-4 py-3 bg-slate-400 dark:bg-slate-600 hover:bg-slate-500 dark:hover:bg-slate-500 text-white rounded font-medium transition-colors"
              >
                ÷
              </button>
              <button
                onClick={() => handleButtonClick('*')}
                className="px-4 py-3 bg-slate-400 dark:bg-slate-600 hover:bg-slate-500 dark:hover:bg-slate-500 text-white rounded font-medium transition-colors"
              >
                ×
              </button>

              {/* Row 2 */}
              <button
                onClick={() => handleButtonClick('7')}
                className="px-4 py-3 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-slate-100 rounded font-medium transition-colors"
              >
                7
              </button>
              <button
                onClick={() => handleButtonClick('8')}
                className="px-4 py-3 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-slate-100 rounded font-medium transition-colors"
              >
                8
              </button>
              <button
                onClick={() => handleButtonClick('9')}
                className="px-4 py-3 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-slate-100 rounded font-medium transition-colors"
              >
                9
              </button>
              <button
                onClick={() => handleButtonClick('-')}
                className="px-4 py-3 bg-slate-400 dark:bg-slate-600 hover:bg-slate-500 dark:hover:bg-slate-500 text-white rounded font-medium transition-colors"
              >
                −
              </button>

              {/* Row 3 */}
              <button
                onClick={() => handleButtonClick('4')}
                className="px-4 py-3 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-slate-100 rounded font-medium transition-colors"
              >
                4
              </button>
              <button
                onClick={() => handleButtonClick('5')}
                className="px-4 py-3 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-slate-100 rounded font-medium transition-colors"
              >
                5
              </button>
              <button
                onClick={() => handleButtonClick('6')}
                className="px-4 py-3 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-slate-100 rounded font-medium transition-colors"
              >
                6
              </button>
              <button
                onClick={() => handleButtonClick('+')}
                className="px-4 py-3 bg-slate-400 dark:bg-slate-600 hover:bg-slate-500 dark:hover:bg-slate-500 text-white rounded font-medium transition-colors"
              >
                +
              </button>

              {/* Row 4 */}
              <button
                onClick={() => handleButtonClick('1')}
                className="px-4 py-3 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-slate-100 rounded font-medium transition-colors"
              >
                1
              </button>
              <button
                onClick={() => handleButtonClick('2')}
                className="px-4 py-3 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-slate-100 rounded font-medium transition-colors"
              >
                2
              </button>
              <button
                onClick={() => handleButtonClick('3')}
                className="px-4 py-3 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-slate-100 rounded font-medium transition-colors"
              >
                3
              </button>
              <button
                onClick={() => handleButtonClick('=')}
                className="px-4 py-6 bg-brand-500 hover:bg-brand-600 text-white rounded font-medium transition-colors"
                style={{ gridRow: 'span 2' }}
              >
                =
              </button>

              {/* Row 5 */}
              <button
                onClick={() => handleButtonClick('0')}
                className="px-4 py-3 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-slate-100 rounded font-medium transition-colors col-span-2"
              >
                0
              </button>
              <button
                onClick={() => handleButtonClick('.')}
                className="px-4 py-3 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-slate-100 rounded font-medium transition-colors"
              >
                .
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            {/* Mode Selector */}
            <div className="flex gap-1">
              <button
                onClick={() => setPercentageMode('calculate')}
                className={`flex-1 px-2 py-1.5 text-xs font-medium rounded transition-colors ${percentageMode === 'calculate'
                    ? 'bg-brand-500 text-white'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
              >
                X% of Y
              </button>
              <button
                onClick={() => setPercentageMode('find')}
                className={`flex-1 px-2 py-1.5 text-xs font-medium rounded transition-colors ${percentageMode === 'find'
                    ? 'bg-brand-500 text-white'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
              >
                X is ?% of Y
              </button>
            </div>

            {/* First Input */}
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                {percentageMode === 'calculate' ? 'Percentage (%)' : 'Value (X)'}
              </label>
              <input
                type="number"
                value={percentageValue}
                onChange={(e) => setPercentageValue(e.target.value)}
                placeholder={percentageMode === 'calculate' ? 'Enter percentage' : 'Enter value'}
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            {/* Second Input */}
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                {percentageMode === 'calculate' ? 'Number' : 'Total (Y)'}
              </label>
              <input
                type="number"
                value={numberValue}
                onChange={(e) => setNumberValue(e.target.value)}
                placeholder={percentageMode === 'calculate' ? 'Enter number' : 'Enter total'}
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            {/* Result Display */}
            {percentageResult !== null && (
              <div className="bg-slate-900 dark:bg-slate-950 rounded p-3">
                <div className="text-right text-2xl font-mono text-white overflow-x-auto">
                  {percentageResult.toLocaleString(undefined, { maximumFractionDigits: 10 })}
                  {percentageMode === 'find' && '%'}
                </div>
                <div className="text-xs text-slate-400 mt-1 text-right">
                  {percentageMode === 'calculate'
                    ? `${percentageValue}% of ${numberValue}`
                    : `${percentageValue} is ${percentageResult.toFixed(2)}% of ${numberValue}`
                  }
                </div>
              </div>
            )}

            {/* Clear Button */}
            <button
              onClick={clearPercentage}
              className="w-full px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded font-medium transition-colors"
            >
              Clear
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
