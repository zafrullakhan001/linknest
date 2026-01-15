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

interface LocationResult {
  name: string;
  country: string;
  admin1?: string;
  latitude: number;
  longitude: number;
}

// Common countries list for dropdown
const COUNTRIES = [
  { code: '', name: 'Any Country' },
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'IT', name: 'Italy' },
  { code: 'ES', name: 'Spain' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'BE', name: 'Belgium' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'AT', name: 'Austria' },
  { code: 'SE', name: 'Sweden' },
  { code: 'NO', name: 'Norway' },
  { code: 'DK', name: 'Denmark' },
  { code: 'FI', name: 'Finland' },
  { code: 'PL', name: 'Poland' },
  { code: 'CZ', name: 'Czech Republic' },
  { code: 'IE', name: 'Ireland' },
  { code: 'PT', name: 'Portugal' },
  { code: 'GR', name: 'Greece' },
  { code: 'JP', name: 'Japan' },
  { code: 'CN', name: 'China' },
  { code: 'IN', name: 'India' },
  { code: 'BR', name: 'Brazil' },
  { code: 'MX', name: 'Mexico' },
  { code: 'AR', name: 'Argentina' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'SG', name: 'Singapore' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'TH', name: 'Thailand' },
  { code: 'PH', name: 'Philippines' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'KR', name: 'South Korea' },
  { code: 'TR', name: 'Turkey' },
  { code: 'RU', name: 'Russia' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'AE', name: 'United Arab Emirates' },
];

export const WeatherWidget: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const [locationInput, setLocationInput] = useState<string>('');
  const [weatherData, setWeatherData] = useState<WeatherData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationName, setLocationName] = useState<string>('');
  const [useFahrenheit, setUseFahrenheit] = useState<boolean>(false);
  const [useMph, setUseMph] = useState<boolean>(true);
  const [selectedCountry, setSelectedCountry] = useState<string>('');
  const [locationResults, setLocationResults] = useState<LocationResult[]>([]);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [forecastPeriod, setForecastPeriod] = useState<'12hr' | '48hr' | '7day'>('12hr');

  // Load location and preferences from preferences or localStorage
  useEffect(() => {
    const loadPreferences = async () => {
      if (isAuthenticated) {
        try {
          const savedLocation = await userPreferencesService.getPreference('weather_location');
          if (savedLocation) {
            setLocationInput(savedLocation);
            fetchWeather(savedLocation);
          }
          const savedUnit = await userPreferencesService.getPreference('weather_use_fahrenheit');
          if (savedUnit === 'true') {
            setUseFahrenheit(true);
          }
          const savedWindUnit = await userPreferencesService.getPreference('weather_use_mph');
          if (savedWindUnit === 'false') {
            setUseMph(false);
          }
          const savedCountry = await userPreferencesService.getPreference('weather_country');
          if (savedCountry) {
            setSelectedCountry(savedCountry);
          }
        } catch (err) {
          console.error('Failed to load preferences:', err);
        }
      } else {
        const savedLocation = localStorage.getItem('linknest_weather_location');
        if (savedLocation) {
          setLocationInput(savedLocation);
          fetchWeather(savedLocation);
        }
        const savedUnit = localStorage.getItem('linknest_weather_use_fahrenheit');
        if (savedUnit === 'true') {
          setUseFahrenheit(true);
        }
        const savedWindUnit = localStorage.getItem('linknest_weather_use_mph');
        if (savedWindUnit === 'false') {
          setUseMph(false);
        }
        const savedCountry = localStorage.getItem('linknest_weather_country');
        if (savedCountry) {
          setSelectedCountry(savedCountry);
        }
      }
    };

    loadPreferences();
  }, [isAuthenticated]);

  // Save location
  const saveLocation = async (location: string) => {
    if (isAuthenticated) {
      try {
        await userPreferencesService.updatePreference('weather_location', location);
      } catch (err) {
        console.error('Failed to save location:', err);
      }
    } else {
      localStorage.setItem('linknest_weather_location', location);
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

  // Save wind speed unit preference
  const saveWindSpeedUnit = async (useM: boolean) => {
    if (isAuthenticated) {
      try {
        await userPreferencesService.updatePreference('weather_use_mph', useM ? 'true' : 'false');
      } catch (err) {
        console.error('Failed to save wind speed unit:', err);
      }
    } else {
      localStorage.setItem('linknest_weather_use_mph', useM ? 'true' : 'false');
    }
  };

  // Save country preference
  const saveCountry = async (country: string) => {
    if (isAuthenticated) {
      try {
        await userPreferencesService.updatePreference('weather_country', country);
      } catch (err) {
        console.error('Failed to save country:', err);
      }
    } else {
      localStorage.setItem('linknest_weather_country', country);
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

  const toggleWindSpeedUnit = () => {
    const newUnit = !useMph;
    setUseMph(newUnit);
    saveWindSpeedUnit(newUnit);
  };

  const handleCountryChange = (country: string) => {
    setSelectedCountry(country);
    saveCountry(country);
  };

  // Check if input is coordinates (lat,lon format)
  const isCoordinates = (input: string): { lat: number; lon: number } | null => {
    const coordPattern = /^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/;
    const match = input.trim().match(coordPattern);
    if (match) {
      const lat = parseFloat(match[1]);
      const lon = parseFloat(match[2]);
      if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
        return { lat, lon };
      }
    }
    return null;
  };

  const fetchWeather = async (location: string, selectedLocation?: LocationResult) => {
    if (!location.trim()) {
      setError('Please enter a city name, postal code, or coordinates (lat,lon)');
      return;
    }

    setLoading(true);
    setError(null);
    setLocationResults([]);
    setShowLocationPicker(false);

    try {
      let latitude: number;
      let longitude: number;
      let displayName: string;

      // Check if input is coordinates
      const coords = isCoordinates(location);
      if (coords) {
        latitude = coords.lat;
        longitude = coords.lon;
        displayName = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
        setLocationName(displayName);
      } else if (selectedLocation) {
        // Use the selected location from picker
        latitude = selectedLocation.latitude;
        longitude = selectedLocation.longitude;
        displayName = selectedLocation.name;
        if (selectedLocation.admin1) {
          displayName += `, ${selectedLocation.admin1}`;
        }
        displayName += `, ${selectedLocation.country}`;
        setLocationName(displayName);
      } else {
        // Step 1: Geocode location to get coordinates
        let geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=10&language=en&format=json`;
        
        // Add country filter if selected
        if (selectedCountry) {
          geoUrl += `&country_codes=${selectedCountry}`;
        }

        const geoResponse = await fetch(geoUrl);

        if (!geoResponse.ok) {
          throw new Error('Failed to search for location. Please try again.');
        }

        const geoData = await geoResponse.json();

        if (!geoData.results || geoData.results.length === 0) {
          throw new Error(`Location "${location}" not found. Try a different city name, postal code, or coordinates (latitude,longitude).`);
        }

        // If multiple results, show picker
        if (geoData.results.length > 1) {
          const results: LocationResult[] = geoData.results.map((r: any) => ({
            name: r.name,
            country: r.country || 'Unknown',
            admin1: r.admin1,
            latitude: r.latitude,
            longitude: r.longitude,
          }));
          setLocationResults(results);
          setShowLocationPicker(true);
          setLoading(false);
          return;
        }

        // Single result - use it directly
        const locationResult = geoData.results[0];
        displayName = locationResult.name;
        if (locationResult.admin1) {
          displayName += `, ${locationResult.admin1}`;
        }
        displayName += `, ${locationResult.country || 'Unknown'}`;
        setLocationName(displayName);
        latitude = locationResult.latitude;
        longitude = locationResult.longitude;
      }

      // Determine forecast parameters based on period
      const forecastHours = forecastPeriod === '12hr' ? 12 : forecastPeriod === '48hr' ? 48 : 168; // 168 hours = 7 days
      const forecastDays = forecastPeriod === '7day' ? 7 : undefined;

      // Step 2: Fetch weather forecast and air quality in parallel
      const windSpeedUnit = useMph ? 'mph' : 'kmh';
      const [weatherResponse, airQualityResponse] = await Promise.all([
        fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&hourly=temperature_2m,weathercode,precipitation,uv_index,relative_humidity_2m,wind_speed_10m,apparent_temperature&forecast_hours=${forecastHours}&timezone=auto&temperature_unit=celsius&wind_speed_unit=${windSpeedUnit}${forecastDays ? `&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_sum,uv_index_max&forecast_days=${forecastDays}` : ''}`
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
      await saveLocation(location);
    } catch (err: any) {
      setError(err.message || 'Failed to load weather data');
      setWeatherData([]);
    } finally {
      setLoading(false);
    }
  };

  const handleLocationSelect = (location: LocationResult) => {
    setShowLocationPicker(false);
    fetchWeather(locationInput, location);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchWeather(locationInput);
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
          <div className="flex gap-1">
            <button
              onClick={toggleTemperatureUnit}
              className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600 rounded transition-colors"
              title={`Switch to ${useFahrenheit ? 'Celsius' : 'Fahrenheit'}`}
            >
              {useFahrenheit ? '°F' : '°C'}
            </button>
            <button
              onClick={toggleWindSpeedUnit}
              className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600 rounded transition-colors"
              title={`Switch to ${useMph ? 'km/h' : 'mph'}`}
            >
              {useMph ? 'mph' : 'km/h'}
            </button>
          </div>
        </div>

        {/* Forecast Period Selector */}
        <div className="flex gap-1 mb-3">
          <button
            onClick={() => { setForecastPeriod('12hr'); if (locationInput) fetchWeather(locationInput); }}
            className={`flex-1 px-2 py-1 text-xs rounded transition-colors ${forecastPeriod === '12hr'
              ? 'bg-brand-500 text-white'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
              }`}
          >
            12 Hours
          </button>
          <button
            onClick={() => { setForecastPeriod('48hr'); if (locationInput) fetchWeather(locationInput); }}
            className={`flex-1 px-2 py-1 text-xs rounded transition-colors ${forecastPeriod === '48hr'
              ? 'bg-brand-500 text-white'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
              }`}
          >
            48 Hours
          </button>
          <button
            onClick={() => { setForecastPeriod('7day'); if (locationInput) fetchWeather(locationInput); }}
            className={`flex-1 px-2 py-1 text-xs rounded transition-colors ${forecastPeriod === '7day'
              ? 'bg-brand-500 text-white'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
              }`}
          >
            7 Days
          </button>
        </div>

        {/* Country Filter */}
        <div className="mb-2">
          <select
            value={selectedCountry}
            onChange={(e) => handleCountryChange(e.target.value)}
            className="w-full px-2 py-1.5 text-xs border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {COUNTRIES.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </select>
        </div>

        {/* Location Input */}
        <form onSubmit={handleSubmit} className="flex gap-2 mb-3">
          <input
            type="text"
            value={locationInput}
            onChange={(e) => setLocationInput(e.target.value)}
            placeholder="City, postal code, or coordinates..."
            className="flex-1 px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <button
            type="submit"
            disabled={loading || !locationInput.trim()}
            className="px-3 py-1.5 text-sm bg-brand-500 text-white rounded hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? '...' : 'Load'}
          </button>
        </form>

        {/* Location Picker (when multiple results) */}
        {showLocationPicker && locationResults.length > 0 && (
          <div className="mb-3 max-h-40 overflow-y-auto border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700">
            <div className="p-2 text-xs text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-600">
              Multiple locations found. Please select one:
            </div>
            {locationResults.map((result, index) => (
              <button
                key={index}
                onClick={() => handleLocationSelect(result)}
                className="w-full text-left px-2 py-1.5 text-xs hover:bg-slate-100 dark:hover:bg-slate-600 border-b border-slate-200 dark:border-slate-600 last:border-b-0"
              >
                <div className="font-medium text-slate-900 dark:text-slate-100">{result.name}</div>
                <div className="text-slate-500 dark:text-slate-400">
                  {result.admin1 ? `${result.admin1}, ` : ''}{result.country}
                </div>
              </button>
            ))}
          </div>
        )}

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
        <div className="space-y-2 flex-1 overflow-y-auto">
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
                        {item.windSpeed} {useMph ? 'mph' : 'km/h'}
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
          Enter a city name, postal code, or coordinates to see weather forecast
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
