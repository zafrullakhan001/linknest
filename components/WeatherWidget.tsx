import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { userPreferencesService } from '../services/userPreferencesService';

interface WeatherData {
  time: string;
  temperature: number;
  weatherCode: number;
  precipitation: number;
  uvIndex: number;
  humidity: number;
  aqi: number;
  windSpeed: number;
  apparentTemp: number;
}

interface WeatherResponse {
  hourly: {
    time: string[];
    temperature_2m: number[];
    weathercode: number[];
    precipitation: number[];
    uv_index: number[];
    relative_humidity_2m: number[];
    wind_speed_10m: number[];
    apparent_temperature: number[];
  };
  daily?: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    weathercode: number[];
    precipitation_sum: number[];
    uv_index_max: number[];
  };
}

interface AirQualityResponse {
  hourly: {
    time: string[];
    us_aqi: number[];
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
  const [forecastPeriod, setForecastPeriod] = useState<'12hr' | '48hr' | '7day'>('12hr');

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
      return Math.round((celsius * 9 / 5) + 32);
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

      // Determine forecast parameters based on period
      const forecastHours = forecastPeriod === '12hr' ? 12 : forecastPeriod === '48hr' ? 48 : 168; // 168 hours = 7 days
      const forecastDays = forecastPeriod === '7day' ? 7 : undefined;

      // Step 2: Fetch weather forecast and air quality in parallel
      const [weatherResponse, airQualityResponse] = await Promise.all([
        fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&hourly=temperature_2m,weathercode,precipitation,uv_index,relative_humidity_2m,wind_speed_10m,apparent_temperature&forecast_hours=${forecastHours}&timezone=auto&temperature_unit=celsius&wind_speed_unit=mph${forecastDays ? `&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_sum,uv_index_max&forecast_days=${forecastDays}` : ''}`
        ),
        fetch(
          `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latitude}&longitude=${longitude}&hourly=us_aqi&forecast_hours=${forecastHours}&timezone=auto`
        ),
      ]);

      if (!weatherResponse.ok) {
        throw new Error('Failed to fetch weather data');
      }

      const weather: WeatherResponse = await weatherResponse.json();

      // Air quality might not be available for all locations
      let airQuality: AirQualityResponse | null = null;
      if (airQualityResponse.ok) {
        airQuality = await airQualityResponse.json();
      }

      // Process weather data based on period
      let processed: WeatherData[];

      if (forecastPeriod === '7day' && weather.daily) {
        // For 7-day view, use daily data
        processed = weather.daily.time.map((time, index) => ({
          time,
          temperature: Math.round(weather.daily!.temperature_2m_max[index]),
          weatherCode: weather.daily!.weathercode[index],
          precipitation: weather.daily!.precipitation_sum[index],
          uvIndex: weather.daily!.uv_index_max?.[index] || 0,
          humidity: 0, // Not available in daily data
          aqi: 0, // Not available in daily aggregation
          windSpeed: 0, // Not available in daily data
          apparentTemp: Math.round(weather.daily!.temperature_2m_min[index]),
        }));
      } else {
        // For hourly views (12hr, 48hr)
        const itemCount = forecastPeriod === '12hr' ? 12 : 48;
        processed = weather.hourly.time.slice(0, itemCount).map((time, index) => ({
          time,
          temperature: Math.round(weather.hourly.temperature_2m[index]),
          weatherCode: weather.hourly.weathercode[index],
          precipitation: weather.hourly.precipitation[index],
          uvIndex: weather.hourly.uv_index[index] || 0,
          humidity: Math.round(weather.hourly.relative_humidity_2m[index]) || 0,
          aqi: airQuality?.hourly.us_aqi[index] || 0,
          windSpeed: Math.round(weather.hourly.wind_speed_10m[index]) || 0,
          apparentTemp: Math.round(weather.hourly.apparent_temperature[index]),
        }));
      }

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
    if (forecastPeriod === '7day') {
      // For 7-day view, show full date
      return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    }
    // For hourly views, show day and time
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
    const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    return `${dayName} ${time}`;
  };

  const getUVLevel = (uvIndex: number): { label: string; color: string; bgColor: string } => {
    if (uvIndex < 3) return { label: 'Low', color: 'text-green-700 dark:text-green-400', bgColor: 'bg-green-100 dark:bg-green-900/30' };
    if (uvIndex < 6) return { label: 'Moderate', color: 'text-yellow-700 dark:text-yellow-400', bgColor: 'bg-yellow-100 dark:bg-yellow-900/30' };
    if (uvIndex < 8) return { label: 'High', color: 'text-orange-700 dark:text-orange-400', bgColor: 'bg-orange-100 dark:bg-orange-900/30' };
    if (uvIndex < 11) return { label: 'Very High', color: 'text-red-700 dark:text-red-400', bgColor: 'bg-red-100 dark:bg-red-900/30' };
    return { label: 'Extreme', color: 'text-purple-700 dark:text-purple-400', bgColor: 'bg-purple-100 dark:bg-purple-900/30' };
  };

  const getAQILevel = (aqi: number): { label: string; color: string; bgColor: string } => {
    // US AQI scale: 0-500 (EPA standard)
    if (aqi <= 50) return { label: 'Good', color: 'text-green-700 dark:text-green-400', bgColor: 'bg-green-100 dark:bg-green-900/30' };
    if (aqi <= 100) return { label: 'Moderate', color: 'text-yellow-700 dark:text-yellow-400', bgColor: 'bg-yellow-100 dark:bg-yellow-900/30' };
    if (aqi <= 150) return { label: 'Unhealthy for Sensitive', color: 'text-orange-700 dark:text-orange-400', bgColor: 'bg-orange-100 dark:bg-orange-900/30' };
    if (aqi <= 200) return { label: 'Unhealthy', color: 'text-red-700 dark:text-red-400', bgColor: 'bg-red-100 dark:bg-red-900/30' };
    if (aqi <= 300) return { label: 'Very Unhealthy', color: 'text-purple-700 dark:text-purple-400', bgColor: 'bg-purple-100 dark:bg-purple-900/30' };
    return { label: 'Hazardous', color: 'text-rose-900 dark:text-rose-400', bgColor: 'bg-rose-200 dark:bg-rose-900/30' };
  };

  const getHumidityLevel = (humidity: number): { color: string; bgColor: string } => {
    if (humidity < 30) return { color: 'text-orange-700 dark:text-orange-400', bgColor: 'bg-orange-100 dark:bg-orange-900/30' };
    if (humidity <= 60) return { color: 'text-green-700 dark:text-green-400', bgColor: 'bg-green-100 dark:bg-green-900/30' };
    return { color: 'text-blue-700 dark:text-blue-400', bgColor: 'bg-blue-100 dark:bg-blue-900/30' };
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 p-4 w-full h-full flex flex-col">
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

        {/* Forecast Period Selector */}
        <div className="flex gap-1 mb-3">
          <button
            onClick={() => { setForecastPeriod('12hr'); if (postalCode) fetchWeather(postalCode); }}
            className={`flex-1 px-2 py-1 text-xs rounded transition-colors ${forecastPeriod === '12hr'
              ? 'bg-brand-500 text-white'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
              }`}
          >
            12 Hours
          </button>
          <button
            onClick={() => { setForecastPeriod('48hr'); if (postalCode) fetchWeather(postalCode); }}
            className={`flex-1 px-2 py-1 text-xs rounded transition-colors ${forecastPeriod === '48hr'
              ? 'bg-brand-500 text-white'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
              }`}
          >
            48 Hours
          </button>
          <button
            onClick={() => { setForecastPeriod('7day'); if (postalCode) fetchWeather(postalCode); }}
            className={`flex-1 px-2 py-1 text-xs rounded transition-colors ${forecastPeriod === '7day'
              ? 'bg-brand-500 text-white'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
              }`}
          >
            7 Days
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
          {weatherData.map((item, index) => {
            const uvLevel = getUVLevel(item.uvIndex);
            const aqiLevel = getAQILevel(item.aqi);
            const humidityLevel = getHumidityLevel(item.humidity);
            const feelsLikeDiff = item.apparentTemp - item.temperature;
            return (
              <div
                key={index}
                className="bg-slate-50 dark:bg-slate-700/50 rounded p-2 border border-slate-200 dark:border-slate-600"
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
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
                      {forecastPeriod === '7day' && item.apparentTemp !== item.temperature && (
                        <div className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">
                          Low: {convertTemp(item.apparentTemp)}°
                        </div>
                      )}
                      {forecastPeriod !== '7day' && Math.abs(item.apparentTemp - item.temperature) >= 3 && (
                        <div className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">
                          Feels like {convertTemp(item.apparentTemp)}°
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-lg font-bold text-slate-900 dark:text-slate-100 flex-shrink-0">
                    {forecastPeriod === '7day' ? (
                      <div className="text-right">
                        <div>{convertTemp(item.temperature)}°</div>
                        <div className="text-xs font-normal text-slate-500 dark:text-slate-400">
                          {convertTemp(item.apparentTemp)}°
                        </div>
                      </div>
                    ) : (
                      <>{convertTemp(item.temperature)}°{useFahrenheit ? 'F' : 'C'}</>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {forecastPeriod !== '7day' && item.uvIndex > 0 && (
                    <div className="flex items-center gap-1">
                      <span className="text-xs">☀️</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${uvLevel.bgColor} ${uvLevel.color} font-medium`}>
                        UV {item.uvIndex.toFixed(1)}
                      </span>
                    </div>
                  )}
                  {forecastPeriod !== '7day' && item.humidity > 0 && (
                    <div className="flex items-center gap-1">
                      <span className="text-xs">💧</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${humidityLevel.bgColor} ${humidityLevel.color} font-medium`}>
                        {item.humidity}%
                      </span>
                    </div>
                  )}
                  {forecastPeriod !== '7day' && item.windSpeed > 0 && (
                    <div className="flex items-center gap-1">
                      <span className="text-xs">💨</span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-300 font-medium">
                        {item.windSpeed} mph
                      </span>
                    </div>
                  )}
                  {forecastPeriod !== '7day' && item.aqi > 0 && (
                    <div className="flex items-center gap-1">
                      <span className="text-xs">🌫️</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${aqiLevel.bgColor} ${aqiLevel.color} font-medium`}>
                        AQI {aqiLevel.label}
                      </span>
                    </div>
                  )}
                  {forecastPeriod === '7day' && item.uvIndex > 0 && (
                    <div className="flex items-center gap-1">
                      <span className="text-xs">☀️</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${uvLevel.bgColor} ${uvLevel.color} font-medium`}>
                        Max UV {item.uvIndex.toFixed(1)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
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
