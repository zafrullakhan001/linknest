import React, { useState, useEffect } from 'react';

// USA Timezones
const USA_TIMEZONES = [
  { name: 'Eastern Time', tz: 'America/New_York', abbrev: 'ET' },
  { name: 'Central Time', tz: 'America/Chicago', abbrev: 'CT' },
  { name: 'Mountain Time', tz: 'America/Denver', abbrev: 'MT' },
  { name: 'Pacific Time', tz: 'America/Los_Angeles', abbrev: 'PT' },
  { name: 'Alaska Time', tz: 'America/Anchorage', abbrev: 'AKT' },
  { name: 'Hawaii Time', tz: 'Pacific/Honolulu', abbrev: 'HST' },
];

// Reusable Analog Clock Face Component
const ClockFace: React.FC<{
  date: Date;
  timeZone?: string;
  size?: number;
  showNumbers?: boolean;
}> = ({ date, timeZone, size = 144, showNumbers = true }) => {
  // Get time for the specific timezone
  const getTime = () => {
    try {
      const options: Intl.DateTimeFormatOptions = {
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hour12: false,
        timeZone: timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
      const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(date);
      const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0') % 12;
      const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
      const second = parseInt(parts.find(p => p.type === 'second')?.value || '0');
      return { hour, minute, second };
    } catch (e) {
      // Fallback if timezone is invalid
      return { hour: date.getHours() % 12, minute: date.getMinutes(), second: date.getSeconds() };
    }
  };

  const { hour, minute, second } = getTime();
  const hourAngle = (hour * 30) + (minute * 0.5);
  const minuteAngle = minute * 6;
  const secondAngle = second * 6;

  return (
    <div
      className="relative rounded-full border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-inner flex-shrink-0"
      style={{ width: size, height: size }}
    >
      {/* Clock center */}
      <div className="absolute top-1/2 left-1/2 w-1 h-1 bg-slate-700 dark:bg-slate-300 rounded-full transform -translate-x-1/2 -translate-y-1/2 z-10" />

      {/* Hour marks */}
      {showNumbers && [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((num) => {
        const angle = (num * 30 - 90) * (Math.PI / 180);
        const radius = (size / 2) - (size * 0.15);
        const x = (size / 2) + radius * Math.cos(angle);
        const y = (size / 2) + radius * Math.sin(angle);
        return (
          <div
            key={num}
            className="absolute font-bold text-slate-700 dark:text-slate-300"
            style={{
              left: `${x}px`,
              top: `${y}px`,
              transform: 'translate(-50%, -50%)',
              fontSize: `${Math.max(size * 0.07, 6)}px`
            }}
          >
            {num}
          </div>
        );
      })}

      {/* Hour hand */}
      <div
        className="absolute top-1/2 left-1/2 bg-slate-700 dark:bg-slate-300 origin-bottom z-5"
        style={{
          width: `${Math.max(size * 0.025, 1)}px`,
          height: '25%',
          transform: `translate(-50%, -100%) rotate(${hourAngle}deg)`,
          transformOrigin: '50% 100%',
          borderRadius: '2px'
        }}
      />

      {/* Minute hand */}
      <div
        className="absolute top-1/2 left-1/2 bg-slate-600 dark:bg-slate-400 origin-bottom z-6"
        style={{
          width: `${Math.max(size * 0.02, 1)}px`,
          height: '35%',
          transform: `translate(-50%, -100%) rotate(${minuteAngle}deg)`,
          transformOrigin: '50% 100%',
          borderRadius: '1.5px'
        }}
      />

      {/* Second hand */}
      <div
        className="absolute top-1/2 left-1/2 bg-red-500 origin-bottom z-7"
        style={{
          width: `${Math.max(size * 0.01, 0.5)}px`,
          height: '40%',
          transform: `translate(-50%, -100%) rotate(${secondAngle}deg)`,
          transformOrigin: '50% 100%',
          borderRadius: '1px'
        }}
      />
    </div>
  );
};

export const TimezoneDisplay: React.FC = () => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [timezone, setTimezone] = useState<string>('');
  const [timezoneOffset, setTimezoneOffset] = useState<string>('');
  const [isAnalog, setIsAnalog] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    // Get timezone information
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setTimezone(tz);

    // Get timezone offset
    const offset = -new Date().getTimezoneOffset();
    const offsetHours = Math.floor(Math.abs(offset) / 60);
    const offsetMinutes = Math.abs(offset) % 60;
    const offsetSign = offset >= 0 ? '+' : '-';
    setTimezoneOffset(`${offsetSign}${offsetHours.toString().padStart(2, '0')}:${offsetMinutes.toString().padStart(2, '0')}`);

    // Update time every second
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Format date and time
  const formatDateTime = (date: Date, timeZone?: string) => {
    const options: Intl.DateTimeFormatOptions = {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZone: timeZone,
    };
    return date.toLocaleTimeString(undefined, options);
  };

  const formatDateOnly = (date: Date, timeZone?: string) => {
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone
    });
  };

  const getTimezoneOffsetValue = (timeZone: string) => {
    const now = new Date();
    const utc = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tz = new Date(now.toLocaleString('en-US', { timeZone }));
    const offset = (tz.getTime() - utc.getTime()) / (1000 * 60); // offset in minutes
    const offsetHours = Math.floor(Math.abs(offset) / 60);
    const offsetMinutes = Math.abs(offset) % 60;
    const offsetSign = offset >= 0 ? '+' : '-';
    return `${offsetSign}${offsetHours.toString().padStart(2, '0')}:${offsetMinutes.toString().padStart(2, '0')}`;
  };

  const toggleClock = () => {
    setIsAnalog(!isAnalog);
    setIsExpanded(false); // Close timezone list when switching clock type
  };

  const toggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent clock toggle
    setIsExpanded(!isExpanded);
  };

  return (
    <div
      className={`relative flex flex-col items-start gap-2 px-3 py-2 text-xs text-slate-600 dark:text-slate-400 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm rounded-lg border border-slate-200 dark:border-slate-700 shadow-lg transition-all ${isAnalog ? 'py-4 px-4' : ''}`}
      style={{ zIndex: 1 }}
      title={`Click to switch to ${isAnalog ? 'digital' : 'analog'} clock - Timezone: ${timezone} (UTC${timezoneOffset})`}
    >
      {isAnalog ? (
        // Analog Clock
        <div
          className="flex items-center gap-4 cursor-pointer hover:opacity-90 transition-opacity"
          onClick={toggleClock}
          title="Click to switch to digital clock"
        >
          <ClockFace date={currentTime} size={144} />
          <div className="flex flex-col leading-tight">
            <span className="font-semibold text-sm mb-1">{formatDateOnly(currentTime)}</span>
            <span className="text-xs opacity-75">{timezone}</span>
            <span className="text-[10px] opacity-60">UTC{timezoneOffset}</span>
          </div>
        </div>
      ) : (
        // Digital Clock
        <div className="w-full">
          <div className="flex items-center gap-2 rounded px-1 -mx-1">
            <div
              className="flex items-center gap-2 flex-1 cursor-pointer hover:bg-white/50 dark:hover:bg-slate-800/50 rounded px-1 -mx-1 transition-colors"
              onClick={toggleClock}
              title="Click to switch to analog clock"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-3.5 h-3.5 flex-shrink-0"
              >
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" />
              </svg>
              <div className="flex flex-col leading-tight flex-1">
                <span className="font-medium text-sm">{formatDateTime(currentTime)}</span>
                <span className="text-[10px] opacity-75">{timezone} (UTC{timezoneOffset})</span>
              </div>
            </div>
            <button
              onClick={toggleExpand}
              className="flex-shrink-0 p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
              title={isExpanded ? "Hide USA timezones" : "Show USA timezones"}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className={`w-4 h-4 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
              >
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>

          {/* Expandable USA Timezones List */}
          <div
            className={`overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-[800px] opacity-100 mt-3' : 'max-h-0 opacity-0'
              }`}
          >
            <div className="border-t border-slate-200 dark:border-slate-700 pt-3 space-y-3">
              {USA_TIMEZONES.map((tzInfo) => {
                const tzOffset = getTimezoneOffsetValue(tzInfo.tz);
                return (
                  <div
                    key={tzInfo.tz}
                    className="flex items-center gap-3 px-2 py-2 rounded hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
                  >
                    <ClockFace date={currentTime} timeZone={tzInfo.tz} size={40} showNumbers={false} />
                    <div className="flex flex-col leading-tight flex-1 overflow-hidden">
                      <div className="flex justify-between items-baseline gap-2">
                        <span className="font-bold text-[12px] truncate">{tzInfo.name}</span>
                        <span className="text-[10px] font-mono whitespace-nowrap bg-slate-200 dark:bg-slate-700 px-1 rounded">UTC{tzOffset}</span>
                      </div>
                      <div className="flex justify-between items-center mt-0.5">
                        <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300">
                          {formatDateTime(currentTime, tzInfo.tz)}
                        </span>
                        <span className="text-[9px] opacity-60 uppercase font-semibold">
                          {tzInfo.abbrev}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

