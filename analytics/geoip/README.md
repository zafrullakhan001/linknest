# GeoIP Database Setup

This directory requires the MaxMind GeoLite2-City database for IP geolocation.

## Installation Steps

1. **Sign up for MaxMind GeoLite2** (free):
   - Visit: https://dev.maxmind.com/geoip/geolite2-free-geolocation-data
   - Create a free account
   - Generate a license key

2. **Download GeoLite2-City database**:
   - Download the `GeoLite2-City.mmdb` file
   - Place it in this directory: `analytics/geoip/GeoLite2-City.mmdb`

3. **Install PHP GeoIP2 library**:
   ```bash
   cd c:\xampp\htdocs\linknest
   composer require geoip2/geoip2:~2.0
   ```

## Database Updates

The GeoLite2 database should be updated monthly for accuracy. MaxMind provides automatic update tools.

## Alternative: Online API

If you don't want to use the offline database, the code includes an alternative using ip-api.com (free tier: 45 requests/minute). To use it, modify the worker to call `getGeoFromIPApi()` instead of `getGeoFromIP()`.

## File Structure

```
analytics/geoip/
├── geoip.php              (GeoIP lookup functions)
├── GeoLite2-City.mmdb     (Download this - not included)
└── README.md              (This file)
```
