<?php
// scripts/ldap_debug.php
// Run this script from the command line: php scripts/ldap_debug.php <username> <password>

require_once __DIR__ . '/../api/config.php';

// Configuration from user request
$config = [
    'ldap_enabled' => '1',
    'ldap_server' => 'WIN-VTAHCVFA182.oneflorida.org',
    'ldap_port' => '389',
    'ldap_protocol' => 'ldap',
    'ldap_base_dn' => 'DC=oneflorida,DC=org',
    'ldap_user_search_base' => 'CN=Users,DC=oneflorida,DC=org',
    'ldap_user_filter' => '(sAMAccountName={username})',
    'ldap_user_attributes' => 'sAMAccountName,userPrincipalName,mail,displayName,givenName,sn,memberOf',
    'ldap_bind_dn' => '', // Fill this if needed
    'ldap_bind_password' => '', // Fill this if needed
    'ldap_timeout' => '30',
    'ldap_tls' => '0'
];

// Override with DB settings if available
try {
    $db = getDB();
    $stmt = $db->prepare("SELECT key, value FROM settings WHERE key LIKE 'ldap_%'");
    $stmt->execute();
    $dbSettings = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);
    if (!empty($dbSettings)) {
        echo "Loaded settings from database.\n";
        $config = array_merge($config, $dbSettings);
    } else {
        echo "Using default configuration from script.\n";
    }
} catch (Exception $e) {
    echo "Warning: Could not load settings from DB: " . $e->getMessage() . "\n";
}

if ($argc < 3) {
    echo "Usage: php scripts/ldap_debug.php <username> <password>\n";
    echo "Current Config:\n";
    print_r($config);
    exit(1);
}

$username = $argv[1];
$password = $argv[2];

echo "\nTesting LDAP Login for user: $username\n";
echo "----------------------------------------\n";

if (!extension_loaded('ldap')) {
    die("Error: PHP LDAP extension is not loaded.\n");
}

$server = $config['ldap_server'];
$port = (int)$config['ldap_port'];
$protocol = $config['ldap_protocol'];
$tls = !empty($config['ldap_tls']);
$timeout = (int)$config['ldap_timeout'];

$prefix = $protocol === 'ldaps' ? 'ldaps://' : 'ldap://';
$uri = $prefix . $server . ':' . $port;

echo "1. Connecting to $uri... ";
$ldap = @ldap_connect($uri);
if (!$ldap) {
    die("Failed.\n");
}
echo "OK.\n";

ldap_set_option($ldap, LDAP_OPT_PROTOCOL_VERSION, 3);
ldap_set_option($ldap, LDAP_OPT_REFERRALS, 0);
ldap_set_option($ldap, LDAP_OPT_NETWORK_TIMEOUT, $timeout);

if ($tls && $protocol !== 'ldaps') {
    echo "2. Starting TLS... ";
    if (!@ldap_start_tls($ldap)) {
        die("Failed: " . ldap_error($ldap) . "\n");
    }
    echo "OK.\n";
}

// Bind
$bindDn = $config['ldap_bind_dn'];
$bindPass = $config['ldap_bind_password'];

echo "3. Binding (Service/Anonymous)... ";
if ($bindDn && $bindPass) {
    echo "Using DN: $bindDn ... ";
    $bound = @ldap_bind($ldap, $bindDn, $bindPass);
} else {
    echo "Anonymous ... ";
    $bound = @ldap_bind($ldap);
}

if (!$bound) {
    die("Failed: " . ldap_error($ldap) . "\n");
}
echo "OK.\n";

// Search
echo "4. Searching for user... ";
$searchBase = $config['ldap_user_search_base'];
$filter = str_replace('{username}', $username, $config['ldap_user_filter']);
$attributes = explode(',', $config['ldap_user_attributes']);
$attributes = array_map('trim', $attributes);

echo "Base: $searchBase, Filter: $filter ... ";

$result = @ldap_search($ldap, $searchBase, $filter, $attributes);
if (!$result) {
    die("Search Failed: " . ldap_error($ldap) . "\n");
}

$entries = ldap_get_entries($ldap, $result);
echo "Found " . $entries['count'] . " entries.\n";

if ($entries['count'] === 0) {
    die("User not found.\n");
}

$userEntry = $entries[0];
$userDn = $userEntry['dn'];
echo "   User DN: $userDn\n";

// Bind as User
echo "5. Verifying Password (Binding as user)... ";
$userBind = @ldap_bind($ldap, $userDn, $password);

if ($userBind) {
    echo "SUCCESS!\n";
    echo "User authenticated successfully.\n";
    
    echo "\nUser Attributes:\n";
    foreach ($attributes as $attr) {
        if (isset($userEntry[strtolower($attr)])) {
            $val = $userEntry[strtolower($attr)];
            if (is_array($val)) {
                unset($val['count']);
                echo "$attr: " . implode(', ', $val) . "\n";
            } else {
                echo "$attr: $val\n";
            }
        }
    }
} else {
    echo "FAILED.\n";
    echo "Error: " . ldap_error($ldap) . "\n";
}

@ldap_close($ldap);
echo "\nDone.\n";
