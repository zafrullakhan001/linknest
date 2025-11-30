import React, { useState, useEffect } from 'react';

export const TimezoneDisplay: React.FC = () => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [timezone, setTimezone] = useState<string>('');
  const [timezoneOffset, setTimezoneOffset] = useState<string>('');

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
  const formatDateTime = (date: Date) => {
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    };
    return date.toLocaleString(undefined, options);
  };

  return (
    <div 
      className="flex items-center gap-2 px-3 py-2 text-xs text-slate-600 dark:text-slate-400 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm rounded-lg border border-slate-200 dark:border-slate-700 shadow-lg"
      title={`Timezone: ${timezone} (UTC${timezoneOffset})`}
    >
      <svg 
        xmlns="http://www.w3.org/2000/svg" 
        viewBox="0 0 20 20" 
        fill="currentColor" 
        className="w-3.5 h-3.5 flex-shrink-0"
      >
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" />
      </svg>
      <div className="flex flex-col leading-tight">
        <span className="font-medium">{formatDateTime(currentTime)}</span>
        <span className="text-[10px] opacity-75">{timezone} (UTC{timezoneOffset})</span>
      </div>
    </div>
  );
};

