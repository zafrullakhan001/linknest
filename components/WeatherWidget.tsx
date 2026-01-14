import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { userPreferencesService } from '../services/userPreferencesService';

interface WeatherData {
  time: string;
  temperature: number;
  weatherCode: number;
  precipitation: number;
}

interface WeatherResponse {
  hourly: {
    time: string[];
    temperature_2m: number[];
    weathercode: number[];
    precipitation: number[];
  };
}

const WEATHER_CODE_NAMES: Record<number, string> = {
  0: 'Clear',
  1: 'Mainly Clear',
  2: 'Partly Cloudy',
  3: 'Overcast',
  45: 'Foggy',
  48: 'Depositing Rime Fog',
  51: 'Light Drizzle',
  53: 'Moderate Drizzle',
  55: 'Dense Drizzle',
  56: 'Light Freezing Drizzle',
  57: 'Dense Freezing Drizzle',
  61: 'Slight Rain',
  63: 'Moderate Rain',
  65: 'Heavy Rain',
  66: 'Light Freezing Rain',
  67: 'Heavy Freezing Rain',
  71: 'Slight Snow',
  73: 'Moderate Snow',
  75: 'Heavy Snow',
  77: 'Snow Grains',
  80: 'Slight Rain Showers',
  81: 'Moderate Rain Showers',
  82: 'Violent Rain Showers',
  85: 'Slight Snow Showers',
  86: 'Heavy Snow Showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with Hail',
  99: 'Thunderstorm with Heavy Hail',
};

const WEATHER_EMOJIS: Record<number, string> = {
  0: '☀️',
  1: '🌤️',
  2: '⛅',
  3: '☁️',
  45: '🌫️',
  48: '🌫️',
  51: '🌦️',
  53: '🌦️',
  55: '🌦️',
  56: '🌨️',
  57: '🌨️',
  61: '🌧️',
  63: '🌧️',
  65: '🌧️',
  66: '🌨️',
  67: '🌨️',
  71: '🌨️',
  73: '🌨️',
  75: '🌨️',
  77: '🌨️',
  80: '🌦️',
  81: '🌦️',
  82: '🌦️',
  85: '🌨️',
  86: '🌨️',
  95: '⛈️',
  96: '⛈️',
  99: '⛈️',
};

export const WeatherWidget: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const [postalCode, setPostalCode] = useState<string>('');
  const [weatherData, setWeatherData] = useState<WeatherData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationName, setLocationName] = useState<string>('');
  const [useFahrenheit, setUseFahrenheit] = useState<boolean>(false);

  // Load postal code and temperature unit from preferences or localStorage
  useEffect(() => {
    const loadPreferences = async () => {
      if (isAuthenticated) {
        try {
          const savedCode = await userPreferencesService.getPreference('weather_postal_code');
          if (savedCode) {
            setPostalCode(savedCode);
            fetchWeather(savedCode);
          }
          const savedUnit = await userPreferencesService.getPreference('weather_use_fahrenheit');
          if (savedUnit === 'true') {
            setUseFahrenheit(true);
          }
        } catch (err) {
          console.error('Failed to load preferences:', err);
        }
      } else {
        const savedCode = localStorage.getItem('linknest_weather_postal_code');
        if (savedCode) {
          setPostalCode(savedCode);
          fetchWeather(savedCode);
        }
        const savedUnit = localStorage.getItem('linknest_weather_use_fahrenheit');
        if (savedUnit === 'true') {
          setUseFahrenheit(true);
        }
      }
    };

    loadPreferences();
  }, [isAuthenticated]);

  // Save postal code
  const savePostalCode = async (code: string) => {
    if (isAuthenticated) {
      try {
        await userPreferencesService.updatePreference('weather_postal_code', code);
      } catch (err) {
        console.error('Failed to save postal code:', err);
      }
    } else {
      localStorage.setItem('linknest_weather_postal_code', code);
    }
  };

  // Save temperature unit preference
  const saveTemperatureUnit = async (useF: boolean) => {
    if (isAuthenticated) {
      try {
        await userPreferencesService.updatePreference('weather_use_fahrenheit', useF ? 'true' : 'false');
      } catch (err) {
        console.error('Failed to save temperature unit:', err);
      }
    } else {
      localStorage.setItem('linknest_weather_use_fahrenheit', useF ? 'true' : 'false');
    }
  };

  // Convert Celsius to Fahrenheit
  const convertTemp = (celsius: number): number => {
    if (useFahrenheit) {
      return Math.round((celsius * 9/5) + 32);
    }
    return celsius;
  };

  const toggleTemperatureUnit = () => {
    const newUnit = !useFahrenheit;
    setUseFahrenheit(newUnit);
    saveTemperatureUnit(newUnit);
  };

  const fetchWeather = async (code: string) => {
    if (!code.trim()) {
      setError('Please enter a postal code');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Step 1: Geocode postal code to get coordinates
      const geoResponse = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(code)}&count=1&language=en&format=json`
      );

      if (!geoResponse.ok) {
        throw new Error('Failed to find location');
      }

      const geoData = await geoResponse.json();
      
      if (!geoData.results || geoData.results.length === 0) {
        throw new Error('Location not found. Please check your postal code.');
      }

      const location = geoData.results[0];
      setLocationName(location.name || code);
      const { latitude, longitude } = location;

      // Step 2: Fetch weather forecast
      const weatherResponse = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&hourly=temperature_2m,weathercode,precipitation&forecast_hours=12&timezone=auto`
      );

      if (!weatherResponse.ok) {
        throw new Error('Failed to fetch weather data');
      }

      const weather: WeatherResponse = await weatherResponse.json();

      // Process weather data
      const processed: WeatherData[] = weather.hourly.time.slice(0, 12).map((time, index) => ({
        time,
        temperature: Math.round(weather.hourly.temperature_2m[index]),
        weatherCode: weather.hourly.weathercode[index],
        precipitation: weather.hourly.precipitation[index],
      }));

      setWeatherData(processed);
      await savePostalCode(code);
    } catch (err: any) {
      setError(err.message || 'Failed to load weather data');
      setWeatherData([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchWeather(postalCode);
  };

  const formatTime = (timeString: string) => {
    const date = new Date(timeString);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 p-4 min-w-[320px] max-w-[450px]">
      <div className="mb-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Weather Forecast
          </h3>
          <button
            onClick={toggleTemperatureUnit}
            className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600 rounded transition-colors"
            title={`Switch to ${useFahrenheit ? 'Celsius' : 'Fahrenheit'}`}
          >
            {useFahrenheit ? '°F' : '°C'}
          </button>
        </div>
        
        {/* Postal Code Input */}
        <form onSubmit={handleSubmit} className="flex gap-2 mb-3">
          <input
            type="text"
            value={postalCode}
            onChange={(e) => setPostalCode(e.target.value)}
            placeholder="Enter postal code..."
            className="flex-1 px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <button
            type="submit"
            disabled={loading || !postalCode.trim()}
            className="px-3 py-1.5 text-sm bg-brand-500 text-white rounded hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? '...' : 'Load'}
          </button>
        </form>

        {locationName && (
          <div className="text-xs text-slate-600 dark:text-slate-400 mb-2">
            📍 {locationName}
          </div>
        )}

        {error && (
          <div className="text-xs text-red-500 dark:text-red-400 mb-2">
            {error}
          </div>
        )}
      </div>

      {/* Weather List */}
      {weatherData.length > 0 ? (
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {weatherData.map((item, index) => (
            <div
              key={index}
              className="bg-slate-50 dark:bg-slate-700/50 rounded p-2 border border-slate-200 dark:border-slate-600 flex items-center justify-between"
            >
              <div className="flex items-center gap-3 flex-1">
                <div className="text-2xl flex-shrink-0">
                  {WEATHER_EMOJIS[item.weatherCode] || '🌤️'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {formatTime(item.time)}
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">
                    {WEATHER_CODE_NAMES[item.weatherCode] || 'Unknown'}
                    {item.precipitation > 0 && ` • ${item.precipitation.toFixed(1)}mm`}
                  </div>
                </div>
              </div>
              <div className="text-lg font-bold text-slate-900 dark:text-slate-100 flex-shrink-0">
                {convertTemp(item.temperature)}°{useFahrenheit ? 'F' : 'C'}
              </div>
            </div>
          ))}
        </div>
      ) : !loading && !error && (
        <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">
          Enter a postal code to see weather forecast
        </div>
      )}

      {loading && (
        <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">
          Loading weather data...
        </div>
      )}
    </div>
  );
};
