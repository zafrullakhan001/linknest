# LinkNest Runtime Bundle

This is a runtime bundle of the LinkNest application. It contains all source files
needed to build and run the application on the target machine.

## Prerequisites

Before building, ensure you have the following installed:

- **Node.js** (version 16 or higher) - https://nodejs.org/
- **npm** (comes with Node.js)
- **PHP 8.0 or higher** - https://www.php.net/downloads.php
- **Web Server** (Apache, Nginx, or PHP built-in server)

## Building the Application

### Windows

1. Open Command Prompt or PowerShell in the bundle directory
2. Run: `build.bat`

### Linux/Mac

1. Open Terminal in the bundle directory
2. Run: `chmod +x build.sh`
3. Run: `./build.sh`

## Running the Application

After building, the application will be in the `dist` folder. You can run it using:

### Option 1: PHP Built-in Server

```bash
php -S localhost:8000 router.php
```

Then open http://localhost:8000 in your browser.

### Option 2: Apache/Nginx

Configure your web server to:
- Serve static files from the `dist` folder
- Route API requests to `api/index.php`
- Route all other requests to `dist/index.html` (for SPA routing)

## Directory Structure

- `api/` - PHP backend API files
- `components/` - React components
- `contexts/` - React contexts
- `services/` - TypeScript service files
- `data/` - Database files (SQLite)
- `uploads/` - User uploaded files
- `dist/` - Built application (created after build)

## Configuration

The application uses environment variables for configuration. Create a `.env` file
in the root directory if needed:

```env
GEMINI_API_KEY=your_api_key_here
```

## Default Login

- Username: `admin`
- Password: `admin123`

**Important:** Change the default password after first login

## Support

For more information, see the documentation in the `docs/` folder.
