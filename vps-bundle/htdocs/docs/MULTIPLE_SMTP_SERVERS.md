# Multiple SMTP Servers Feature

## Overview

This feature allows LinkNest to support multiple SMTP servers with one active server at any given time. Monitors will automatically follow the active SMTP server for sending email notifications.

## Changes Made

### 1. Database Schema (`api/config.php`)

Added a new `smtp_servers` table to store multiple SMTP server configurations:

**Table: `smtp_servers`**
- `id` - Primary key (auto-increment)
- `name` - Server name/label (e.g., "Primary SMTP", "Backup SMTP")
- `host` - SMTP host address
- `port` - SMTP port (default: 587)
- `username` - SMTP username
- `password` - Encrypted password (base64 encoded)
- `from_email` - Sender email address
- `from_name` - Sender name (default: "LinkNest Monitor")
- `encryption` - Encryption type (none/ssl/tls)
- `is_active` - Boolean flag indicating the active server (only one can be active)
- `is_enabled` - Boolean flag to enable/disable the server
- `pause_start` - Maintenance window start time
- `pause_end` - Maintenance window end time
- `created_at` - Timestamp
- `updated_at` - Timestamp

**Migration:**
The system automatically migrates existing SMTP settings from the legacy `settings` table to the new `smtp_servers` table on first load.

### 2. SMTP Settings API (`api/smtp-settings.php`)

Completely rewritten to support multiple servers with the following endpoints:

**GET Endpoints:**
- `GET /api/smtp-settings.php` - Returns the active SMTP server (legacy compatibility)
- `GET /api/smtp-settings.php/servers` - Returns all SMTP servers

**POST Endpoints:**
- `POST /api/smtp-settings.php` - Create a new SMTP server
- `POST /api/smtp-settings.php/test` - Test SMTP connection
- `POST /api/smtp-settings.php/activate` - Activate a specific SMTP server

**PUT Endpoints:**
- `PUT /api/smtp-settings.php` - Update the active server (legacy compatibility)
- `PUT /api/smtp-settings.php/{id}` - Update a specific SMTP server

**DELETE Endpoints:**
- `DELETE /api/smtp-settings.php/{id}` - Delete a specific SMTP server

### 3. Mailer Service (`api/mailer.php`)

Updated the email sending logic to:
1. First check for an active SMTP server in the new `smtp_servers` table
2. Fall back to legacy `settings` table if no active server is found (for backward compatibility)
3. Use PHP's `mail()` function if SMTP is disabled or unavailable

### 4. TypeScript Service (`services/smtpService.ts`)

Added new interfaces and methods:

**New Interface:**
```typescript
interface SMTPServer {
    id?: number;
    name: string;
    host: string;
    port: number;
    username: string;
    password: string;
    from_email: string;
    from_name: string;
    encryption: 'none' | 'ssl' | 'tls';
    is_active: boolean;
    is_enabled: boolean;
    pause_start?: string;
    pause_end?: string;
    created_at?: number;
    updated_at?: number;
}
```

**New Methods:**
- `getAllServers()` - Get all SMTP servers
- `createServer()` - Create a new SMTP server
- `updateServer()` - Update an existing SMTP server
- `deleteServer()` - Delete an SMTP server
- `activateServer()` - Set a server as active

Legacy methods remain for backward compatibility.

### 5. UI Component (`components/SMTPSettingsModal.tsx`)

Completely redesigned with a split-panel interface:

**Left Panel:**
- List of all SMTP servers
- Visual indication of active server
- "Add Server" button
- Status badges (Active, Enabled/Disabled)

**Right Panel:**
- View mode: Display server details with Edit/Delete/Activate buttons
- Edit mode: Full form for editing server configuration
- Create mode: Form for adding new servers

**Features:**
- Test connection for any server
- Activate/deactivate servers with one click
- Enable/disable servers independently from activation
- Maintenance window configuration per server
- Delete servers (with protection against deleting the only server)

## Usage

### For Administrators

1. **Access SMTP Settings:**
   - Navigate to Admin Panel
   - Click on "SMTP Settings"

2. **Add Multiple Servers:**
   - Click "Add Server" in the left panel
   - Fill in the server configuration
   - Test the connection
   - Click "Create Server"

3. **Switch Active Server:**
   - Select a server from the list
   - Click "Set as Active"
   - The system will automatically use this server for all email notifications

4. **Enable/Disable Servers:**
   - Each server can be enabled or disabled independently
   - Only enabled servers will actually send emails
   - Disabled servers can still be set as active (for testing/staging)

5. **Maintenance Windows:**
   - Configure pause periods per server
   - Notifications will be suppressed during maintenance windows

### For Monitors

Monitors automatically use the active SMTP server. No configuration changes are needed in monitor settings.

## Migration Notes

- Existing SMTP configurations are automatically migrated on first load
- The legacy `settings` table entries are preserved for backward compatibility
- If no active server exists, the system falls back to legacy settings
- You can safely delete the old SMTP entries from the `settings` table after confirming the new system works

## Backward Compatibility

The system maintains backward compatibility:
- Old API endpoints continue to work (they operate on the active server)
- Legacy settings table is checked as a fallback
- Existing code using the old SMTP structure will continue to function

## Benefits

1. **Redundancy:** Configure multiple SMTP servers for failover scenarios
2. **Flexibility:** Switch between servers without reconfiguring
3. **Organization:** Use different servers for different environments (dev/staging/prod)
4. **Easy Testing:** Test new SMTP configurations without affecting the active server
5. **Centralized Management:** All SMTP servers managed from one interface

## Security Notes

- Passwords are base64 encoded (basic obfuscation)
- For production environments, consider implementing proper encryption
- Server credentials are never sent to the client (passwords return as empty strings)
- Test connection feature validates credentials before saving

## Future Enhancements

Potential improvements for future versions:
1. Automatic failover to backup servers if the active server fails
2. Load balancing across multiple active servers
3. Server-specific usage statistics and monitoring
4. Email templates per server
5. Per-monitor server selection (override the global active server)
6. SMTP connection pooling for better performance
