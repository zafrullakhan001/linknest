# Mercury Email Server - Troubleshooting "550 Address not known here"

## Problem

You're getting this error:
```
550 Address '<zafar@localhost.com>' not known here.
```

This means Mercury mail server doesn't recognize the recipient email address.

## Solution Options

### Option 1: Add User to Mercury (Recommended for Testing)

Mercury in XAMPP has a web interface where you can manage users:

1. **Open Mercury Web Interface**:
   - In XAMPP Control Panel, click the **"Admin"** button next to Mercury
   - Or open your browser and go to: `http://localhost/mail/`
   - Or go to: `http://localhost:2224/` (Mercury's default web port)

2. **Add User to Mercury**:
   - Navigate to **"User Management"** or **"Manage Users"**
   - Click **"Add User"** or **"Create User"**
   - Enter:
     - **Username**: `zafar`
     - **Password**: (set any password - not needed for SMTP sending)
     - **Domain**: `localhost.com`
     - **Full Email**: `zafar@localhost.com`
   - Save the user

3. **Add Domain to Mercury** (if needed):
   - Go to **"Domain Management"** or **"Local Domains"**
   - Add `localhost.com` to the list of local domains
   - Save the configuration

4. **Restart Mercury**:
   - Stop and Start Mercury in XAMPP Control Panel

### Option 2: Use Simple Localhost Domain (Easier)

Change your email address in LinkNest to use `@localhost` instead of `@localhost.com`:

1. **Update Your Email in LinkNest**:
   - Go to your user profile/settings in LinkNest
   - Change your email from `zafar@localhost.com` to `zafar@localhost`
   - Save the changes

2. **Mercury accepts `@localhost` by default**, so this should work immediately without any Mercury configuration.

### Option 3: Configure Mercury Configuration File (Advanced)

If you prefer to configure Mercury manually:

1. **Edit Mercury Configuration File**:
   - Location: `C:\xampp\mercury\mercury.ini`
   - Or: `C:\xampp\sendmail\mercury\mercury.ini`

2. **Add Domain**:
   - Find the `[Domains]` section
   - Add `localhost.com` if it's not already there:
   ```ini
   [Domains]
   localhost
   localhost.com
   ```

3. **Restart Mercury** in XAMPP Control Panel

4. **Add User** (still needed):
   - Use Mercury's web interface (Option 1) to add the user `zafar@localhost.com`

## Quick Test

After configuring:

1. **Check Mercury is Running**: 
   - In XAMPP Control Panel, Mercury should show green (running)
   - Port 25 should be listed

2. **Test Email**:
   - Go to LinkNest SMTP Settings page
   - Click "Test Connection" or "Send Test Email"
   - Check Mercury's mail queue or web interface to see if email was received

3. **View Received Emails**:
   - Use Mercury's web interface at `http://localhost/mail/`
   - Or check the mail directory: `C:\xampp\mercury\mail\`

## Recommended Approach

For **easiest setup**, use **Option 2**: Change your email to `zafar@localhost` in LinkNest. This typically works with Mercury's default configuration without any additional setup.

For **more realistic testing** (with a custom domain), use **Option 1** to add the user to Mercury through its web interface.
