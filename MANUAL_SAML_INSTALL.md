# Manual SAML Library Installation

Due to SSL certificate issues with Composer, you can manually install the OneLogin PHP-SAML library.

## Option 1: Manual Download (Recommended)

1. **Download the library:**
   - Go to: https://github.com/onelogin/php-saml/releases
   - Download the latest release (v4.0.0 or newer) as a ZIP file
   - Or use this direct link: https://github.com/onelogin/php-saml/archive/refs/heads/master.zip

2. **Extract the files:**
   - Extract the ZIP file
   - Navigate to the extracted folder
   - Copy the `src/OneLogin` folder
   - Paste it into: `C:\xampp\htdocs\linknest\vendor\onelogin\php-saml\src\OneLogin`

3. **Verify the structure:**
   The final structure should be:
   ```
   vendor/
     onelogin/
       php-saml/
         src/
           OneLogin/
             Saml2/
               Auth.php
               Settings.php
               (other files...)
   ```

4. **Test the installation:**
   - Try accessing: http://localhost/linknest/api/saml?action=metadata
   - It should now work without the "library not installed" error

## Option 2: Fix Composer SSL (Alternative)

If you want to use Composer instead:

1. **Download CA certificates:**
   - Download from: http://curl.se/ca/cacert.pem
   - Save to: `C:\xampp\php\cacert.pem`

2. **Configure PHP:**
   - Open: `C:\xampp\php\php.ini`
   - Find: `;curl.cainfo =`
   - Change to: `curl.cainfo = "C:\xampp\php\cacert.pem"`
   - Find: `;openssl.cafile=`
   - Change to: `openssl.cafile = "C:\xampp\php\cacert.pem"`
   - Save and restart Apache

3. **Run Composer:**
   ```bash
   cd C:\xampp\htdocs\linknest
   php composer.phar install
   ```

## Option 3: Use Git (If Available)

If you have Git installed:

```bash
cd C:\xampp\htdocs\linknest\vendor
git clone https://github.com/onelogin/php-saml.git onelogin/php-saml
```

## Verification

After installation, verify by checking:

```bash
# Check if files exist
dir vendor\onelogin\php-saml\src\OneLogin\Saml2\Auth.php
```

If the file exists, the SAML endpoint should work!
