# LinkNest Backend Setup

This application now includes a PHP backend with SQLite database integration and authentication.

## Requirements

- PHP 8.0 or higher
- SQLite3 extension (usually included with PHP)
- Web server (Apache/Nginx) or PHP built-in server

## Setup Instructions

### 1. Database Setup

The database will be automatically created in the `data/` directory when you first access the API. Make sure the `data/` directory is writable:

```bash
mkdir -p data
chmod 755 data
```

### 2. PHP Built-in Server (Development)

`npm run dev` starts PHP on port 8000 for you. To run the backend alone:

```bash
php -S localhost:8000 -t .
```

Then access the application at `http://localhost:3000` (Vite proxies `/api` and `/uploads` to PHP).

### 3. Apache Configuration

If using Apache, ensure `mod_rewrite` is enabled and the `.htaccess` file is being read. The `.htaccess` file is already configured to route API requests.

**Vanilla Apache + PHP 8.5 on Windows** (not XAMPP): after the stock install, see [VANILLA_APACHE_PHP85_WINDOWS.md](VANILLA_APACHE_PHP85_WINDOWS.md) for the exact `httpd.conf` and `php.ini` edits (`AllowOverride All`, `php8apache2_4.dll`, required extensions).

### 4. Nginx Configuration

For Nginx, add this to your server block:

```nginx
location /api {
    try_files $uri $uri/ /api/index.php?$query_string;
}

location / {
    try_files $uri $uri/ /index.html;
}
```

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user
- `GET /api/auth/logout` - Logout

### Tiles

- `GET /api/tiles` - Get all tiles (public for guests, user's tiles when authenticated)
- `GET /api/tiles/{id}` - Get a specific tile
- `POST /api/tiles` - Create a new tile (requires authentication)
- `PUT /api/tiles/{id}` - Update a tile (requires authentication)
- `DELETE /api/tiles/{id}` - Delete a tile (requires authentication)

### MCP (LLM tools)

- `POST /api/mcp` - Model Context Protocol JSON-RPC (Bearer `lnmcp_` token)
- `GET /api/mcp-tokens` - List MCP tokens (admin)
- `POST /api/mcp-tokens` - Create an MCP token (admin; secret returned once)
- `DELETE /api/mcp-tokens/{id}` - Revoke an MCP token (admin)

See [MCP.md](MCP.md) for Cursor / Claude Desktop setup.

## Environment Variables

Create a `.env` file in the root directory:

```
VITE_API_BASE=/api
GEMINI_API_KEY=your_gemini_api_key_here
```

## Security Notes

- Passwords are hashed using PHP's `password_hash()` function
- Sessions are used for authentication
- CORS is enabled for development (adjust for production)
- SQL injection protection via prepared statements
- Foreign key constraints enabled in SQLite

## Guest Mode

When not authenticated:
- Users can view all public tiles and links
- Edit, create, and delete operations are disabled
- A guest mode banner is displayed

## Production Considerations

1. **Security**:
   - Disable CORS or configure it properly for your domain
   - Use HTTPS
   - Set secure session cookies
   - Implement rate limiting

2. **Database**:
   - Regular backups of `data/linknest.db`
   - Consider migrating to MySQL/PostgreSQL for production

3. **Performance**:
   - Enable PHP OPcache
   - Consider caching strategies
   - Optimize database queries

4. **Session Management**:
   - Configure session storage (files/database/Redis)
   - Set appropriate session timeout

