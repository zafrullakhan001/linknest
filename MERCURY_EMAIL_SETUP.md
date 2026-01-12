# Mercury Email Server Configuration

Your Mercury email server has been configured for testing email functionality in LinkNest.

## Configuration Details

The following SMTP settings have been configured:

- **SMTP Enabled**: Yes
- **SMTP Host**: localhost
- **SMTP Port**: 25 (standard SMTP port for Mercury)
- **SMTP Encryption**: None (plain text, suitable for local testing)
- **SMTP Authentication**: Disabled (no username/password required for local Mercury)
- **From Email**: noreply@localhost
- **From Name**: LinkNest Monitor

## Prerequisites

1. **Mercury Mail Server must be running** in XAMPP Control Panel
   - Check the XAMPP Control Panel
   - Mercury should show a green status (running)
   - Port 25 should be listed in the Port(s) column

## Testing Email Configuration

You can test the email configuration in two ways:

### Method 1: Using the Application UI (Recommended)

1. Log into your LinkNest application
2. Navigate to the SMTP Settings page (usually in Admin Panel or Settings)
3. Click the "Test Connection" or "Send Test Email" button
4. Check if the test email is received successfully

### Method 2: Using the Configuration Script (If Needed)

If you need to reconfigure Mercury settings, you can run:

```bash
php api/configure_mercury.php
```

## Mercury Mail Server Notes

- **Local Testing**: Mercury is configured for local testing without authentication
- **Email Delivery**: Emails sent through Mercury will be delivered to the Mercury mail queue
- **Viewing Emails**: You can view received emails using Mercury's web interface or mail client
- **Production Use**: For production, consider using a proper SMTP server with authentication and encryption

## Troubleshooting

### Email not sending?

1. **Check Mercury Status**: Ensure Mercury is running in XAMPP Control Panel
2. **Check Port 25**: Verify that port 25 is not blocked by firewall
3. **Check Logs**: Review PHP error logs and Mercury logs for any errors
4. **Test Connection**: Use the test email feature in the application to see specific error messages

### Mercury not receiving emails?

- Verify Mercury is running and listening on port 25
- Check Mercury configuration in XAMPP
- Ensure no other application is using port 25

## Reconfiguring Settings

If you need to change the Mercury email settings, you can:

1. **Via Application UI**: Use the SMTP Settings page in the application
2. **Via Configuration Script**: Run `php api/configure_mercury.php` to reset to default Mercury settings
3. **Via Database**: Directly update the `settings` table in the database (advanced users)

## Security Note

The current configuration uses no encryption and no authentication, which is fine for local testing but **NOT suitable for production**. For production environments, use:
- TLS/SSL encryption
- SMTP authentication with username and password
- A proper mail server or service (Gmail, SendGrid, etc.)
