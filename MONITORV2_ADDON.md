# Monitorv2 Addon - Advanced Monitoring with TimescaleDB

Monitorv2 is an advanced monitoring addon for LinkNest that uses PostgreSQL with TimescaleDB for storing and querying monitoring data. This provides significant performance improvements for large monitoring datasets and enables advanced time-series analytics.

## Features

- **PostgreSQL Backend**: Uses PostgreSQL instead of SQLite for monitoring data
- **TimescaleDB Integration**: Leverages TimescaleDB hypertables for efficient time-series data storage
- **High Performance**: Optimized for handling millions of check records
- **Automatic Aggregation**: Hourly and daily statistics are automatically computed
- **Data Retention**: Configurable retention policies with automatic cleanup
- **Advanced Analytics**: Response time percentiles, uptime calculations, incident tracking
- **Schema**: All tables are in the `zmonitoring` schema for isolation

## Database Schema

### Tables

#### `zmonitoring.monitors`
Main table storing monitor configurations:
- `id` (BIGSERIAL PRIMARY KEY)
- `name`, `type`, `target`, `port`, `keyword`
- `interval_minutes`, `warning_threshold`, `timeout_seconds`
- `is_active`, `email_notification`
- `current_status`, `last_response_time_ms`, `last_checked_at`
- `uptime_percentage`, `total_checks`, `failed_checks`
- `tab_name`, `group_name` (for organization)
- `maintenance_start`, `maintenance_end`
- `created_at`, `updated_at`

#### `zmonitoring.monitor_checks` (TimescaleDB Hypertable)
Time-series data for all monitor checks:
- `id`, `monitor_id`, `status` (up/down/warning)
- `response_time_ms`, `http_code`, `details`, `checked_at`
- `error_message`, `dns_lookup_time_ms`, `connect_time_ms`
- `ssl_handshake_time_ms`, `ttfb_ms`, `location`

Chunk size: 1 day, automatically partitioned by `checked_at`

#### `zmonitoring.monitor_hourly_stats` (TimescaleDB Hypertable)
Pre-aggregated hourly statistics:
- `monitor_id`, `bucket` (hour)
- `total_checks`, `up_count`, `down_count`, `warning_count`
- `avg_response_time_ms`, `min_response_time_ms`, `max_response_time_ms`
- `p95_response_time_ms`, `p99_response_time_ms`, `uptime_percentage`

#### `zmonitoring.monitor_daily_stats`
Daily aggregated statistics:
- `monitor_id`, `date`
- `total_checks`, `up_count`, `down_count`, `warning_count`
- `avg_response_time_ms`, `min_response_time_ms`, `max_response_time_ms`
- `uptime_percentage`, `downtime_minutes`

#### `zmonitoring.notification_rules`
Email notification rules:
- `monitor_id`, `name`, `sort_order`
- `status_trigger` (up/down/both)
- `time_window_start`, `time_window_end`, `days_of_week`
- `subject_template`, `body_template`
- `from_name`, `from_email`, `cc_emails`, `is_enabled`

#### `zmonitoring.notification_recipients`
Rule recipients:
- `rule_id`, `email`

#### `zmonitoring.notification_logs` (TimescaleDB Hypertable)
History of sent notifications:
- `rule_id`, `monitor_id`, `recipient_email`
- `status_trigger`, `sent_at`, `subject`, `success`, `error_message`

#### `zmonitoring.incidents`
Outage/incident tracking:
- `monitor_id`, `started_at`, `ended_at`, `duration_seconds`
- `initial_status`, `root_cause`, `acknowledged`
- `acknowledged_by`, `acknowledged_at`, `notes`

#### `zmonitoring.user_monitor_permissions`
User access control:
- `user_id`, `monitor_id`, `can_view`

## Setup Instructions

### 1. Prerequisites

Ensure you have PostgreSQL with TimescaleDB extension installed:

```bash
# On Ubuntu/Debian
sudo apt-get install timescaledb-postgresql-15

# On macOS with Homebrew
brew install timescaledb

# On Windows
# Download and install from https://www.timescale.com/
```

### 2. Configure Connection

1. Go to Admin Panel → Add-ons
2. Find "Monitorv2" and click "Configure"
3. Enter PostgreSQL connection details:
   - Host: `localhost` (or your PostgreSQL host)
   - Port: `5433` (or your PostgreSQL port)
   - Database: `postgres` (or your preferred database)
   - Username: `postgres`
   - Password: Your PostgreSQL password
4. Click "Test Connection" to verify

### 3. Setup Schema

1. Click "Setup Schema" in the Quick Setup Actions section
2. This will create:
   - The `zmonitoring` schema
   - All required tables
   - TimescaleDB hypertables
   - Indexes and views
   - Helper functions

### 4. Enable the Addon

1. Toggle the "Enable" switch
2. Click "Save Configuration"
3. The Monitorv2 tab should now appear in your navigation

## API Endpoints

### Monitors
- `GET /api/monitorv2` - List all monitors
- `POST /api/monitorv2` - Create monitor
- `GET /api/monitorv2/{id}` - Get monitor details
- `PUT /api/monitorv2/{id}` - Update monitor
- `DELETE /api/monitorv2/{id}` - Delete monitor

### Monitor Operations
- `POST /api/monitorv2/{id}/check` - Check monitor now
- `POST /api/monitorv2/check-all` - Check all monitors
- `POST /api/monitorv2/{id}/duplicate` - Duplicate monitor

### Logs & Stats
- `GET /api/monitorv2/{id}/logs` - Get check history
- `GET /api/monitorv2/{id}/stats` - Get statistics
- `GET /api/monitorv2/{id}/incidents` - Get incidents

### Import/Export
- `GET /api/monitorv2/export-bundle` - Export all monitors
- `POST /api/monitorv2/import-bundle` - Import monitors

### Configuration
- `GET /api/monitorv2/health` - Health check
- `POST /api/monitorv2/setup-schema` - Setup database schema
- `POST /api/monitorv2/test-connection` - Test DB connection

### Add-on Management
- `GET /api/addons/monitorv2` - Get configuration
- `PUT /api/addons/monitorv2` - Update configuration
- `GET /api/addons/monitorv2/status` - Get health status
- `POST /api/addons/monitorv2/setup-schema` - Setup schema
- `POST /api/addons/monitorv2/purge-data` - Purge all data

## Configuration Options

| Setting | Default | Description |
|---------|---------|-------------|
| `enabled` | false | Enable/disable the addon |
| `pgHost` | localhost | PostgreSQL host |
| `pgPort` | 5433 | PostgreSQL port |
| `pgDatabase` | postgres | Database name |
| `pgUser` | postgres | Username |
| `retentionDays` | 90 | How long to keep detailed check history |
| `autoCleanup` | true | Automatically delete old data |

## Data Retention

The system supports automatic data cleanup:

- **Raw check data**: Kept for `retentionDays` (default 90 days)
- **Hourly stats**: Kept for `retentionDays + 365` days
- **Daily stats**: Kept indefinitely (very small storage footprint)
- **Notification logs**: Kept for `retentionDays` days

To manually purge data, use the "Purge All Data" button in the admin panel.

## Comparison with Original Monitoring

| Feature | Original Monitoring | Monitorv2 |
|---------|-------------------|-----------|
| Database | SQLite | PostgreSQL |
| Time-series | Regular tables | TimescaleDB hypertables |
| Check history | Limited performance | High performance |
| Aggregation | Manual | Automatic |
| Data retention | Manual cleanup | Automatic |
| Query performance | Degrades with volume | Consistent |
| Concurrent access | Limited | High |

## Migration from Original Monitoring

To migrate from the original monitoring system:

1. Export your monitors from the original monitoring dashboard (JSON export)
2. Enable and configure Monitorv2
3. Setup the schema
4. Import the monitors into Monitorv2

Note: Historical check data is not automatically migrated. The original monitoring data remains in SQLite.

## Troubleshooting

### "Monitorv2 database not configured"
- Check PostgreSQL connection settings
- Verify PostgreSQL is running
- Test the connection in the admin panel

### "Schema not initialized"
- Click "Setup Schema" in the admin panel
- Check PostgreSQL logs for errors
- Ensure TimescaleDB extension is available

### "Cannot connect to PostgreSQL"
- Verify host, port, and credentials
- Check firewall settings
- Ensure PostgreSQL accepts connections

### High disk usage
- Reduce `retentionDays` setting
- Enable `autoCleanup`
- Manually purge old data

## Files Added

```
monitorv2/
├── schema.sql                    # PostgreSQL schema definition

api/
├── monitorv2.php                 # Main API endpoints
├── addons.php                    # Updated with Monitorv2 handlers
├── index.php                     # Updated with Monitorv2 route

components/
├── Monitorv2Dashboard.tsx        # Dashboard component
├── AddonsManagement.tsx          # Updated with Monitorv2 card
├── TileGrid.tsx                  # Updated with Monitorv2 tab

services/
├── monitorv2Service.ts           # TypeScript service
```

## License

This addon is part of LinkNest and follows the same license terms.
