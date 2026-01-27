<?php
/**
 * Autoloader for OneLogin PHP-SAML, Doctrine DBAL and dependencies
 * 
 * Supports both old-style classes (OneLogin_Saml2_*) and namespace classes (OneLogin\Saml2\*)
 * and Doctrine\DBAL, Doctrine\Deprecations, Doctrine\Common (event-manager)
 */

$vendorDir = __DIR__;

// Doctrine: deprecations, event-manager, dbal (order matters)
$doctrineDeprecations = $vendorDir . '/doctrine/deprecations-1.0.0/lib/Doctrine/Deprecations';
$doctrineEventManager = $vendorDir . '/doctrine/event-manager-1.2.0/src';
$doctrineDbal = $vendorDir . '/doctrine/dbal/src';
if (is_dir($doctrineDeprecations)) {
    spl_autoload_register(function ($class) use ($doctrineDeprecations) {
        if (strpos($class, 'Doctrine\\Deprecations\\') !== 0) return false;
        $file = $doctrineDeprecations . '/' . str_replace('\\', '/', substr($class, strlen('Doctrine\\Deprecations\\'))) . '.php';
        if (file_exists($file)) { require $file; return true; }
        return false;
    });
}
if (is_dir($doctrineEventManager)) {
    spl_autoload_register(function ($class) use ($doctrineEventManager) {
        if (strpos($class, 'Doctrine\\Common\\') !== 0) return false;
        $file = $doctrineEventManager . '/' . str_replace('\\', '/', substr($class, strlen('Doctrine\\Common\\'))) . '.php';
        if (file_exists($file)) { require $file; return true; }
        return false;
    });
}
if (is_dir($doctrineDbal)) {
    spl_autoload_register(function ($class) use ($doctrineDbal) {
        if (strpos($class, 'Doctrine\\DBAL\\') !== 0) return false;
        $file = $doctrineDbal . '/' . str_replace('\\', '/', substr($class, strlen('Doctrine\\DBAL\\'))) . '.php';
        if (file_exists($file)) { require $file; return true; }
        return false;
    });
}

$oneloginLibPath = $vendorDir . '/onelogin/php-saml/lib';
$oneloginSrcPath = $vendorDir . '/onelogin/php-saml/src';

// Try to load from src first (newer namespace-based version)
if (is_dir($oneloginSrcPath)) {
    // Namespace-based autoloader for newer versions
    spl_autoload_register(function ($class) use ($oneloginSrcPath) {
        if (strpos($class, 'OneLogin\\Saml2\\') === 0) {
            $relativeClass = substr($class, strlen('OneLogin\\Saml2\\'));
            $file = $oneloginSrcPath . '/OneLogin/Saml2/' . str_replace('\\', '/', $relativeClass) . '.php';
            
            if (file_exists($file)) {
                require $file;
                return true;
            }
        }
        return false;
    });
}

// Also support old-style class names (OneLogin_Saml2_*) and create namespace aliases
if (is_dir($oneloginLibPath)) {
    // Map old class names to namespace classes
    $classMap = [
        'OneLogin\\Saml2\\Auth' => 'OneLogin_Saml2_Auth',
        'OneLogin\\Saml2\\Settings' => 'OneLogin_Saml2_Settings',
        'OneLogin\\Saml2\\Utils' => 'OneLogin_Saml2_Utils',
        'OneLogin\\Saml2\\Response' => 'OneLogin_Saml2_Response',
        'OneLogin\\Saml2\\LogoutRequest' => 'OneLogin_Saml2_LogoutRequest',
        'OneLogin\\Saml2\\LogoutResponse' => 'OneLogin_Saml2_LogoutResponse',
    ];
    
    // Load lib files and create class aliases
    $libFiles = [
        'Saml2/Auth.php' => ['OneLogin_Saml2_Auth', 'OneLogin\\Saml2\\Auth'],
        'Saml2/Settings.php' => ['OneLogin_Saml2_Settings', 'OneLogin\\Saml2\\Settings'],
        'Saml2/Utils.php' => ['OneLogin_Saml2_Utils', 'OneLogin\\Saml2\\Utils'],
        'Saml2/Response.php' => ['OneLogin_Saml2_Response', 'OneLogin\\Saml2\\Response'],
        'Saml2/LogoutRequest.php' => ['OneLogin_Saml2_LogoutRequest', 'OneLogin\\Saml2\\LogoutRequest'],
        'Saml2/LogoutResponse.php' => ['OneLogin_Saml2_LogoutResponse', 'OneLogin\\Saml2\\LogoutResponse'],
    ];
    
    foreach ($libFiles as $file => $classes) {
        $fullPath = $oneloginLibPath . '/' . $file;
        if (file_exists($fullPath)) {
            require_once $fullPath;
            // Create namespace alias if old class exists
            if (class_exists($classes[0]) && !class_exists($classes[1])) {
                class_alias($classes[0], $classes[1]);
            }
        }
    }
    
    // Also require any other files in lib/Saml2
    $saml2Dir = $oneloginLibPath . '/Saml2';
    if (is_dir($saml2Dir)) {
        $files = glob($saml2Dir . '/*.php');
        foreach ($files as $file) {
            if (!in_array(basename($file), ['Auth.php', 'Settings.php', 'Utils.php', 'Response.php', 'LogoutRequest.php', 'LogoutResponse.php'])) {
                require_once $file;
            }
        }
    }
    
    // Load xmlseclibs from extlib if it exists
    $xmlseclibsPath = dirname($oneloginLibPath) . '/extlib/xmlseclibs';
    if (is_dir($xmlseclibsPath)) {
        $xmlseclibsFiles = glob($xmlseclibsPath . '/*.php');
        foreach ($xmlseclibsFiles as $file) {
            require_once $file;
        }
    }
}

// Also try to load xmlseclibs from robrichards/xmlseclibs if available
$robrichardsXmlseclibs = $vendorDir . '/robrichards/xmlseclibs';
if (is_dir($robrichardsXmlseclibs)) {
    // Try src directory first
    $srcPath = $robrichardsXmlseclibs . '/src';
    if (is_dir($srcPath)) {
        $xmlseclibsFiles = glob($srcPath . '/**/*.php');
        foreach ($xmlseclibsFiles as $file) {
            require_once $file;
        }
    } else {
        // Try root directory
        $xmlseclibsFiles = glob($robrichardsXmlseclibs . '/*.php');
        foreach ($xmlseclibsFiles as $file) {
            require_once $file;
        }
        // Also try subdirectories
        $subdirs = glob($robrichardsXmlseclibs . '/*', GLOB_ONLYDIR);
        foreach ($subdirs as $subdir) {
            $files = glob($subdir . '/*.php');
            foreach ($files as $file) {
                require_once $file;
            }
        }
    }
}
