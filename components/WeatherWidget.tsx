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
  pressure?: number; // Surface pressure in hPa
  dewpoint?: number; // Dew point temperature in Celsius
  moonPhase?: number; // 0-1, where 0/1 = new moon, 0.5 = full moon
  sunrise?: string;
  sunset?: string;
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
    surface_pressure?: number[];
    dewpoint_2m?: number[];
  };
  daily?: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    weathercode: number[];
    precipitation_sum: number[];
    uv_index_max: number[];
    sunrise?: string[];
    sunset?: string[];
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

const WEATHER_EMOJIS_DAY: Record<number, string> = {
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

const WEATHER_EMOJIS_NIGHT: Record<number, string> = {
  0: '🌙',
  1: '🌙',
  2: '☁️',
  3: '☁️',
  45: '🌫️',
  48: '🌫️',
  51: '🌧️',
  53: '🌧️',
  55: '🌧️',
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
  80: '🌧️',
  81: '🌧️',
  82: '🌧️',
  85: '🌨️',
  86: '🌨️',
  95: '⛈️',
  96: '⛈️',
  99: '⛈️',
};

// Moon phase calculation - returns value between 0 and 1
// 0/1 = New Moon, 0.25 = First Quarter, 0.5 = Full Moon, 0.75 = Last Quarter
const calculateMoonPhase = (date: Date): number => {
  // Julian Day calculation
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  
  let jd = 367 * year - Math.floor(7 * (year + Math.floor((month + 9) / 12)) / 4) +
    Math.floor(275 * month / 9) + day + 1721013.5;
  
  // Days since last new moon (approximate)
  const daysSinceNewMoon = (jd - 2451549.5) % 29.53058867;
  
  // Normalize to 0-1 range
  return daysSinceNewMoon / 29.53058867;
};

// Get moon phase emoji and name
const getMoonPhaseInfo = (phase: number): { emoji: string; name: string } => {
  if (phase < 0.03 || phase >= 0.97) {
    return { emoji: '🌑', name: 'New Moon' };
  } else if (phase < 0.22) {
    return { emoji: '🌒', name: 'Waxing Crescent' };
  } else if (phase < 0.28) {
    return { emoji: '🌓', name: 'First Quarter' };
  } else if (phase < 0.47) {
    return { emoji: '🌔', name: 'Waxing Gibbous' };
  } else if (phase < 0.53) {
    return { emoji: '🌕', name: 'Full Moon' };
  } else if (phase < 0.72) {
    return { emoji: '🌖', name: 'Waning Gibbous' };
  } else if (phase < 0.78) {
    return { emoji: '🌗', name: 'Last Quarter' };
  } else {
    return { emoji: '🌘', name: 'Waning Crescent' };
  }
};

// Determine if a given time is during the day or night
const isDayTime = (timeString: string, sunrise?: string, sunset?: string): boolean => {
  const time = new Date(timeString);
  const hour = time.getHours();
  
  // If we have sunrise and sunset times, use them
  if (sunrise && sunset) {
    const sunriseTime = new Date(sunrise);
    const sunsetTime = new Date(sunset);
    return time >= sunriseTime && time < sunsetTime;
  }
  
  // Fallback: assume day is between 6 AM and 6 PM
  return hour >= 6 && hour < 18;
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

interface WeatherWidgetProps {
  onClose?: () => void;
}

export const WeatherWidget: React.FC<WeatherWidgetProps> = ({ onClose }) => {
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
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [autoDetectEnabled, setAutoDetectEnabled] = useState<boolean>(false);
  const [currentCoordinates, setCurrentCoordinates] = useState<{ lat: number; lon: number } | null>(null);
  const [todaySunrise, setTodaySunrise] = useState<string | null>(null);
  const [todaySunset, setTodaySunset] = useState<string | null>(null);
  const [todayMoonPhase, setTodayMoonPhase] = useState<number | null>(null);
  const [animationKey, setAnimationKey] = useState<number>(0);

  // Load location and preferences from preferences or localStorage
  useEffect(() => {
    const loadPreferences = async () => {
      if (isAuthenticated) {
        try {
          const savedLocation = await userPreferencesService.getPreference('weather_location');
          const savedAutoDetect = await userPreferencesService.getPreference('weather_auto_detect');
          
          if (savedAutoDetect === 'true') {
            setAutoDetectEnabled(true);
            // Try to auto-detect location if enabled
            detectAndFetchLocation();
          } else if (savedLocation) {
            // Check if saved location is coordinates, and if so, reverse geocode it
            const coords = isCoordinates(savedLocation);
            if (coords) {
              setCurrentCoordinates({ lat: coords.lat, lon: coords.lon });
              try {
                const reverseGeoUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.lat}&lon=${coords.lon}&zoom=10&addressdetails=1`;
                const reverseGeoResponse = await fetch(reverseGeoUrl, {
                  headers: {
                    'User-Agent': 'LinkNest Weather Widget'
                  }
                });
                
                if (reverseGeoResponse.ok) {
                  const reverseGeoData = await reverseGeoResponse.json();
                  if (reverseGeoData && reverseGeoData.address) {
                    const addr = reverseGeoData.address;
                    const parts: string[] = [];
                    
                    if (addr.city || addr.town || addr.village || addr.municipality) {
                      parts.push(addr.city || addr.town || addr.village || addr.municipality);
                    }
                    if (addr.state || addr.region) {
                      parts.push(addr.state || addr.region);
                    }
                    if (addr.country) {
                      parts.push(addr.country);
                    }
                    
                    const displayName = parts.length > 0 ? parts.join(', ') : '';
                    setLocationInput(displayName);
                    setLocationName(displayName);
                    fetchWeather(displayName);
                  } else {
                    setLocationInput(savedLocation);
                    setLocationName('');
                    fetchWeather(savedLocation);
                  }
                } else {
                  setLocationInput(savedLocation);
                  setLocationName('');
                  fetchWeather(savedLocation);
                }
              } catch {
                setLocationInput(savedLocation);
                setLocationName('');
                fetchWeather(savedLocation);
              }
            } else {
              setLocationInput(savedLocation);
              fetchWeather(savedLocation);
            }
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
        const savedAutoDetect = localStorage.getItem('linknest_weather_auto_detect');
        
        if (savedAutoDetect === 'true') {
          setAutoDetectEnabled(true);
          // Try to auto-detect location if enabled
          detectAndFetchLocation();
        } else if (savedLocation) {
          // Check if saved location is coordinates, and if so, reverse geocode it
          const coords = isCoordinates(savedLocation);
          if (coords) {
            setCurrentCoordinates({ lat: coords.lat, lon: coords.lon });
            try {
              const reverseGeoUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.lat}&lon=${coords.lon}&zoom=10&addressdetails=1`;
              const reverseGeoResponse = await fetch(reverseGeoUrl, {
                headers: {
                  'User-Agent': 'LinkNest Weather Widget'
                }
              });
              
              if (reverseGeoResponse.ok) {
                const reverseGeoData = await reverseGeoResponse.json();
                if (reverseGeoData && reverseGeoData.address) {
                  const addr = reverseGeoData.address;
                  const parts: string[] = [];
                  
                  if (addr.city || addr.town || addr.village || addr.municipality) {
                    parts.push(addr.city || addr.town || addr.village || addr.municipality);
                  }
                  if (addr.state || addr.region) {
                    parts.push(addr.state || addr.region);
                  }
                  if (addr.country) {
                    parts.push(addr.country);
                  }
                  
                  const displayName = parts.length > 0 ? parts.join(', ') : '';
                  setLocationInput(displayName);
                  setLocationName(displayName);
                  fetchWeather(displayName);
                } else {
                  setLocationInput(savedLocation);
                  setLocationName('');
                  fetchWeather(savedLocation);
                }
              } else {
                setLocationInput(savedLocation);
                setLocationName('');
                fetchWeather(savedLocation);
              }
            } catch {
              setLocationInput(savedLocation);
              setLocationName('');
              fetchWeather(savedLocation);
            }
          } else {
            setLocationInput(savedLocation);
            fetchWeather(savedLocation);
          }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Save auto-detect preference
  const saveAutoDetect = async (enabled: boolean) => {
    if (isAuthenticated) {
      try {
        await userPreferencesService.updatePreference('weather_auto_detect', enabled ? 'true' : 'false');
      } catch (err) {
        console.error('Failed to save auto-detect preference:', err);
      }
    } else {
      localStorage.setItem('linknest_weather_auto_detect', enabled ? 'true' : 'false');
    }
  };

  // Detect user's location and fetch weather
  const detectAndFetchLocation = async () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      return;
    }

    setDetectingLocation(true);
    setError(null);
    setLoading(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          setCurrentCoordinates({ lat: latitude, lon: longitude });
          
          // Reverse geocode to get location name using Nominatim (OpenStreetMap)
          let displayName = '';
          try {
            const reverseGeoUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=10&addressdetails=1`;
            const reverseGeoResponse = await fetch(reverseGeoUrl, {
              headers: {
                'User-Agent': 'LinkNest Weather Widget'
              }
            });
            
            if (reverseGeoResponse.ok) {
              const reverseGeoData = await reverseGeoResponse.json();
              if (reverseGeoData && reverseGeoData.address) {
                const addr = reverseGeoData.address;
                const parts: string[] = [];
                
                // Build location name from address components
                if (addr.city || addr.town || addr.village || addr.municipality) {
                  parts.push(addr.city || addr.town || addr.village || addr.municipality);
                }
                if (addr.state || addr.region) {
                  parts.push(addr.state || addr.region);
                }
                if (addr.country) {
                  parts.push(addr.country);
                }
                
                displayName = parts.length > 0 ? parts.join(', ') : '';
                setLocationInput(displayName);
              } else {
                setLocationInput(`${latitude}, ${longitude}`);
              }
            } else {
              setLocationInput(`${latitude}, ${longitude}`);
            }
          } catch {
            setLocationInput(`${latitude}, ${longitude}`);
          }

          // Fetch weather using coordinates directly
          await fetchWeatherByCoordinates(latitude, longitude, displayName);
        } catch (err: any) {
          setError(err.message || 'Failed to get location information.');
          setLoading(false);
          setDetectingLocation(false);
        }
      },
      (error) => {
        setDetectingLocation(false);
        setLoading(false);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setError('Location access denied. Please enable location permissions or enter a location manually.');
            break;
          case error.POSITION_UNAVAILABLE:
            setError('Location information unavailable. Please enter a location manually.');
            break;
          case error.TIMEOUT:
            setError('Location request timed out. Please try again or enter a location manually.');
            break;
          default:
            setError('An error occurred while detecting your location. Please enter a location manually.');
            break;
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000, // 5 minutes
      }
    );
  };

  // Fetch weather by coordinates (used for auto-detection)
  const fetchWeatherByCoordinates = async (latitude: number, longitude: number, displayName: string) => {
    setLoading(true);
    setError(null);
    setCurrentCoordinates({ lat: latitude, lon: longitude });
    setLocationName(displayName);

    try {
      const windSpeedUnit = useMph ? 'mph' : 'kmh';
      const forecastHours = forecastPeriod === '12hr' ? 12 : forecastPeriod === '48hr' ? 48 : 168;
      const forecastDays = forecastPeriod === '7day' ? 7 : undefined;

      const [weatherResponse, airQualityResponse] = await Promise.all([
        fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&hourly=temperature_2m,weathercode,precipitation,uv_index,relative_humidity_2m,wind_speed_10m,apparent_temperature,surface_pressure,dewpoint_2m&forecast_hours=${forecastHours}&timezone=auto&temperature_unit=celsius&wind_speed_unit=${windSpeedUnit}${forecastDays ? `&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_sum,uv_index_max,sunrise,sunset&forecast_days=${forecastDays}` : `&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_sum,uv_index_max,sunrise,sunset&forecast_days=1`}`
        ),
        fetch(
          `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latitude}&longitude=${longitude}&hourly=us_aqi&forecast_hours=${forecastHours}&timezone=auto`
        ),
      ]);

      if (!weatherResponse.ok) {
        throw new Error('Failed to fetch weather data');
      }

      const weather: WeatherResponse = await weatherResponse.json();
      let airQuality: AirQualityResponse | null = null;
      if (airQualityResponse.ok) {
        airQuality = await airQualityResponse.json();
      }

      // Store today's sunrise/sunset and moon phase
      if (weather.daily && weather.daily.time.length > 0) {
        const todayIndex = 0;
        if (weather.daily.sunrise && weather.daily.sunrise[todayIndex]) {
          setTodaySunrise(weather.daily.sunrise[todayIndex]);
        }
        if (weather.daily.sunset && weather.daily.sunset[todayIndex]) {
          setTodaySunset(weather.daily.sunset[todayIndex]);
        }
        const todayDate = new Date(weather.daily.time[todayIndex]);
        setTodayMoonPhase(calculateMoonPhase(todayDate));
      }

      let processed: WeatherData[];

      if (forecastPeriod === '7day' && weather.daily) {
        processed = weather.daily.time.map((time, index) => {
          const date = new Date(time);
          return {
            time,
            temperature: Math.round(weather.daily!.temperature_2m_max[index]),
            weatherCode: weather.daily!.weathercode[index],
            precipitation: weather.daily!.precipitation_sum[index],
            uvIndex: weather.daily!.uv_index_max?.[index] || 0,
            humidity: 0,
            aqi: 0,
            windSpeed: 0,
            apparentTemp: Math.round(weather.daily!.temperature_2m_min[index]),
            moonPhase: calculateMoonPhase(date),
            sunrise: weather.daily!.sunrise?.[index],
            sunset: weather.daily!.sunset?.[index],
          };
        });
      } else {
        const itemCount = forecastPeriod === '12hr' ? 12 : 48;
        processed = weather.hourly.time.slice(0, itemCount).map((time, index) => {
          const date = new Date(time);
          return {
            time,
            temperature: Math.round(weather.hourly.temperature_2m[index]),
            weatherCode: weather.hourly.weathercode[index],
            precipitation: weather.hourly.precipitation[index],
            uvIndex: weather.hourly.uv_index[index] || 0,
            humidity: Math.round(weather.hourly.relative_humidity_2m[index]) || 0,
            aqi: airQuality?.hourly.us_aqi[index] || 0,
            windSpeed: Math.round(weather.hourly.wind_speed_10m[index]) || 0,
            apparentTemp: Math.round(weather.hourly.apparent_temperature[index]),
            pressure: weather.hourly.surface_pressure?.[index] ? Math.round(weather.hourly.surface_pressure[index]) : undefined,
            dewpoint: weather.hourly.dewpoint_2m?.[index] ? Math.round(weather.hourly.dewpoint_2m[index]) : undefined,
            moonPhase: calculateMoonPhase(date),
          };
        });
      }

      setWeatherData(processed);
      // Trigger animation by updating key
      setAnimationKey(prev => prev + 1);
      // Save the display name instead of coordinates for better UX
      await saveLocation(displayName);
      setDetectingLocation(false);
    } catch (err: any) {
      setError(err.message || 'Failed to load weather data');
      setWeatherData([]);
      setDetectingLocation(false);
    } finally {
      setLoading(false);
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
    
    // Refetch weather data with the new unit if we have a location
    if (locationInput || currentCoordinates) {
      if (currentCoordinates) {
        fetchWeatherByCoordinates(currentCoordinates.lat, currentCoordinates.lon, locationName || locationInput);
      } else if (locationInput) {
        fetchWeather(locationInput);
      }
    }
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
        setCurrentCoordinates({ lat: latitude, lon: longitude });
        // Reverse geocode to get location name using Nominatim (OpenStreetMap)
        try {
          const reverseGeoUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=10&addressdetails=1`;
          const reverseGeoResponse = await fetch(reverseGeoUrl, {
            headers: {
              'User-Agent': 'LinkNest Weather Widget'
            }
          });
          
          if (reverseGeoResponse.ok) {
            const reverseGeoData = await reverseGeoResponse.json();
            if (reverseGeoData && reverseGeoData.address) {
              const addr = reverseGeoData.address;
              const parts: string[] = [];
              
              // Build location name from address components
              if (addr.city || addr.town || addr.village || addr.municipality) {
                parts.push(addr.city || addr.town || addr.village || addr.municipality);
              }
              if (addr.state || addr.region) {
                parts.push(addr.state || addr.region);
              }
              if (addr.country) {
                parts.push(addr.country);
              }
              
              displayName = parts.length > 0 ? parts.join(', ') : '';
            } else {
              displayName = '';
            }
          } else {
            displayName = '';
          }
        } catch {
          displayName = '';
        }
        setLocationName(displayName);
      } else if (selectedLocation) {
        // Use the selected location from picker
        latitude = selectedLocation.latitude;
        longitude = selectedLocation.longitude;
        setCurrentCoordinates({ lat: latitude, lon: longitude });
        displayName = selectedLocation.name;
        if (selectedLocation.admin1) {
          displayName += `, ${selectedLocation.admin1}`;
        }
        if (selectedLocation.country) {
          displayName += `, ${selectedLocation.country}`;
        }
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
        latitude = locationResult.latitude;
        longitude = locationResult.longitude;
        setCurrentCoordinates({ lat: latitude, lon: longitude });
        displayName = locationResult.name;
        if (locationResult.admin1) {
          displayName += `, ${locationResult.admin1}`;
        }
        if (locationResult.country) {
          displayName += `, ${locationResult.country}`;
        }
        setLocationName(displayName);
      }

      // Determine forecast parameters based on period
      const forecastHours = forecastPeriod === '12hr' ? 12 : forecastPeriod === '48hr' ? 48 : 168; // 168 hours = 7 days
      const forecastDays = forecastPeriod === '7day' ? 7 : undefined;

      // Step 2: Fetch weather forecast and air quality in parallel
      const windSpeedUnit = useMph ? 'mph' : 'kmh';
      const [weatherResponse, airQualityResponse] = await Promise.all([
        fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&hourly=temperature_2m,weathercode,precipitation,uv_index,relative_humidity_2m,wind_speed_10m,apparent_temperature,surface_pressure,dewpoint_2m&forecast_hours=${forecastHours}&timezone=auto&temperature_unit=celsius&wind_speed_unit=${windSpeedUnit}${forecastDays ? `&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_sum,uv_index_max,sunrise,sunset&forecast_days=${forecastDays}` : `&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_sum,uv_index_max,sunrise,sunset&forecast_days=1`}`
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

      // Store today's sunrise/sunset and moon phase
      if (weather.daily && weather.daily.time.length > 0) {
        const todayIndex = 0;
        if (weather.daily.sunrise && weather.daily.sunrise[todayIndex]) {
          setTodaySunrise(weather.daily.sunrise[todayIndex]);
        }
        if (weather.daily.sunset && weather.daily.sunset[todayIndex]) {
          setTodaySunset(weather.daily.sunset[todayIndex]);
        }
        const todayDate = new Date(weather.daily.time[todayIndex]);
        setTodayMoonPhase(calculateMoonPhase(todayDate));
      }

      // Process weather data based on period
      let processed: WeatherData[];

      if (forecastPeriod === '7day' && weather.daily) {
        // For 7-day view, use daily data
        processed = weather.daily.time.map((time, index) => {
          const date = new Date(time);
          return {
            time,
            temperature: Math.round(weather.daily!.temperature_2m_max[index]),
            weatherCode: weather.daily!.weathercode[index],
            precipitation: weather.daily!.precipitation_sum[index],
            uvIndex: weather.daily!.uv_index_max?.[index] || 0,
            humidity: 0, // Not available in daily data
            aqi: 0, // Not available in daily aggregation
            windSpeed: 0, // Not available in daily data
            apparentTemp: Math.round(weather.daily!.temperature_2m_min[index]),
            moonPhase: calculateMoonPhase(date),
            sunrise: weather.daily!.sunrise?.[index],
            sunset: weather.daily!.sunset?.[index],
          };
        });
      } else {
        // For hourly views (12hr, 48hr)
        const itemCount = forecastPeriod === '12hr' ? 12 : 48;
        processed = weather.hourly.time.slice(0, itemCount).map((time, index) => {
          const date = new Date(time);
          return {
            time,
            temperature: Math.round(weather.hourly.temperature_2m[index]),
            weatherCode: weather.hourly.weathercode[index],
            precipitation: weather.hourly.precipitation[index],
            uvIndex: weather.hourly.uv_index[index] || 0,
            humidity: Math.round(weather.hourly.relative_humidity_2m[index]) || 0,
            aqi: airQuality?.hourly.us_aqi[index] || 0,
            windSpeed: Math.round(weather.hourly.wind_speed_10m[index]) || 0,
            apparentTemp: Math.round(weather.hourly.apparent_temperature[index]),
            pressure: weather.hourly.surface_pressure?.[index] ? Math.round(weather.hourly.surface_pressure[index]) : undefined,
            dewpoint: weather.hourly.dewpoint_2m?.[index] ? Math.round(weather.hourly.dewpoint_2m[index]) : undefined,
            moonPhase: calculateMoonPhase(date),
          };
        });
      }

      setWeatherData(processed);
      // Trigger animation by updating key
      setAnimationKey(prev => prev + 1);
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

  const formatTimeOnly = (timeString: string) => {
    const date = new Date(timeString);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
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
          <div className="flex gap-1 items-center">
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
            {onClose && (
              <button
                onClick={onClose}
                className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 rounded transition-colors"
                title="Close Weather Widget"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            )}
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
            type="button"
            onClick={detectAndFetchLocation}
            disabled={loading || detectingLocation}
            className="px-2 py-1.5 text-sm bg-emerald-500 text-white rounded hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Detect my location"
          >
            {detectingLocation ? '...' : '📍'}
          </button>
          <button
            type="submit"
            disabled={loading || detectingLocation || !locationInput.trim()}
            className="px-3 py-1.5 text-sm bg-brand-500 text-white rounded hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? '...' : 'Load'}
          </button>
        </form>
        
        {/* Auto-detect toggle */}
        <div className="flex items-center gap-2 mb-2">
          <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={autoDetectEnabled}
              onChange={(e) => {
                const enabled = e.target.checked;
                setAutoDetectEnabled(enabled);
                saveAutoDetect(enabled);
                if (enabled) {
                  detectAndFetchLocation();
                }
              }}
              className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-brand-500 focus:ring-brand-500"
            />
            <span>Auto-detect location</span>
          </label>
        </div>

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

        {(locationName || currentCoordinates) && (
          <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 mb-2">
            <span className="flex items-center gap-1">
              📍 {currentCoordinates 
                ? `${currentCoordinates.lat.toFixed(4)}, ${currentCoordinates.lon.toFixed(4)}${locationName ? ` (${locationName})` : ''}`
                : locationName}
            </span>
            {currentCoordinates && (
              <>
                <button
                  onClick={(e) => {
                    const coordsText = `${currentCoordinates.lat.toFixed(4)}, ${currentCoordinates.lon.toFixed(4)}`;
                    const btn = e.currentTarget;
                    const originalText = btn.textContent || '📋';
                    
                    navigator.clipboard.writeText(coordsText).then(() => {
                      // Show brief feedback
                      btn.textContent = '✓';
                      setTimeout(() => {
                        btn.textContent = originalText;
                      }, 1000);
                    }).catch(() => {
                      // Fallback for older browsers
                      const textArea = document.createElement('textarea');
                      textArea.value = coordsText;
                      document.body.appendChild(textArea);
                      textArea.select();
                      try {
                        document.execCommand('copy');
                        btn.textContent = '✓';
                        setTimeout(() => {
                          btn.textContent = originalText;
                        }, 1000);
                      } catch (err) {
                        console.error('Failed to copy:', err);
                      }
                      document.body.removeChild(textArea);
                    });
                  }}
                  className="px-1.5 py-0.5 text-[10px] bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-500 rounded transition-colors"
                  title="Copy coordinates"
                >
                  📋
                </button>
                <button
                  onClick={(e) => {
                    const googleMapsUrl = `https://www.google.com/maps?q=${currentCoordinates.lat},${currentCoordinates.lon}`;
                    const btn = e.currentTarget;
                    const originalText = btn.textContent || '🔗';
                    
                    navigator.clipboard.writeText(googleMapsUrl).then(() => {
                      // Show brief feedback
                      btn.textContent = '✓';
                      setTimeout(() => {
                        btn.textContent = originalText;
                      }, 1000);
                    }).catch(() => {
                      // Fallback for older browsers
                      const textArea = document.createElement('textarea');
                      textArea.value = googleMapsUrl;
                      document.body.appendChild(textArea);
                      textArea.select();
                      try {
                        document.execCommand('copy');
                        btn.textContent = '✓';
                        setTimeout(() => {
                          btn.textContent = originalText;
                        }, 1000);
                      } catch (err) {
                        console.error('Failed to copy:', err);
                      }
                      document.body.removeChild(textArea);
                    });
                  }}
                  className="px-1.5 py-0.5 text-[10px] bg-purple-200 dark:bg-purple-600 text-purple-700 dark:text-purple-300 hover:bg-purple-300 dark:hover:bg-purple-500 rounded transition-colors"
                  title="Copy Google Maps link"
                >
                  🔗
                </button>
                <button
                  onClick={() => {
                    const googleMapsUrl = `https://www.google.com/maps?q=${currentCoordinates.lat},${currentCoordinates.lon}`;
                    window.open(googleMapsUrl, '_blank', 'noopener,noreferrer');
                  }}
                  className="px-1.5 py-0.5 text-[10px] bg-blue-200 dark:bg-blue-600 text-blue-700 dark:text-blue-300 hover:bg-blue-300 dark:hover:bg-blue-500 rounded transition-colors"
                  title="Open in Google Maps"
                >
                  🗺️
                </button>
                <button
                  onClick={() => {
                    const weatherComUrl = `https://weather.com/weather/today/l/${currentCoordinates.lat},${currentCoordinates.lon}`;
                    window.open(weatherComUrl, '_blank', 'noopener,noreferrer');
                  }}
                  className="px-1.5 py-0.5 text-[10px] bg-cyan-200 dark:bg-cyan-600 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-300 dark:hover:bg-cyan-500 rounded transition-colors"
                  title="Open in Weather.com"
                >
                  🌦️
                </button>
              </>
            )}
          </div>
        )}

        {/* Today's Moon Phase, Sunrise, and Sunset */}
        {(todayMoonPhase !== null || todaySunrise || todaySunset) && (
          <div className="flex flex-wrap gap-2 mb-2 text-xs">
            {todayMoonPhase !== null && (() => {
              const moonInfo = getMoonPhaseInfo(todayMoonPhase);
              return (
                <div className="flex items-center gap-1 px-2 py-1 rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                  <span>{moonInfo.emoji}</span>
                  <span className="font-medium">{moonInfo.name}</span>
                </div>
              );
            })()}
            {todaySunrise && (
              <div className="flex items-center gap-1 px-2 py-1 rounded bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400">
                <span>🌅</span>
                <span className="font-medium">Sunrise: {formatTimeOnly(todaySunrise)}</span>
              </div>
            )}
            {todaySunset && (
              <div className="flex items-center gap-1 px-2 py-1 rounded bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400">
                <span>🌇</span>
                <span className="font-medium">Sunset: {formatTimeOnly(todaySunset)}</span>
              </div>
            )}
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
        <div className="space-y-2 flex-1 overflow-y-auto" key={`weather-list-${animationKey}`}>
          {weatherData.map((item, index) => {
            const uvLevel = getUVLevel(item.uvIndex);
            const aqiLevel = getAQILevel(item.aqi);
            const humidityLevel = getHumidityLevel(item.humidity);
            const feelsLikeDiff = item.apparentTemp - item.temperature;
            // Determine if it's day or night for this item
            const sunrise = item.sunrise || todaySunrise;
            const sunset = item.sunset || todaySunset;
            const isDay = isDayTime(item.time, sunrise || undefined, sunset || undefined);
            const weatherEmoji = isDay 
              ? (WEATHER_EMOJIS_DAY[item.weatherCode] || '🌤️')
              : (WEATHER_EMOJIS_NIGHT[item.weatherCode] || '🌙');
            return (
              <div
                key={`${item.time}-${index}`}
                className="bg-slate-50 dark:bg-slate-700/50 rounded p-2 border border-slate-200 dark:border-slate-600 tile-anim-flip-y linknest-tile-animated"
                style={{
                  animationDelay: `${index * 0.28}s`
                }}
              >
                <div className="grid grid-cols-4 gap-3 items-center">
                  {/* Column 1: Weather emoji, time, condition */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="text-2xl flex-shrink-0">
                      {weatherEmoji}
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
                  
                  {/* Column 2: UV, Humidity, Wind Speed */}
                  <div className="flex flex-col gap-1 items-center">
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
                    {forecastPeriod === '7day' && item.uvIndex > 0 && (
                      <div className="flex items-center gap-1">
                        <span className="text-xs">☀️</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${uvLevel.bgColor} ${uvLevel.color} font-medium`}>
                          Max UV {item.uvIndex.toFixed(1)}
                        </span>
                      </div>
                    )}
                    {forecastPeriod === '7day' && item.sunrise && (
                      <div className="flex items-center gap-1">
                        <span className="text-xs">🌅</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 font-medium">
                          {formatTimeOnly(item.sunrise)}
                        </span>
                      </div>
                    )}
                    {forecastPeriod === '7day' && item.sunset && (
                      <div className="flex items-center gap-1">
                        <span className="text-xs">🌇</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 font-medium">
                          {formatTimeOnly(item.sunset)}
                        </span>
                      </div>
                    )}
                  </div>
                  
                  {/* Column 3: AQI, Pressure, Dew Point */}
                  <div className="flex flex-col gap-1 items-center">
                    {forecastPeriod !== '7day' && item.aqi > 0 && (
                      <div className="flex items-center gap-1">
                        <span className="text-xs">🌫️</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${aqiLevel.bgColor} ${aqiLevel.color} font-medium`}>
                          AQI {aqiLevel.label}
                        </span>
                      </div>
                    )}
                    {forecastPeriod !== '7day' && item.pressure !== undefined && (
                      <div className="flex items-center gap-1">
                        <span className="text-xs">📊</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-300 font-medium">
                          {item.pressure} hPa
                        </span>
                      </div>
                    )}
                    {forecastPeriod !== '7day' && item.dewpoint !== undefined && (
                      <div className="flex items-center gap-1">
                        <span className="text-xs">🌡️</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-300 font-medium">
                          DP {convertTemp(item.dewpoint)}°
                        </span>
                      </div>
                    )}
                  </div>
                  
                  {/* Column 4: Temperature */}
                  <div className="flex flex-col items-center justify-center flex-shrink-0">
                    <div className="text-lg font-bold text-slate-900 dark:text-slate-100">
                      {forecastPeriod === '7day' ? (
                        <div className="text-center">
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
