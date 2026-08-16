LinkNest vanilla Apache + PHP __PHP_VERSION__ runtime
=====================================================

Extract this ZIP to D:\  so you have:
  D:\Apache\
  D:\php\
  D:\install-runtime.bat
  D:\README.txt

On the target PC (Administrator):
  1. Install Visual C++ Redistributable 2015-2022 x64
     https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist
  2. Extract this ZIP to D:\
  3. Right-click install-runtime.bat -> Run as administrator
  4. Copy the LinkNest app into D:\Apache\htdocs\linknest
     (keep the existing data\ and uploads\ folders)
  5. Open http://localhost/linknest/

Notes
-----
* httpd.conf and php.ini are already set for D:\Apache and D:\php.
* Service name is Apache24-LinkNest so it does not clash with XAMPP Apache2.4.
* If port 80 is taken, stop the other Apache or change Listen in D:\Apache\conf\httpd.conf.
* Full written guide: docs/VANILLA_APACHE_PHP85_WINDOWS.md (also Help and About -> Guides).
