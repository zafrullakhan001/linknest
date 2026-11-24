<?php
/**
 * Configure Mercury Email Domain for Testing
 * 
 * This script provides instructions and can help configure Mercury
 * for local email testing with your LinkNest application.
 */

echo "====================================================\n";
echo "Mercury Email Server Configuration Helper\n";
echo "====================================================\n\n";

echo "The error '550 Address not known here' means Mercury doesn't recognize\n";
echo "the recipient email address.\n\n";

echo "SOLUTION OPTIONS:\n\n";

echo "OPTION 1: Use Mercury Web Interface (Recommended)\n";
echo "--------------------------------------------\n";
echo "1. Open XAMPP Control Panel\n";
echo "2. Click 'Admin' button next to Mercury (or visit http://localhost/mail/)\n";
echo "3. Go to 'Configuration' -> 'Manage Local Domains'\n";
echo "4. Add 'localhost.com' to the local domains list\n";
echo "5. Go to 'Manage Users' and create a user: 'zafar@localhost.com'\n";
echo "   - Username: zafar\n";
echo "   - Password: (set any password, not needed for SMTP)\n";
echo "   - Domain: localhost.com\n\n";

echo "OPTION 2: Use Simple Localhost Domain\n";
echo "--------------------------------------\n";
echo "Change your user email in LinkNest to use '@localhost' instead of '@localhost.com'\n";
echo "Mercury typically accepts '@localhost' by default.\n\n";

echo "OPTION 3: Manual Mercury Configuration\n";
echo "---------------------------------------\n";
echo "Edit Mercury configuration file:\n";
echo "Location: C:\\xampp\\mercury\\mercury.ini\n\n";
echo "In the [Domains] section, ensure 'localhost.com' is listed:\n";
echo "[Domains]\n";
echo "localhost\n";
echo "localhost.com\n\n";

echo "Then restart Mercury in XAMPP Control Panel.\n\n";

echo "====================================================\n";
echo "QUICK TEST:\n";
echo "====================================================\n";
echo "After configuring Mercury, test by sending an email to:\n";
echo "- zafar@localhost (if using option 2)\n";
echo "- zafar@localhost.com (if using option 1 or 3)\n\n";

echo "Note: For local testing, Mercury stores emails in:\n";
echo "C:\\xampp\\mercury\\mail\\\n\n";

echo "You can view received emails using Mercury's web interface at:\n";
echo "http://localhost/mail/\n\n";
