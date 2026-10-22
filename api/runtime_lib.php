<?php
/**
 * Runtime (underlying software) visibility library — PHP / Node.js / npm / Apache / SQLite.
 *
 * Reports what this host is running, compares it with the official vendor indexes
 * (downloads.php.net, nodejs.org, php.net) and returns copy-paste command lines for
 * the operator. This library is deliberately READ-ONLY / ADVISORY:
 *
 *   - never upgrades, installs or removes anything
 *   - never writes to a PHP / Node / Apache / SQLite installation
 *   - never touches php.ini, httpd.conf, data/, uploads/ or dist/
 *   - the only file it writes is its own cache: data/runtime-cache.json
 *   - the only child processes it starts are read-only version probes
 *     (node -v, node -p process.arch, npm -v, httpd -v, git --version)
 *   - outbound network is GET-only against RUNTIME_HOST_ALLOWLIST
 *
 * Endpoint: api/runtime.php (admin only).  Guide: docs/RUNTIME_UPDATES.md
 */

if (!defined('RUNTIME_PROJECT_ROOT')) {
    define('RUNTIME_PROJECT_ROOT', realpath(__DIR__ . '/..') ?: dirname(__DIR__));
}

if (!defined('RUNTIME_CACHE_FILE')) {
    define('RUNTIME_CACHE_FILE', RUNTIME_PROJECT_ROOT . '/data/runtime-cache.json');
}
if (!defined('RUNTIME_CACHE_TTL')) {
    /** Vendor indexes move slowly; 6 hours keeps the panel responsive and polite. */
    define('RUNTIME_CACHE_TTL', 21600);
}
if (!defined('RUNTIME_DEFAULT_CHECK_INTERVAL')) {
    define('RUNTIME_DEFAULT_CHECK_INTERVAL', 360);
}
if (!defined('RUNTIME_HTTP_TIMEOUT')) {
    define('RUNTIME_HTTP_TIMEOUT', 20);
}
if (!defined('RUNTIME_HTTP_MAX_BYTES')) {
    define('RUNTIME_HTTP_MAX_BYTES', 8388608);
}

/** GET-only allowlist — anything else is refused before a socket is opened. */
const RUNTIME_HOST_ALLOWLIST = [
    'downloads.php.net',
    'www.php.net',
    'php.net',
    'nodejs.org',
];

/** Extensions LinkNest needs from PHP (see health.php / docs/SETUP.md). */
const RUNTIME_REQUIRED_PHP_EXTENSIONS = [
    'pdo_sqlite',
    'sqlite3',
    'curl',
    'mbstring',
    'openssl',
    'zip',
];

/** Reported separately because Windows PHP 8.5+ often builds OPcache in. */
const RUNTIME_OPTIONAL_PHP_EXTENSIONS = ['ldap', 'Zend OPcache', 'gd', 'intl', 'imagick'];

function runtimeIsWindows(): bool
{
    return PHP_OS_FAMILY === 'Windows';
}

function runtimeProjectRoot(): string
{
    return RUNTIME_PROJECT_ROOT;
}

/**
 * Docker / container detection (mirrors api/updater_lib.php without requiring it).
 */
function runtimeIsDocker(): bool
{
    if (getenv('LINKNEST_DOCKER') === '1' || getenv('SSH_GATEWAY_DOCKER') === '1') {
        return true;
    }
    if (runtimeIsWindows()) {
        return false;
    }
    if (@is_file('/.dockerenv')) {
        return true;
    }
    $identity = RUNTIME_PROJECT_ROOT . '/data/install_identity.php';
    if (is_file($identity)) {
        $raw = (string)@file_get_contents($identity);
        if (preg_match("/define\\('LINKNEST_INSTALL_FOLDER',\\s*'docker'\\)/", $raw)) {
            return true;
        }
    }
    if (is_readable('/proc/1/cgroup')) {
        $cgroup = (string)@file_get_contents('/proc/1/cgroup');
        if ($cgroup !== ''
            && (stripos($cgroup, 'docker') !== false
                || stripos($cgroup, 'containerd') !== false
                || stripos($cgroup, 'kubepods') !== false)) {
            return true;
        }
    }
    return false;
}

/* =========================================================================
 * Platform detection — Linux / macOS / Windows / Docker
 *
 * Everything below is read-only: it parses /etc/os-release, walks PATH and
 * /proc, and runs version probes. Nothing is installed or written.
 * ====================================================================== */

/** Distro shape used by the simulation profiles below. */
function runtimeSimulatedDistro(string $family, string $id, string $pretty, string $version, string $manager): array
{
    return [
        'id' => $id,
        'name' => $pretty,
        'pretty' => $pretty,
        'version' => $version,
        'codename' => '',
        'family' => $family,
        'packageManager' => $manager,
        'packageManagerNote' => 'Simulated ' . $manager . ' host (LINKNEST_RUNTIME_SIMULATE).',
        'serviceManager' => $family === 'windows' ? 'sc' : 'systemctl',
        'elevation' => $family === 'darwin' ? 'sudo (or run as root)' : 'root or sudo',
        'known' => true,
        'simulated' => true,
    ];
}

/** Named simulation profiles — see runtimeSimulation(). */
function runtimeSimulationPresets(): array
{
    return [
        'windows-xampp' => ['platform' => 'windows-xampp', 'osFamily' => 'Windows', 'webServer' => 'apache', 'phpVersion' => '8.5.4'],
        'windows-vanilla' => ['platform' => 'windows-vanilla', 'osFamily' => 'Windows', 'webServer' => 'apache', 'phpVersion' => '8.5.4'],
        'linux-debian' => [
            'platform' => 'linux-debian',
            'osFamily' => 'Linux',
            'webServer' => 'both',
            'phpVersion' => '8.5.4',
            'distro' => runtimeSimulatedDistro('debian', 'debian', 'Debian GNU/Linux 12 (bookworm)', '12', 'apt-get'),
        ],
        'linux-nginx' => [
            'platform' => 'linux-debian',
            'osFamily' => 'Linux',
            'webServer' => 'nginx',
            'phpVersion' => '8.5.4',
            'distro' => runtimeSimulatedDistro('debian', 'ubuntu', 'Ubuntu 22.04.4 LTS', '22.04', 'apt-get'),
        ],
        'linux-apache' => [
            'platform' => 'linux-debian',
            'osFamily' => 'Linux',
            'webServer' => 'apache',
            'phpVersion' => '8.5.4',
            'distro' => runtimeSimulatedDistro('debian', 'ubuntu', 'Ubuntu 22.04.4 LTS', '22.04', 'apt-get'),
        ],
        'linux-none' => [
            'platform' => 'linux-debian',
            'osFamily' => 'Linux',
            'webServer' => 'none',
            'phpVersion' => '8.5.4',
            'distro' => runtimeSimulatedDistro('debian', 'debian', 'Debian GNU/Linux 12 (bookworm)', '12', 'apt-get'),
        ],
        'linux-rhel' => [
            'platform' => 'linux-rhel',
            'osFamily' => 'Linux',
            'webServer' => 'apache',
            'phpVersion' => '8.4.20',
            'distro' => runtimeSimulatedDistro('rhel', 'rocky', 'Rocky Linux 9.4 (Blue Onyx)', '9.4', 'dnf'),
        ],
        'linux-alpine' => [
            'platform' => 'linux-alpine',
            'osFamily' => 'Linux',
            'webServer' => 'nginx',
            'phpVersion' => '8.3.24',
            'distro' => runtimeSimulatedDistro('alpine', 'alpine', 'Alpine Linux v3.20', '3.20', 'apk'),
        ],
        'linux-suse' => [
            'platform' => 'linux-suse',
            'osFamily' => 'Linux',
            'webServer' => 'apache',
            'phpVersion' => '8.4.10',
            'distro' => runtimeSimulatedDistro('suse', 'opensuse-leap', 'openSUSE Leap 15.6', '15.6', 'zypper'),
        ],
        'macos' => [
            'platform' => 'macos',
            'osFamily' => 'Darwin',
            'webServer' => 'none',
            'phpVersion' => '8.5.4',
            'distro' => runtimeSimulatedDistro('darwin', 'macos', 'macOS 14 (Sonoma)', '14', 'brew'),
        ],
        'docker' => [
            'platform' => 'docker',
            'osFamily' => 'Linux',
            'webServer' => 'apache',
            'docker' => true,
            'phpVersion' => '8.4.14',
            'distro' => runtimeSimulatedDistro('debian', 'debian', 'Debian GNU/Linux 12 (bookworm, container)', '12', 'apt-get'),
        ],
    ];
}

/**
 * Dev/QA simulation — render another platform's guidance without touching the host.
 *
 *   LINKNEST_RUNTIME_SIMULATE=linux-nginx          (preset name)
 *   LINKNEST_RUNTIME_SIMULATE='{"platform":"linux-debian","webServer":"nginx"}'
 *
 * Read-only by construction: it only changes what the panel *reports* and which
 * copy-paste commands are generated. The payload flags it (`platform.simulation.active`)
 * so the UI shows a "simulated" banner instead of pretending it is real.
 *
 * @return array<string, mixed>
 */
function runtimeSimulation(): array
{
    static $resolved = null;
    if (is_array($resolved)) {
        return $resolved;
    }
    $resolved = [
        'active' => false,
        'profile' => null,
        'osFamily' => null,
        'webServer' => null,
        'docker' => null,
        'phpVersion' => null,
        'sapi' => null,
        'distro' => null,
    ];

    $raw = trim((string)getenv('LINKNEST_RUNTIME_SIMULATE'));
    if ($raw === '') {
        return $resolved;
    }

    $presets = runtimeSimulationPresets();
    $presetKey = strtolower($raw);
    if (isset($presets[$presetKey])) {
        $resolved['profile'] = $presetKey;
        $raw = (string)json_encode($presets[$presetKey]);
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return $resolved;
    }

    $resolved['active'] = true;
    if (!empty($decoded['platform']) && is_string($decoded['platform'])) {
        $key = strtolower($decoded['platform']);
        $resolved['profile'] = $resolved['profile'] ?? $key;
        if (isset($presets[$key])) {
            foreach ($presets[$key] as $presetField => $presetValue) {
                if (!array_key_exists($presetField, $decoded)) {
                    $decoded[$presetField] = $presetValue;
                }
            }
        }
    }
    if (!empty($decoded['osFamily']) && is_string($decoded['osFamily'])) {
        $family = ucfirst(strtolower($decoded['osFamily']));
        $resolved['osFamily'] = in_array($family, ['Windows', 'Linux', 'Darwin'], true) ? $family : null;
    }
    if (!empty($decoded['webServer']) && is_string($decoded['webServer'])) {
        $server = strtolower($decoded['webServer']);
        $resolved['webServer'] = in_array($server, ['nginx', 'apache', 'both', 'none', 'caddy'], true) ? $server : null;
    }
    if (array_key_exists('docker', $decoded)) {
        $resolved['docker'] = (bool)$decoded['docker'];
    }
    if (!empty($decoded['phpVersion']) && is_string($decoded['phpVersion'])) {
        $resolved['phpVersion'] = runtimeNormalizeVersion($decoded['phpVersion']);
    }
    if (!empty($decoded['sapi']) && is_string($decoded['sapi'])) {
        $resolved['sapi'] = $decoded['sapi'];
    }
    if (!empty($decoded['distro']) && is_array($decoded['distro'])) {
        $resolved['distro'] = $decoded['distro'];
    }

    return $resolved;
}

/** Simulation-aware platform family — Windows rules only apply when this is 'Windows'. */
function runtimeIsWindowsEffective(): bool
{
    $sim = runtimeSimulation();
    return $sim['osFamily'] !== null ? $sim['osFamily'] === 'Windows' : runtimeIsWindows();
}

/** Simulation-aware container detection. */
function runtimeIsDockerEffective(): bool
{
    $sim = runtimeSimulation();
    return $sim['docker'] !== null ? (bool)$sim['docker'] : runtimeIsDocker();
}

/** Parse /etc/os-release (or /usr/lib/os-release). Read-only. */
function runtimeOsRelease(): array
{
    foreach (['/etc/os-release', '/usr/lib/os-release'] as $file) {
        if (!@is_readable($file)) {
            continue;
        }
        $raw = (string)@file_get_contents($file);
        if (trim($raw) === '') {
            continue;
        }
        $data = [];
        foreach (preg_split('/\r\n|\n|\r/', $raw) ?: [] as $line) {
            $line = trim($line);
            if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) {
                continue;
            }
            [$key, $value] = explode('=', $line, 2);
            $key = trim($key);
            $value = trim(trim($value), "\"'");
            if ($key !== '') {
                $data[$key] = $value;
            }
        }
        if ($data !== []) {
            return $data;
        }
    }
    return [];
}

/**
 * Distribution / package-manager detection so Linux and macOS hosts get commands
 * that actually exist there (apt, dnf, yum, apk, zypper, pacman, brew).
 *
 * @return array<string, mixed>
 */
function runtimeDetectDistro(): array
{
    static $memo = null;
    if (is_array($memo)) {
        return $memo;
    }
    $sim = runtimeSimulation();
    if (is_array($sim['distro'])) {
        return $memo = $sim['distro'] + ['simulated' => true, 'known' => true];
    }

    if (runtimeIsWindowsEffective()) {
        return $memo = [
            'id' => 'windows',
            'name' => 'Windows (' . PHP_OS . ')',
            'pretty' => 'Windows ' . php_uname('r'),
            'version' => php_uname('r'),
            'codename' => null,
            'family' => 'windows',
            'packageManager' => 'winget',
            'packageManagerNote' => 'Windows: the bundled PowerShell scripts / winget handle the swap.',
            'serviceManager' => 'sc',
            'elevation' => 'Administrator shell',
            'known' => true,
        ];
    }

    if (PHP_OS_FAMILY === 'Darwin') {
        return $memo = [
            'id' => 'macos',
            'name' => 'macOS',
            'pretty' => 'macOS ' . php_uname('r'),
            'version' => php_uname('r'),
            'codename' => null,
            'family' => 'darwin',
            'packageManager' => 'brew',
            'packageManagerNote' => 'Homebrew keeps PHP, nginx and Apache under /opt/homebrew or /usr/local.',
            'serviceManager' => 'launchctl',
            'elevation' => 'sudo (or run as root)',
            'known' => true,
        ];
    }

    $release = runtimeOsRelease();
    $id = strtolower((string)($release['ID'] ?? ''));
    $like = strtolower((string)($release['ID_LIKE'] ?? ''));
    $haystack = trim($id . ' ' . $like);

    $family = 'unknown';
    if ($id === 'alpine' || str_contains($haystack, 'alpine')) {
        $family = 'alpine';
    } elseif (preg_match('/\b(debian|ubuntu|raspbian|linuxmint|pop|kali|zorin|elementary|devuan|neon)\b/', $haystack)) {
        $family = 'debian';
    } elseif (preg_match('/\b(rhel|redhat|centos|rocky|almalinux|alma|fedora|oracle|ol|amzn|scientific|cloudlinux)\b/', $haystack)) {
        $family = 'rhel';
    } elseif (preg_match('/\b(suse|opensuse|sles)\b/', $haystack)) {
        $family = 'suse';
    } elseif (preg_match('/\b(arch|manjaro|endeavouros|garuda)\b/', $haystack)) {
        $family = 'arch';
    }

    $manager = runtimePackageManagerForFamily($family);

    return $memo = [
        'id' => $id !== '' ? $id : 'linux',
        'name' => (string)($release['NAME'] ?? ($id !== '' ? $id : 'Linux')),
        'pretty' => (string)($release['PRETTY_NAME'] ?? ($release['NAME'] ?? 'Linux')),
        'version' => (string)($release['VERSION_ID'] ?? ''),
        'codename' => (string)($release['VERSION_CODENAME'] ?? ''),
        'family' => $family,
        'packageManager' => $manager['manager'],
        'packageManagerNote' => $manager['note'],
        'serviceManager' => 'systemctl',
        'elevation' => 'root or sudo',
        'known' => $family !== 'unknown',
        'osRelease' => $release,
    ];
}

/**
 * Pick the package manager that is actually installed on this host.
 *
 * @return array{manager:string,note:string}
 */
function runtimePackageManagerForFamily(string $family): array
{
    $preference = [
        'debian' => ['apt-get', 'apt'],
        'rhel' => ['dnf', 'yum', 'microdnf'],
        'suse' => ['zypper'],
        'alpine' => ['apk'],
        'arch' => ['pacman'],
        'darwin' => ['brew'],
    ];
    $order = $preference[$family] ?? ['apt-get', 'dnf', 'yum', 'zypper', 'apk', 'pacman', 'brew'];
    foreach ($order as $candidate) {
        if (runtimeFindExecutable([$candidate]) !== null) {
            return ['manager' => $candidate, 'note' => 'Detected `' . $candidate . '` on this host.'];
        }
    }
    return [
        'manager' => $order[0] ?? 'unknown',
        'note' => 'Package manager assumed from the distribution family (' . $family . ').',
    ];
}

/** PATH directories plus the usual system bin dirs — no `which` required. */
function runtimePathDirs(): array
{
    $dirs = [];
    $path = (string)getenv('PATH');
    $separator = runtimeIsWindowsEffective() ? ';' : ':';
    foreach (explode($separator, $path) as $dir) {
        $dir = trim($dir, " \t\"'");
        if ($dir !== '') {
            $dirs[$dir] = true;
        }
    }
    $extra = runtimeIsWindowsEffective()
        ? [
            'C:\\xampp\\php',
            'C:\\xampp\\apache\\bin',
            'C:\\xampp\\mysql\\bin',
            'C:\\Program Files\\nodejs',
            'C:\\ProgramData\\chocolatey\\bin',
            'D:\\php',
            'D:\\Apache\\bin',
        ]
        : [
            '/usr/local/sbin',
            '/usr/local/bin',
            '/usr/sbin',
            '/usr/bin',
            '/sbin',
            '/bin',
            '/opt/bin',
            '/snap/bin',
            '/opt/homebrew/bin',
            '/opt/homebrew/sbin',
            '/usr/local/php/bin',
            '/usr/local/opt/php/sbin',
            '/opt/nodejs/bin',
            '/usr/local/node/bin',
            '/usr/local/nginx/sbin',
            '/opt/nginx/sbin',
            '/usr/local/caddy',
        ];
    foreach ($extra as $dir) {
        $dirs[$dir] = true;
    }
    return array_keys($dirs);
}

/**
 * Resolve an executable by walking PATH — works in slim containers where
 * `which`/`where` are missing (needs no child process at all).
 *
 * @param list<string> $names bare names or absolute paths
 */
function runtimeFindExecutable(array $names): ?string
{
    if ($names === []) {
        return null;
    }
    $extensions = runtimeIsWindowsEffective() ? ['', '.exe', '.cmd', '.bat'] : [''];
    $dirs = null;
    foreach ($names as $name) {
        if (!is_string($name) || $name === '') {
            continue;
        }
        if (str_contains($name, '/') || str_contains($name, '\\')) {
            foreach ($extensions as $extension) {
                if (@is_file($name . $extension)) {
                    return $name . $extension;
                }
            }
            continue;
        }
        if ($dirs === null) {
            $dirs = runtimePathDirs();
        }
        foreach ($dirs as $dir) {
            foreach ($extensions as $extension) {
                $candidate = rtrim($dir, '/\\') . DIRECTORY_SEPARATOR . $name . $extension;
                if (@is_file($candidate)) {
                    return $candidate;
                }
            }
        }
    }
    return null;
}

/**
 * First readable file out of a candidate list.
 *
 * @param list<string> $paths
 */
function runtimeFirstReadable(array $paths): ?string
{
    foreach ($paths as $path) {
        if (is_string($path) && $path !== '' && @is_readable($path)) {
            return $path;
        }
    }
    return null;
}

/**
 * Names of processes currently running, limited to the ones we ask about
 * (Linux /proc only — no shell, no ps, no privileged call).
 *
 * @param list<string> $wanted lowercase process names or name prefixes
 * @return list<string>
 */
function runtimeRunningProcessNames(array $wanted, int $limit = 400): array
{
    if ($wanted === [] || PHP_OS_FAMILY !== 'Linux' || !@is_dir('/proc')) {
        return [];
    }
    $handle = @opendir('/proc');
    if ($handle === false) {
        return [];
    }
    $found = [];
    $seen = 0;
    while (($entry = readdir($handle)) !== false) {
        if ($entry === '.' || $entry === '..' || !ctype_digit($entry)) {
            continue;
        }
        if (++$seen > $limit) {
            break;
        }
        $comm = @file_get_contents('/proc/' . $entry . '/comm');
        if (!is_string($comm) || $comm === '') {
            continue;
        }
        $name = strtolower(trim($comm));
        foreach ($wanted as $want) {
            if ($name === $want || str_starts_with($name, $want)) {
                $found[$want] = true;
            }
        }
    }
    closedir($handle);
    return array_keys($found);
}

/* =========================================================================
 * Web server / PHP-FPM detection (Apache, nginx, Caddy, OpenLiteSpeed)
 * ====================================================================== */

/**
 * Candidate web servers and how to probe/talk to each of them.
 *
 * @return array<string, array<string, mixed>>
 */
function runtimeWebServerCatalog(): array
{
    return [
        'apache' => [
            'label' => 'Apache HTTP Server',
            'binaries' => ['apachectl', 'apache2', 'httpd'],
            'paths' => ['/usr/sbin/apachectl', '/usr/sbin/apache2', '/usr/sbin/httpd', '/usr/local/apache2/bin/httpd'],
            'processes' => ['apache2', 'httpd'],
            'services' => ['apache2', 'httpd'],
            'configFiles' => ['/etc/apache2/apache2.conf', '/etc/httpd/conf/httpd.conf', '/usr/local/apache2/conf/httpd.conf'],
            'versionPattern' => '#Apache/(\d+(?:\.\d+)+)#i',
            'versionCommand' => '-v',
            'configTest' => 'sudo apachectl configtest',
            'reload' => 'sudo systemctl reload apache2   # RHEL: sudo systemctl reload httpd',
            'restart' => 'sudo systemctl restart apache2   # RHEL: sudo systemctl restart httpd',
            'packages' => ['debian' => 'apache2', 'rhel' => 'httpd', 'suse' => 'apache2', 'alpine' => 'apache2', 'arch' => 'apache'],
        ],
        'nginx' => [
            'label' => 'nginx',
            'binaries' => ['nginx'],
            'paths' => ['/usr/sbin/nginx', '/usr/local/sbin/nginx', '/usr/local/nginx/sbin/nginx', '/opt/nginx/sbin/nginx'],
            'processes' => ['nginx'],
            'services' => ['nginx'],
            'configFiles' => ['/etc/nginx/nginx.conf', '/usr/local/nginx/conf/nginx.conf'],
            'versionPattern' => '#nginx/(\d+(?:\.\d+)+)#i',
            'versionCommand' => '-v',
            'configTest' => 'sudo nginx -t',
            'reload' => 'sudo systemctl reload nginx',
            'restart' => 'sudo systemctl restart nginx',
            'packages' => ['debian' => 'nginx', 'rhel' => 'nginx', 'suse' => 'nginx', 'alpine' => 'nginx', 'arch' => 'nginx'],
        ],
        'caddy' => [
            'label' => 'Caddy',
            'binaries' => ['caddy'],
            'paths' => ['/usr/bin/caddy', '/usr/local/bin/caddy'],
            'processes' => ['caddy'],
            'services' => ['caddy'],
            'configFiles' => ['/etc/caddy/Caddyfile'],
            'versionPattern' => '#v(\d+(?:\.\d+)+)#i',
            'versionCommand' => ['version'],
            'configTest' => 'caddy validate --config /etc/caddy/Caddyfile',
            'reload' => 'sudo systemctl reload caddy',
            'restart' => 'sudo systemctl restart caddy',
            'packages' => ['debian' => 'caddy', 'rhel' => 'caddy', 'suse' => 'caddy', 'alpine' => 'caddy', 'arch' => 'caddy'],
        ],
        'litespeed' => [
            'label' => 'OpenLiteSpeed',
            'binaries' => ['lshttpd'],
            'paths' => ['/usr/local/lsws/bin/lshttpd'],
            'processes' => ['lshttpd'],
            'services' => ['lsws'],
            'configFiles' => ['/usr/local/lsws/conf/httpd_config.conf'],
            'versionPattern' => '#(?:LiteSpeed|lshttpd)[/ ](\d+(?:\.\d+)+)#i',
            'versionCommand' => '-v',
            'configTest' => '/usr/local/lsws/bin/lshttpd -t',
            'reload' => 'sudo systemctl reload lsws',
            'restart' => 'sudo systemctl restart lsws',
            'packages' => [],
        ],
    ];
}

/**
 * Which web server(s) front this install? Reports **every** detected server and
 * flags ambiguity, so an nginx-only or nginx + Apache VPS still gets usable
 * commands instead of "Apache unknown".
 *
 * @return array<string, mixed>
 */
function runtimeDetectWebServers(): array
{
    static $memo = null;
    if (is_array($memo)) {
        return $memo;
    }
    $sim = runtimeSimulation();
    $catalog = runtimeWebServerCatalog();
    $processNames = runtimeRunningProcessNames(['apache2', 'httpd', 'nginx', 'caddy', 'lshttpd', 'php-fpm']);
    $detected = [];

    foreach ($catalog as $id => $row) {
        if ($sim['webServer'] !== null) {
            $wanted = $sim['webServer'] === 'both'
                ? in_array($id, ['apache', 'nginx'], true)
                : $sim['webServer'] === $id;
            if (!$wanted) {
                continue;
            }
            $detected[$id] = [
                'id' => $id,
                'label' => (string)$row['label'],
                'path' => (string)($row['paths'][0] ?? ($row['binaries'][0] ?? '')),
                'version' => null,
                'service' => (string)($row['services'][0] ?? $id),
                'processRunning' => true,
                'configFile' => (string)($row['configFiles'][0] ?? ''),
                'configTest' => (string)$row['configTest'],
                'reload' => (string)$row['reload'],
                'restart' => (string)$row['restart'],
                'packages' => is_array($row['packages'] ?? null) ? $row['packages'] : [],
                'simulated' => true,
                'known' => true,
            ];
            continue;
        }

        $path = runtimeFirstFile($row['paths']);
        if ($path === null) {
            $path = runtimeFindExecutable($row['binaries']);
        }
        $running = array_intersect($row['processes'], $processNames) !== [];
        $configFile = runtimeFirstReadable($row['configFiles']);
        if ($path === null && !$running && $configFile === null) {
            continue;
        }

        $version = null;
        $versionArgs = is_array($row['versionCommand']) ? $row['versionCommand'] : [$row['versionCommand']];
        if ($path !== null && runtimeCmdAllowed('proc_open')) {
            $output = $id === 'apache'
                ? runtimeApacheVersionOutput($path, $versionArgs)
                : runtimeRunArgv(array_merge([$path], $versionArgs), 6);
            if ($output !== '' && preg_match((string)$row['versionPattern'], $output, $matches)) {
                $version = $matches[1];
            }
        }

        $detected[$id] = [
            'id' => $id,
            'label' => (string)$row['label'],
            'path' => $path,
            'version' => $version,
            'service' => (string)($row['services'][0] ?? $id),
            'processRunning' => $running,
            'configFile' => $configFile,
            'configTest' => (string)$row['configTest'],
            'reload' => (string)$row['reload'],
            'restart' => (string)$row['restart'],
            'packages' => is_array($row['packages'] ?? null) ? $row['packages'] : [],
            'simulated' => false,
            'known' => true,
        ];
    }

    $sapi = $sim['sapi'] !== null ? (string)$sim['sapi'] : php_sapi_name();
    if (str_contains($sapi, 'apache') && isset($detected['apache'])) {
        $primary = 'apache';
    } elseif (isset($detected['nginx'])) {
        $primary = 'nginx';
    } elseif (isset($detected['apache'])) {
        $primary = 'apache';
    } elseif (isset($detected['caddy'])) {
        $primary = 'caddy';
    } elseif (isset($detected['litespeed'])) {
        $primary = 'litespeed';
    } else {
        $primary = 'none';
    }

    foreach ($detected as $id => $row) {
        $detected[$id]['role'] = $id === $primary ? 'primary' : 'also-detected';
    }

    $ambiguous = count($detected) > 1;
    $notes = [];
    if ($detected === []) {
        $notes[] = 'No Apache / nginx / Caddy binary was found and none is running — PHP is served by "'
            . $sapi . '". Patch PHP through its own package/service; the web-server block below is informational.';
    } elseif ($ambiguous) {
        $notes[] = 'More than one web server is present (' . implode(', ', array_keys($detected))
            . ') — both command sets are included; reload the one in front of the site.';
        if (isset($detected['nginx'], $detected['apache'])) {
            $notes[] = 'Typical nginx + Apache layout: nginx serves static files and proxies PHP to Apache or php-fpm.';
        }
    }

    $memo = [
        'primary' => $primary,
        'primaryLabel' => (string)($detected[$primary]['label'] ?? 'no web server detected'),
        'ambiguous' => $ambiguous,
        'sapi' => $sapi,
        'servers' => array_values($detected),
        'ids' => array_keys($detected),
        'reloadCommands' => array_values(array_map(
            static fn (array $row): string => (string)$row['reload'],
            $detected
        )),
        'notes' => $notes,
    ];

    return $memo;
}

/**
 * PHP-FPM unit/socket/package names for the installed PHP line, derived from
 * php.ini / binaries / sockets (nothing is generated blindly).
 *
 * @param array<string, mixed>|null $phpInfo
 * @return array<string, mixed>
 */
function runtimeFpmTargets(?array $phpInfo = null): array
{
    static $memo = [];
    $phpInfo = $phpInfo ?? runtimePhpInfo();
    $line = runtimeVersionLine((string)($phpInfo['version'] ?? PHP_VERSION), 2);
    if (isset($memo[$line])) {
        return $memo[$line];
    }
    $compact = str_replace('.', '', $line);
    $sim = runtimeSimulation();

    $binary = runtimeFirstFile([
        '/usr/sbin/php-fpm' . $line,
        '/usr/sbin/php-fpm' . $compact,
        '/usr/local/sbin/php-fpm',
        '/usr/sbin/php-fpm',
    ]) ?? runtimeFindExecutable(['php-fpm' . $line, 'php-fpm' . $compact, 'php-fpm']);

    $version = null;
    if ($binary !== null && runtimeCmdAllowed('proc_open')) {
        $output = runtimeRunArgv([$binary, '-v'], 6);
        if ($output !== '' && preg_match('#PHP (\d+(?:\.\d+)+)#i', $output, $matches)) {
            $version = $matches[1];
        }
    }

    $socket = runtimeFirstFile([
        '/run/php/php' . $line . '-fpm.sock',
        '/var/run/php/php' . $line . '-fpm.sock',
        '/run/php-fpm/www.sock',
        '/run/php-fpm/php-fpm.sock',
        '/var/run/php-fpm/php-fpm.sock',
        '/run/php' . $compact . '-fpm.sock',
    ]);

    $poolIni = runtimeFirstReadable([
        '/etc/php/' . $line . '/fpm/php.ini',
        '/etc/php/' . $line . '/fpm/php-fpm.conf',
        '/etc/php-fpm.d/www.conf',
        '/etc/php-fpm.conf',
    ]);

    $running = runtimeRunningProcessNames(['php-fpm']) !== [];

    $memo[$line] = [
        'installed' => $binary !== null || $poolIni !== null || $running,
        'version' => $version ?? (string)($phpInfo['version'] ?? ''),
        'line' => $line,
        'binary' => $binary,
        'service' => 'php' . $line . '-fpm',
        'serviceAlternatives' => array_values(array_filter([
            $line !== '' ? 'php' . $line . '-fpm' : null,
            $compact !== '' ? 'php-fpm' . $compact : null,
            'php-fpm',
        ])),
        'socket' => $socket,
        'poolIni' => $poolIni,
        'running' => $running,
        'reload' => 'sudo systemctl reload php' . $line . '-fpm',
        'restart' => 'sudo systemctl restart php' . $line . '-fpm',
        'status' => 'sudo systemctl status php' . $line . '-fpm',
        'logHint' => '/var/log/php' . $line . '-fpm.log (or: journalctl -u php' . $line . '-fpm)',
        'packages' => [
            'debian' => ['php' . $line . '-fpm', 'php' . $line . '-cli', 'php' . $line . '-common', 'php' . $line . '-sqlite3'],
            'rhel' => ['php-fpm', 'php-cli', 'php-pdo'],
            'suse' => ['php' . $compact . '-fpm', 'php' . $compact . '-cli'],
            'alpine' => ['php' . $line . '-fpm', 'php' . $line . '-cli', 'php' . $line . '-pdo_sqlite', 'php' . $line . '-sqlite3'],
            'arch' => ['php-fpm', 'php-sqlite'],
        ],
        'simulated' => (bool)($sim['active'] && $binary === null),
    ];

    return $memo[$line];
}

/**
 * Container facts for Docker / Podman installs (compose service names, ports,
 * where the database really lives, and the backup-first sequence).
 *
 * @return array<string, mixed>
 */
function runtimeContainerMeta(): array
{
    $isContainer = runtimeIsDockerEffective();
    $hostname = (string)@gethostname();
    $cgroup = @is_readable('/proc/self/cgroup') ? (string)@file_get_contents('/proc/self/cgroup') : '';

    $runtime = null;
    if (stripos($cgroup, 'kubepods') !== false) {
        $runtime = 'kubernetes';
    } elseif (stripos($cgroup, 'containerd') !== false) {
        $runtime = 'containerd';
    } elseif (stripos($cgroup, 'docker') !== false) {
        $runtime = 'docker';
    } elseif (@is_file('/run/.containerenv')) {
        $runtime = 'podman';
    } elseif (@is_file('/.dockerenv') || $isContainer) {
        $runtime = 'docker';
    }

    $composeFile = RUNTIME_PROJECT_ROOT . '/docker/docker-compose.yml';
    $hasCompose = @is_file($composeFile);
    $hasVolumeMounts = false;
    if ($hasCompose) {
        $rawCompose = (string)@file_get_contents($composeFile);
        foreach (preg_split('/\r\n|\n|\r/', $rawCompose) ?: [] as $line) {
            $trimmed = trim($line);
            if ($trimmed === '' || str_starts_with($trimmed, '#')) {
                continue;
            }
            if (preg_match('/^volumes:/', $trimmed)) {
                $hasVolumeMounts = true;
            }
        }
    }

    // Read the base images straight from the Dockerfile so the guidance never goes stale.
    $phpBase = null;
    $nodeBase = null;
    $dockerfile = RUNTIME_PROJECT_ROOT . '/docker/Dockerfile';
    if (@is_readable($dockerfile)) {
        $rawDockerfile = (string)@file_get_contents($dockerfile);
        if (preg_match('/^FROM\s+(php:[\w.\-]+)/mi', $rawDockerfile, $matches)) {
            $phpBase = $matches[1];
        }
        if (preg_match('/^FROM\s+(node:[\w.\-]+)/mi', $rawDockerfile, $matches)) {
            $nodeBase = $matches[1];
        }
    }

    $container = 'linknest';
    $service = 'linknest';
    $dbInContainer = '/var/www/html/data/linknest.db';
    $ports = ['http' => '8090', 'https' => '8443'];

    $notes = [];
    if ($isContainer) {
        $notes[] = 'PHP, Node.js and Apache come from the container image — patch them by rebuilding the image, '
            . 'never with an in-container package manager.';
        if (!$hasVolumeMounts && $hasCompose) {
            $notes[] = 'docker/docker-compose.yml declares no host volume mounts, so data/ and uploads/ live inside '
                . 'the container: back the database up BEFORE rebuilding and copy it back afterwards.';
        }
    }

    return [
        'isContainer' => $isContainer,
        'runtime' => $runtime,
        'id' => $hostname !== '' ? substr(str_replace('.', '', $hostname), 0, 12) : null,
        'hostname' => $hostname !== '' ? $hostname : null,
        'composeProject' => trim((string)getenv('COMPOSE_PROJECT_NAME')) ?: null,
        'composeFile' => $hasCompose ? 'docker/docker-compose.yml' : null,
        'service' => $service,
        'container' => $container,
        'volumeMounts' => $hasVolumeMounts,
        'phpBaseImage' => $phpBase,
        'nodeBaseImage' => $nodeBase,
        'ports' => $ports,
        'dbPath' => trim((string)getenv('LINKNEST_DB_PATH')) ?: (defined('DB_PATH') ? (string)DB_PATH : null),
        'dbPathInContainer' => $dbInContainer,
        'notes' => $notes,
        'commands' => [
            'backupDb' => 'docker cp ' . $container . ':' . $dbInContainer . ' ./linknest-db-backup.sqlite',
            'backupUploads' => 'docker cp ' . $container . ':/var/www/html/uploads ./linknest-uploads-backup',
            'syncOut' => 'cd docker && ./docker-sync-database.sh out   # container -> host copy',
            'rebuild' => 'docker compose -f docker/docker-compose.yml build --pull',
            'recreate' => 'docker compose -f docker/docker-compose.yml up -d',
            'deployScript' => 'cd docker && ./docker-deploy.sh   # down + build + up in one step',
            'verify' => 'docker compose -f docker/docker-compose.yml exec ' . $container . ' php -v',
            'verifyScript' => 'docker compose -f docker/docker-compose.yml exec ' . $container
                . ' /usr/local/bin/verify-php.sh',
            'healthCheck' => 'curl -s http://localhost:' . $ports['http'] . '/health.php?format=json',
            'restore' => 'docker cp ./linknest-db-backup.sqlite ' . $container . ':' . $dbInContainer
                . ' && docker compose -f docker/docker-compose.yml restart ' . $service,
            'baseImagePhp' => $phpBase,
            'baseImageNode' => $nodeBase,
        ],
    ];
}

/**
 * Reload / restart / config-test commands for a detected web server on *this*
 * distribution (Debian `apache2` vs RHEL `httpd`, Alpine openrc vs systemd, brew).
 *
 * @param array<string, mixed> $server detected web server row
 * @param array<string, mixed> $distro
 * @return array{service:string,configTest:string,reload:string,restart:string,status:string}
 */
function runtimeWebServerCommands(array $server, array $distro): array
{
    $id = (string)($server['id'] ?? '');
    $family = (string)($distro['family'] ?? '');
    $manager = (string)($distro['packageManager'] ?? '');
    $prefix = $family === 'windows' ? '' : 'sudo ';

    $service = (string)($server['service'] ?? $id);
    if ($family === 'rhel' && $id === 'apache') {
        $service = 'httpd';
    }
    if ($manager === 'brew') {
        $brewService = $id === 'nginx' ? 'nginx' : 'httpd';
        return [
            'service' => $brewService,
            'configTest' => (string)($server['configTest'] ?? ''),
            'reload' => 'brew services restart ' . $brewService,
            'restart' => 'brew services restart ' . $brewService,
            'status' => 'brew services list',
        ];
    }
    if ($manager === 'apk') {
        return [
            'service' => $service,
            'configTest' => (string)($server['configTest'] ?? ''),
            'reload' => 'sudo rc-service ' . $service . ' reload',
            'restart' => 'sudo rc-service ' . $service . ' restart',
            'status' => 'sudo rc-service ' . $service . ' status',
        ];
    }
    return [
        'service' => $service,
        'configTest' => (string)($server['configTest'] ?? ''),
        'reload' => $prefix . 'systemctl reload ' . $service,
        'restart' => $prefix . 'systemctl restart ' . $service,
        'status' => $prefix . 'systemctl status ' . $service . ' --no-pager -n 10',
    ];
}

/** Respect disable_functions before attempting a child process. */
function runtimeCmdAllowed(string $fn): bool
{
    if (!function_exists($fn)) {
        return false;
    }
    $disabled = array_filter(array_map('trim', explode(',', (string)ini_get('disable_functions'))));
    foreach ($disabled as $entry) {
        if (strcasecmp($entry, $fn) === 0) {
            return false;
        }
    }
    return true;
}

/**
 * Environment for a Windows Apache probe.
 *
 * mod_php sets AP_PARENT_PID. A nested httpd.exe treats that as "I am an mpm_winnt
 * child", reads a generation number from the parent, and exits before -v prints.
 * Dropping the variable (and putting the bin directory on PATH) lets -v run.
 *
 * @return array<string, string>|null null keeps the parent environment
 */
function runtimeWindowsProbeEnv(?string $pathPrefix): ?array
{
    if (!runtimeIsWindows()) {
        return null;
    }
    $env = getenv();
    if (!is_array($env)) {
        $env = [];
    }
    foreach (array_keys($env) as $key) {
        if (strcasecmp((string)$key, 'AP_PARENT_PID') === 0) {
            unset($env[$key]);
        }
    }
    if ($pathPrefix !== null && $pathPrefix !== '') {
        $pathKey = 'Path';
        $current = '';
        foreach ($env as $key => $value) {
            if (strcasecmp((string)$key, 'PATH') === 0) {
                $pathKey = (string)$key;
                $current = (string)$value;
                break;
            }
        }
        $env[$pathKey] = $pathPrefix . PATH_SEPARATOR . $current;
    }
    return $env;
}

/**
 * Read-only argv probe. Never uses a shell; never accepts a command string.
 *
 * @param list<string> $argv
 */
function runtimeRunArgv(array $argv, int $timeoutSec = 4, ?string $cwd = null, ?string $pathPrefix = null, bool $mergeStderr = false): string
{
    if ($argv === [] || !runtimeCmdAllowed('proc_open')) {
        return '';
    }
    // Never hand a non-existent absolute path to proc_open: on Windows that raises
    // "CreateProcess failed" warnings for simulated or absent binaries.
    $binary = (string)$argv[0];
    if ((str_contains($binary, '/') || str_contains($binary, '\\')) && !@is_file($binary)) {
        return '';
    }
    if ($cwd !== null && !@is_dir($cwd)) {
        $cwd = null;
    }
    $env = ($cwd !== null || ($pathPrefix !== null && $pathPrefix !== ''))
        ? runtimeWindowsProbeEnv($pathPrefix)
        : null;
    $descriptors = [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ];
    $proc = @proc_open($argv, $descriptors, $pipes, $cwd, $env, ['bypass_shell' => true]);
    if (!is_resource($proc)) {
        return '';
    }
    fclose($pipes[0]);
    stream_set_blocking($pipes[1], false);
    stream_set_blocking($pipes[2], false);
    $out = '';
    $err = '';
    $deadline = microtime(true) + max(1, $timeoutSec);
    while (true) {
        $status = proc_get_status($proc);
        $out .= (string)stream_get_contents($pipes[1]);
        $err .= (string)stream_get_contents($pipes[2]);
        if (!$status['running']) {
            break;
        }
        if (microtime(true) >= $deadline) {
            proc_terminate($proc);
            break;
        }
        usleep(20000);
    }
    $out .= (string)stream_get_contents($pipes[1]);
    $err .= (string)stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    proc_close($proc);
    $out = trim($out);
    $err = trim($err);
    if (!$mergeStderr) {
        return $out !== '' ? $out : $err;
    }
    if ($out === '') {
        return $err;
    }
    if ($err === '' || str_contains($out, $err)) {
        return $out;
    }
    return $out . "\n" . $err;
}

/**
 * httpd -v from the binary's own directory. On Windows the worker's AP_PARENT_PID
 * is removed so the probe is not mistaken for an Apache child.
 *
 * @param list<string> $versionArgs
 */
function runtimeApacheVersionOutput(string $path, array $versionArgs = ['-v']): string
{
    $cwd = null;
    $pathPrefix = null;
    if (runtimeIsWindowsEffective() && !runtimeSimulation()['active']) {
        $dir = dirname($path);
        if ($dir !== '' && $dir !== '.' && @is_dir($dir)) {
            $cwd = $dir;
            $pathPrefix = $dir;
        }
    }
    return runtimeRunArgv(array_merge([$path], $versionArgs), 6, $cwd, $pathPrefix, true);
}

/**
 * Locate an executable — PATH walk first (works without `which`/`where`), then a
 * read-only `where` / `which` probe as a fallback.
 */
function runtimeWhere(string $exe): ?string
{
    $found = runtimeFindExecutable([$exe]);
    if ($found !== null) {
        return $found;
    }
    if (!runtimeCmdAllowed('proc_open')) {
        return null;
    }
    $probe = runtimeIsWindows() ? ['where.exe', $exe] : ['which', $exe];
    $out = runtimeRunArgv($probe);
    if ($out === '') {
        return null;
    }
    foreach (preg_split('/\r\n|\n|\r/', $out) ?: [] as $line) {
        $line = trim($line);
        if ($line !== '' && is_file($line)) {
            return $line;
        }
    }
    return null;
}

/**
 * @param list<string> $candidates
 */
function runtimeFirstFile(array $candidates): ?string
{
    foreach ($candidates as $candidate) {
        if (is_string($candidate) && $candidate !== '' && @is_file($candidate)) {
            return $candidate;
        }
    }
    return null;
}

/**
 * Read the PE COFF machine type of a Windows EXE/DLL.
 *
 * @return 'x64'|'x86'|null
 */
function runtimePeMachine(?string $path): ?string
{
    if (!is_string($path) || $path === '' || !@is_file($path) || !@is_readable($path)) {
        return null;
    }
    $fh = @fopen($path, 'rb');
    if ($fh === false) {
        return null;
    }
    try {
        $dos = @fread($fh, 64);
        if ($dos === false || strlen($dos) < 64 || substr($dos, 0, 2) !== 'MZ') {
            return null;
        }
        $peOffset = unpack('V', substr($dos, 60, 4));
        if ($peOffset === false) {
            return null;
        }
        $e_lfanew = (int)$peOffset[1];
        if ($e_lfanew < 64 || $e_lfanew > 1048576) {
            return null;
        }
        if (@fseek($fh, $e_lfanew) !== 0) {
            return null;
        }
        $pe = @fread($fh, 6);
        if ($pe === false || strlen($pe) < 6 || substr($pe, 0, 4) !== "PE\0\0") {
            return null;
        }
        $machine = unpack('v', substr($pe, 4, 2));
        if ($machine === false) {
            return null;
        }
        $code = (int)$machine[1];
        if ($code === 0x8664) {
            return 'x64';
        }
        if ($code === 0x14c) {
            return 'x86';
        }
        return null;
    } finally {
        fclose($fh);
    }
}

function runtimeArchLabel(?string $arch): string
{
    if ($arch === 'x64') {
        return '64-bit (x64)';
    }
    if ($arch === 'x86') {
        return '32-bit (x86)';
    }
    if ($arch === 'arm64') {
        return '64-bit (arm64)';
    }
    return $arch !== null && $arch !== '' ? $arch : 'unknown';
}

function runtimeFormatBytes(int $bytes): string
{
    $bytes = max(0, $bytes);
    $units = ['B', 'KB', 'MB', 'GB', 'TB'];
    $index = 0;
    $value = (float)$bytes;
    while ($value >= 1024 && $index < count($units) - 1) {
        $value /= 1024;
        $index++;
    }
    return round($value, $index === 0 ? 0 : 2) . ' ' . $units[$index];
}

function runtimeNormalizeVersion(?string $version): string
{
    $version = trim((string)$version);
    $version = ltrim($version, 'vV');
    $version = preg_replace('/[^0-9.].*$/', '', $version) ?? '';
    return trim($version, '.');
}

/** Semantic-ish compare for dotted numeric versions. -1 / 0 / 1 */
function runtimeCompareVersions(?string $a, ?string $b): int
{
    $pa = array_map('intval', explode('.', runtimeNormalizeVersion($a)));
    $pb = array_map('intval', explode('.', runtimeNormalizeVersion($b)));
    $len = max(count($pa), count($pb));
    for ($i = 0; $i < $len; $i++) {
        $va = $pa[$i] ?? 0;
        $vb = $pb[$i] ?? 0;
        if ($va !== $vb) {
            return $va < $vb ? -1 : 1;
        }
    }
    return 0;
}

/**
 * @param array<int|string, mixed> $versions
 */
function runtimeMaxVersion(array $versions): ?string
{
    $best = null;
    foreach ($versions as $candidate) {
        if (!is_string($candidate) || $candidate === '') {
            continue;
        }
        if ($best === null || runtimeCompareVersions($candidate, $best) > 0) {
            $best = $candidate;
        }
    }
    return $best;
}

/** "8.5.11" → "8.5"; "22.19.0" → "22" (parts = 1). */
function runtimeVersionLine(?string $version, int $parts = 2): string
{
    $normalized = runtimeNormalizeVersion($version);
    if ($normalized === '') {
        return '';
    }
    $segments = explode('.', $normalized);
    return implode('.', array_slice($segments, 0, max(1, $parts)));
}

function runtimeHostAllowed(string $host): bool
{
    $host = strtolower(trim($host));
    if ($host === '') {
        return false;
    }
    foreach (RUNTIME_HOST_ALLOWLIST as $allowed) {
        if ($host === $allowed || str_ends_with($host, '.' . $allowed)) {
            return true;
        }
    }
    return false;
}

/**
 * GET-only fetch against the vendor allowlist. Never posts, never follows to another host.
 *
 * @return array{ok:bool,status:int,body:string,error:?string}
 */
function runtimeHttpGet(string $url, int $maxBytes = RUNTIME_HTTP_MAX_BYTES): array
{
    $parts = @parse_url($url);
    $host = is_array($parts) ? (string)($parts['host'] ?? '') : '';
    $scheme = is_array($parts) ? strtolower((string)($parts['scheme'] ?? '')) : '';
    if ($scheme !== 'https' || !runtimeHostAllowed($host)) {
        return ['ok' => false, 'status' => 0, 'body' => '', 'error' => 'Blocked host: ' . $host];
    }

    if (function_exists('curl_init')) {
        $ch = @curl_init($url);
        if ($ch === false) {
            return ['ok' => false, 'status' => 0, 'body' => '', 'error' => 'curl_init failed'];
        }
        $body = '';
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 3,
            CURLOPT_CONNECTTIMEOUT => 8,
            CURLOPT_TIMEOUT => RUNTIME_HTTP_TIMEOUT,
            CURLOPT_USERAGENT => 'LinkNest-RuntimeCheck/1.0 (read-only)',
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_WRITEFUNCTION => static function ($handle, $chunk) use (&$body, $maxBytes) {
                $body .= $chunk;
                if (strlen($body) > $maxBytes) {
                    return 0; // abort oversize response
                }
                return strlen($chunk);
            },
        ]);
        $ok = curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $error = $ok === false ? (string)curl_error($ch) : null;
        curl_close($ch);
        if ($ok === false) {
            return ['ok' => false, 'status' => $status, 'body' => '', 'error' => $error ?: 'request failed'];
        }
        if (strlen($body) > $maxBytes) {
            return ['ok' => false, 'status' => $status, 'body' => '', 'error' => 'Response exceeded size cap'];
        }
        if ($status < 200 || $status >= 300) {
            return ['ok' => false, 'status' => $status, 'body' => '', 'error' => 'HTTP ' . $status];
        }
        return ['ok' => true, 'status' => $status, 'body' => $body, 'error' => null];
    }

    $context = @stream_context_create([
        'http' => [
            'method' => 'GET',
            'timeout' => RUNTIME_HTTP_TIMEOUT,
            'user_agent' => 'LinkNest-RuntimeCheck/1.0 (read-only)',
            'follow_location' => 1,
            'max_redirects' => 3,
            'ignore_errors' => true,
        ],
        'ssl' => [
            'verify_peer' => true,
            'verify_peer_name' => true,
        ],
    ]);
    $body = @file_get_contents($url, false, $context, 0, $maxBytes);
    if ($body === false) {
        return ['ok' => false, 'status' => 0, 'body' => '', 'error' => 'Request failed (no curl)'];
    }
    return ['ok' => true, 'status' => 200, 'body' => (string)$body, 'error' => null];
}

/**
 * @return array{updatedAt:?int,entries:array<string,array{fetchedAt:int,value:mixed}>}
 */
function runtimeCacheRead(): array
{
    $empty = ['updatedAt' => null, 'entries' => []];
    if (!is_file(RUNTIME_CACHE_FILE)) {
        return $empty;
    }
    $raw = @file_get_contents(RUNTIME_CACHE_FILE);
    if (!is_string($raw) || $raw === '') {
        return $empty;
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return $empty;
    }
    $entries = isset($decoded['entries']) && is_array($decoded['entries']) ? $decoded['entries'] : [];
    return [
        'updatedAt' => isset($decoded['updatedAt']) ? (int)$decoded['updatedAt'] : null,
        'entries' => $entries,
    ];
}

/** The only file this feature ever writes. */
function runtimeCacheWrite(array $cache): void
{
    $dir = dirname(RUNTIME_CACHE_FILE);
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    @file_put_contents(
        RUNTIME_CACHE_FILE,
        json_encode([
            'updatedAt' => time(),
            'entries' => $cache['entries'] ?? [],
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
        LOCK_EX
    );
}

/**
 * @return array{value:mixed,fetchedAt:?int,fresh:bool}
 */
function runtimeCacheGet(string $key, int $ttl = RUNTIME_CACHE_TTL): array
{
    $cache = runtimeCacheRead();
    $entry = $cache['entries'][$key] ?? null;
    if (!is_array($entry) || !array_key_exists('value', $entry)) {
        return ['value' => null, 'fetchedAt' => null, 'fresh' => false];
    }
    $fetchedAt = isset($entry['fetchedAt']) ? (int)$entry['fetchedAt'] : null;
    $fresh = $fetchedAt !== null && (time() - $fetchedAt) < max(60, $ttl);
    return ['value' => $entry['value'], 'fetchedAt' => $fetchedAt, 'fresh' => $fresh];
}

function runtimeCachePut(string $key, $value): void
{
    $cache = runtimeCacheRead();
    $cache['entries'][$key] = ['fetchedAt' => time(), 'value' => $value];
    runtimeCacheWrite($cache);
}

function runtimeCheckIntervalMinutes(): int
{
    $seconds = RUNTIME_DEFAULT_CHECK_INTERVAL;
    if (function_exists('getDB')) {
        try {
            $db = getDB();
            $stmt = $db->prepare('SELECT value FROM settings WHERE key = ?');
            $stmt->execute(['runtime_check_interval_minutes']);
            $raw = $stmt->fetchColumn();
            if ($raw !== false && is_numeric($raw)) {
                // Stored in minutes by the settings UI; 0 disables auto checks.
                $seconds = max(60, (int)$raw * 60);
            }
        } catch (Throwable $e) {
            // Fall back to the default interval.
        }
    }
    return $seconds;
}

/** Absolute path to php.exe / php (never the Apache binary under mod_php). */
function runtimePhpBinaryPath(): ?string
{
    $candidates = [];
    if (defined('PHP_BINARY') && is_string(PHP_BINARY) && PHP_BINARY !== '') {
        if (preg_match('/^php[\d.]*(\.exe)?$/i', basename(PHP_BINARY))) {
            $candidates[] = PHP_BINARY;
        }
    }
    $ini = php_ini_loaded_file();
    if (is_string($ini) && $ini !== '') {
        $dir = dirname($ini);
        $candidates[] = $dir . DIRECTORY_SEPARATOR . (runtimeIsWindowsEffective() ? 'php.exe' : 'php');
    }
    if (runtimeIsWindowsEffective()) {
        $candidates[] = 'C:\\xampp\\php\\php.exe';
        $candidates[] = 'D:\\php\\php.exe';
        $candidates[] = 'C:\\php\\php.exe';
    } else {
        $candidates[] = '/usr/local/bin/php';
        $candidates[] = '/usr/bin/php';
    }
    $found = runtimeFirstFile($candidates);
    if ($found !== null) {
        return $found;
    }
    return runtimeWhere('php');
}

function runtimePhpFolder(): ?string
{
    $binary = runtimePhpBinaryPath();
    if ($binary !== null) {
        return dirname($binary);
    }
    $ini = php_ini_loaded_file();
    if (is_string($ini) && $ini !== '') {
        return dirname($ini);
    }
    return null;
}

function runtimeResolveIniPath(string $value, ?string $phpFolder): ?string
{
    $value = trim($value);
    if ($value === '') {
        return null;
    }
    if (preg_match('/^([A-Za-z]:[\\\\\/]|\/)/', $value)) {
        return rtrim($value, '\\/');
    }
    if ($phpFolder === null) {
        return null;
    }
    return rtrim($phpFolder, '\\/') . DIRECTORY_SEPARATOR . $value;
}

/**
 * PHP as it is actually serving this request (constants only — no child process).
 *
 * @return array<string, mixed>
 */
function runtimePhpInfo(): array
{
    $sim = runtimeSimulation();
    $binary = runtimePhpBinaryPath();
    $folder = runtimePhpFolder();
    $iniPath = php_ini_loaded_file();
    $iniPath = is_string($iniPath) && $iniPath !== '' ? $iniPath : null;

    // Simulation may preview another PHP patch level, but the real value stays visible.
    $version = $sim['phpVersion'] !== null && $sim['phpVersion'] !== '' ? (string)$sim['phpVersion'] : PHP_VERSION;
    $sapi = $sim['sapi'] !== null && $sim['sapi'] !== '' ? (string)$sim['sapi'] : php_sapi_name();

    $loaded = array_map('strtolower', get_loaded_extensions());
    $hasExtension = static function (string $ext) use ($loaded): bool {
        return in_array(strtolower($ext), $loaded, true);
    };

    $required = [];
    $missing = [];
    foreach (RUNTIME_REQUIRED_PHP_EXTENSIONS as $ext) {
        $present = $hasExtension($ext);
        $required[$ext] = $present;
        if (!$present) {
            $missing[] = $ext;
        }
    }
    $optional = [];
    foreach (RUNTIME_OPTIONAL_PHP_EXTENSIONS as $ext) {
        $optional[$ext] = $hasExtension($ext);
    }

    $extensionDirRaw = (string)ini_get('extension_dir');
    $extensionDir = runtimeResolveIniPath($extensionDirRaw, $folder);

    return [
        'version' => $version,
        'line' => runtimeVersionLine($version, 2),
        'major' => (int)explode('.', runtimeVersionLine($version, 1) !== '' ? runtimeVersionLine($version, 1) : '8')[0],
        'release' => $version,
        'zts' => defined('PHP_ZTS') ? (bool)PHP_ZTS : false,
        'arch' => PHP_INT_SIZE === 8 ? 'x64' : 'x86',
        'sapi' => $sapi,
        'binary' => $binary,
        'folder' => $folder,
        'iniPath' => $iniPath,
        'iniWritable' => $iniPath !== null && @is_writable($iniPath),
        'iniAdditional' => php_ini_scanned_files() ?: null,
        'extensionDir' => $extensionDir,
        'extensionDirRaw' => $extensionDirRaw,
        'requiredExtensions' => $required,
        'optionalExtensions' => $optional,
        'missingExtensions' => $missing,
        'loadedExtensionCount' => count($loaded),
        'memoryLimit' => (string)ini_get('memory_limit'),
        'threadSafeRequired' => runtimeIsWindowsEffective(),
        'windows' => runtimeIsWindowsEffective(),
        'simulated' => $sim['active'],
        'realVersion' => PHP_VERSION,
    ];
}

/**
 * @return list<string>
 */
function runtimeNodeCandidates(): array
{
    $candidates = [RUNTIME_PROJECT_ROOT . DIRECTORY_SEPARATOR . 'bin' . DIRECTORY_SEPARATOR . 'nodejs' . DIRECTORY_SEPARATOR . (runtimeIsWindowsEffective() ? 'node.exe' : 'bin/node')];
    if (runtimeIsWindowsEffective()) {
        $pf = getenv('ProgramFiles') ?: 'C:\\Program Files';
        $pf86 = getenv('ProgramFiles(x86)') ?: 'C:\\Program Files (x86)';
        $local = (string)getenv('LOCALAPPDATA');
        $appData = (string)getenv('APPDATA');
        $candidates[] = $pf . '\\nodejs\\node.exe';
        $candidates[] = $pf86 . '\\nodejs\\node.exe';
        if ($local !== '') {
            $candidates[] = $local . '\\Programs\\node\\node.exe';
        }
        if ($appData !== '') {
            $candidates[] = $appData . '\\nvm\\current\\node.exe';
        }
        $candidates[] = 'C:\\Program Files\\nodejs\\node.exe';
    } else {
        $candidates[] = '/usr/local/bin/node';
        $candidates[] = '/usr/bin/node';
        $candidates[] = '/opt/nodejs/bin/node';
    }
    return $candidates;
}

/** npm exposes its version in its own package.json — no child process needed. */
function runtimeNpmVersionFor(string $nodePath): ?string
{
    $nodeDir = dirname($nodePath);
    foreach ([
        $nodeDir . DIRECTORY_SEPARATOR . 'node_modules' . DIRECTORY_SEPARATOR . 'npm' . DIRECTORY_SEPARATOR . 'package.json',
        $nodeDir . DIRECTORY_SEPARATOR . '..' . DIRECTORY_SEPARATOR . 'lib' . DIRECTORY_SEPARATOR . 'node_modules' . DIRECTORY_SEPARATOR . 'npm' . DIRECTORY_SEPARATOR . 'package.json',
        '/usr/lib/node_modules/npm/package.json',
        '/usr/local/lib/node_modules/npm/package.json',
        '/usr/share/nodejs/npm/package.json',
    ] as $packageFile) {
        if (!@is_file($packageFile)) {
            continue;
        }
        $raw = @file_get_contents($packageFile);
        if (!is_string($raw) || $raw === '') {
            continue;
        }
        $decoded = json_decode($raw, true);
        if (is_array($decoded) && isset($decoded['version'])) {
            return runtimeNormalizeVersion((string)$decoded['version']);
        }
    }

    // Last resort: read-only probe (npm is a .cmd shim on Windows).
    $probe = runtimeIsWindowsEffective() ? ['cmd.exe', '/c', 'npm', '-v'] : ['npm', '-v'];
    $out = runtimeRunArgv($probe, 8);
    if (preg_match('/(\d+\.\d+\.\d+)/', $out, $m)) {
        return $m[1];
    }
    return null;
}

/**
 * Node.js runtime on this host (read-only probes: node -v, node -p process.arch).
 *
 * @return array<string, mixed>
 */
function runtimeNodeInfo(): array
{
    $path = runtimeFirstFile(runtimeNodeCandidates());
    $source = $path !== null ? 'common location' : null;
    if ($path === null) {
        $path = runtimeWhere('node');
        $source = $path !== null ? 'PATH' : null;
    }

    $info = [
        'installed' => false,
        'version' => null,
        'raw' => null,
        'line' => '',
        'major' => null,
        'arch' => null,
        'path' => $path,
        'source' => $source,
        'npmVersion' => null,
        'probeAllowed' => runtimeCmdAllowed('proc_open'),
        'error' => null,
    ];

    if ($path === null) {
        $info['error'] = runtimeCmdAllowed('proc_open')
            ? 'node not found on PATH or in common install locations'
            : 'proc_open is disabled — cannot locate Node.js';
        return $info;
    }

    $versionOutput = runtimeRunArgv([$path, '-v']);
    if (preg_match('/v?(\d+\.\d+\.\d+)/', $versionOutput, $m)) {
        $info['version'] = $m[1];
        $info['raw'] = $versionOutput;
        $info['line'] = runtimeVersionLine($m[1], 1);
        $info['major'] = (int)explode('.', $m[1])[0];
        $info['installed'] = true;
    } else {
        $info['error'] = 'Could not read the Node.js version from ' . $path;
    }

    $archOutput = runtimeRunArgv([$path, '-p', 'process.arch']);
    if ($archOutput !== '' && preg_match('/^(x64|arm64|ia32|arm)$/i', trim($archOutput), $m)) {
        $info['arch'] = strtolower($m[1]) === 'ia32' ? 'x86' : strtolower($m[1]);
    } else {
        $info['arch'] = runtimePeMachine($path);
    }

    $info['npmVersion'] = runtimeNpmVersionFor($path);
    return $info;
}

/**
 * @return list<string>
 */
function runtimeHttpdCandidates(): array
{
    $candidates = [];
    $env = trim((string)getenv('LINKNEST_APACHE_HTTPD'));
    if ($env !== '') {
        $candidates[] = $env;
    }
    $phpFolder = runtimePhpFolder();
    if ($phpFolder !== null) {
        $root = dirname($phpFolder);
        $candidates[] = $root . DIRECTORY_SEPARATOR . 'apache' . DIRECTORY_SEPARATOR . 'bin' . DIRECTORY_SEPARATOR . 'httpd.exe';
    }
    if (runtimeIsWindowsEffective()) {
        $candidates[] = 'C:\\xampp\\apache\\bin\\httpd.exe';
        $candidates[] = 'D:\\xampp\\apache\\bin\\httpd.exe';
        $candidates[] = 'D:\\Apache\\bin\\httpd.exe';
        $candidates[] = 'C:\\Apache24\\bin\\httpd.exe';
        $candidates[] = 'C:\\Apache\\Apache24\\bin\\httpd.exe';
    } else {
        $candidates[] = '/usr/sbin/apachectl';
        $candidates[] = '/usr/sbin/httpd';
        $candidates[] = '/usr/sbin/apache2';
        $candidates[] = '/usr/local/apache2/bin/httpd';
    }
    return $candidates;
}

/**
 * Apache httpd as installed here — and what to do when this host runs nginx
 * instead. Path + PE header first (no execution); version comes from the web
 * server probe in runtimeDetectWebServers().
 *
 * @return array<string, mixed>
 */
function runtimeApacheInfo(): array
{
    $webServers = runtimeDetectWebServers();
    $detected = null;
    foreach ($webServers['servers'] as $server) {
        if (($server['id'] ?? '') === 'apache') {
            $detected = $server;
            break;
        }
    }

    $path = is_array($detected) ? ($detected['path'] ?? null) : null;
    if ($path === null && !runtimeSimulation()['active']) {
        $path = runtimeFirstFile(runtimeHttpdCandidates());
    }
    if ($path === null && !runtimeIsWindowsEffective()) {
        $path = runtimeWhere('apachectl') ?? runtimeWhere('httpd') ?? runtimeWhere('apache2');
    }
    if ($path === null && runtimeIsWindowsEffective() && !runtimeSimulation()['active']) {
        $path = runtimeWhere('httpd');
    }

    $info = [
        'installed' => $path !== null || is_array($detected),
        'version' => is_array($detected) ? ($detected['version'] ?? null) : null,
        'arch' => $path !== null ? runtimePeMachine($path) : null,
        'path' => $path,
        'service' => trim((string)getenv('LINKNEST_APACHE_SERVICE'))
            ?: (is_array($detected) ? ($detected['service'] ?? null) : null),
        'control' => $path !== null && str_contains(basename($path), 'ctl') ? 'apachectl' : 'httpd',
        'configFile' => is_array($detected) ? ($detected['configFile'] ?? null) : null,
        'processRunning' => is_array($detected) ? (bool)($detected['processRunning'] ?? false) : false,
        'configTest' => is_array($detected) ? ($detected['configTest'] ?? null) : null,
        'reload' => is_array($detected) ? ($detected['reload'] ?? null) : null,
        'restart' => is_array($detected) ? ($detected['restart'] ?? null) : null,
        'webServer' => $webServers['primary'],
        'webServerLabel' => $webServers['primaryLabel'],
        'error' => null,
    ];

    if ($path === null && !is_array($detected)) {
        $info['error'] = $webServers['primary'] === 'none'
            ? 'Apache is not installed on this host and no other web server was detected (PHP SAPI: '
                . $webServers['sapi'] . ').'
            : 'Apache is not installed here — this host serves the app with ' . $webServers['primaryLabel'] . '.';
        return $info;
    }

    if ($info['version'] === null) {
        if ($path === null || !@is_file($path)) {
            $info['error'] = $path === null
                ? 'Apache is installed but its binary was not found in a standard location.'
                : 'Apache binary not readable at ' . $path . ' — version not probed.';
        } elseif (!runtimeCmdAllowed('proc_open')) {
            $info['error'] = 'proc_open is disabled — the Apache version could not be read';
        } else {
            $output = runtimeApacheVersionOutput($path);
            if ($output !== '' && preg_match('#Apache/(\d+(?:\.\d+)+)#i', $output, $matches)) {
                $info['version'] = $matches[1];
            } else {
                $snippet = trim((string)preg_replace('/\s+/', ' ', $output));
                if (strlen($snippet) > 180) {
                    $snippet = substr($snippet, 0, 177) . '...';
                }
                $info['error'] = 'Apache version not reported by ' . basename($path)
                    . ($snippet !== '' ? ': ' . $snippet : '');
            }
        }
    }

    return $info;
}

/**
 * SQLite engine + database facts (all from PDO/file metadata).
 *
 * @return array<string, mixed>
 */
function runtimeSqliteInfo(): array
{
    $info = [
        'engineVersion' => null,
        'libraryVersion' => null,
        'dbPath' => defined('DB_PATH') ? DB_PATH : null,
        'dbBytes' => null,
        'journalMode' => null,
        'schemaVersion' => null,
        'walBytes' => 0,
        'libDllPath' => null,
        'libDllArch' => null,
        'healthCheck' => null,
        'error' => null,
    ];

    try {
        if (class_exists('PDO') && defined('DB_PATH') && function_exists('getDB')) {
            $db = getDB();
            $info['engineVersion'] = (string)$db->query('SELECT sqlite_version()')->fetchColumn();
            $info['journalMode'] = strtolower((string)$db->query('PRAGMA journal_mode')->fetchColumn());
            $info['schemaVersion'] = (int)$db->query('PRAGMA user_version')->fetchColumn();
            $info['libraryVersion'] = defined('SQLITE_LIBRARY_VERSION') ? SQLITE_LIBRARY_VERSION : null;
        }
    } catch (Throwable $e) {
        $info['error'] = 'SQLite probe failed: ' . $e->getMessage();
    }

    if (is_string($info['dbPath']) && $info['dbPath'] !== '' && @is_file($info['dbPath'])) {
        $info['dbBytes'] = (int)@filesize($info['dbPath']);
        foreach ([$info['dbPath'] . '-wal', $info['dbPath'] . '-shm'] as $side) {
            if (@is_file($side)) {
                $info['walBytes'] += (int)@filesize($side);
            }
        }
    }

    if (runtimeIsWindowsEffective()) {
        $phpFolder = runtimePhpFolder();
        $candidates = [];
        if ($phpFolder !== null) {
            $candidates[] = $phpFolder . DIRECTORY_SEPARATOR . 'libsqlite3.dll';
        }
        $candidates[] = 'C:\\xampp\\php\\libsqlite3.dll';
        $dll = runtimeFirstFile($candidates);
        if ($dll !== null) {
            $info['libDllPath'] = $dll;
            $info['libDllArch'] = runtimePeMachine($dll);
        }
    }

    return $info;
}

/**
 * @return array<string, mixed>
 */
function runtimeGitInfo(): array
{
    $output = runtimeRunArgv(['git', '--version'], 6);
    $version = null;
    if ($output !== '' && preg_match('/(\d+\.\d+\.\d+)/', $output, $m)) {
        $version = $m[1];
    }
    $buildInfo = [];
    $buildInfoPath = RUNTIME_PROJECT_ROOT . '/BUILD_INFO.json';
    if (@is_file($buildInfoPath)) {
        $decoded = json_decode((string)@file_get_contents($buildInfoPath), true);
        if (is_array($decoded)) {
            $buildInfo = $decoded;
        }
    }
    return [
        'version' => $version,
        'available' => $version !== null,
        'appVersion' => $buildInfo['version'] ?? (defined('LINKNEST_APP_VERSION') ? LINKNEST_APP_VERSION : null),
        'gitCommit' => isset($buildInfo['gitCommit']) ? (string)$buildInfo['gitCommit'] : null,
        'buildId' => $buildInfo['buildId'] ?? null,
    ];
}

/**
 * Classify this install so the guidance can match the host exactly.
 *
 * @param array<string, mixed>|null $phpInfo
 * @param array<string, mixed>|null $apacheInfo
 * @return array<string, mixed>
 */
function runtimeDetectLayout(?array $phpInfo = null, ?array $apacheInfo = null): array
{
    $phpInfo = $phpInfo ?? runtimePhpInfo();
    $apacheInfo = $apacheInfo ?? runtimeApacheInfo();

    $phpFolder = is_string($phpInfo['folder'] ?? null) ? (string)$phpInfo['folder'] : null;
    $normalized = $phpFolder !== null ? str_replace('\\', '/', strtolower($phpFolder)) : '';
    $isWindows = runtimeIsWindowsEffective();
    $distro = runtimeDetectDistro();
    $webServers = runtimeDetectWebServers();
    $fpm = runtimeFpmTargets($phpInfo);
    $notes = [];

    if (runtimeIsDockerEffective()) {
        $id = 'docker';
        $label = 'Docker container';
        $notes[] = 'PHP and Node.js come from the container image — rebuild the image instead of patching inside it.';
    } elseif (($phpInfo['sapi'] ?? '') === 'cli-server') {
        $id = 'dev-cli-server';
        $label = 'PHP built-in dev server (npm run dev)';
        $notes[] = 'Development mode: the app is served by PHP\'s built-in server, so restart it after a runtime change.';
    } elseif ($isWindows && $normalized !== '' && preg_match('#^[a-z]:/xampp/php$#', $normalized)) {
        $id = 'xampp';
        $label = 'Windows XAMPP';
        $notes[] = 'Use the XAMPP upgrader scripts; they stop Apache, swap the PHP folder, keep php.ini and re-check LDAP.';
        $notes[] = 'Stopping/starting the Apache2.4 service needs an elevated (Administrator) shell.';
    } elseif ($isWindows && ($apacheInfo['installed'] ?? false)) {
        $id = 'vanilla';
        $label = 'Windows stock Apache + PHP';
        $notes[] = 'Use upgrade-vanilla-apache-php.ps1: it replaces php and Apache bin/modules but keeps php.ini, httpd.conf and htdocs.';
        $notes[] = 'Needs an elevated shell to stop/start the Apache service.';
    } elseif ($isWindows) {
        $id = 'native';
        $label = 'Windows PHP (no Apache detected)';
        $notes[] = 'Restart whatever process serves PHP after a patch — IIS/FastCGI worker, or the service that launched php-cgi.';
    } elseif (PHP_OS_FAMILY === 'Darwin') {
        $id = 'macos';
        $label = 'macOS host';
        $notes[] = 'Homebrew is the usual path (brew upgrade php / nginx); restart the service with '
            . '`brew services restart php` or reload the web server you use.';
    } else {
        $id = 'linux';
        $label = 'Linux host (' . $distro['name'] . ')';
        $notes[] = 'Use ' . $distro['packageManager'] . ' to patch PHP, then reload '
            . ($webServers['primary'] !== 'none' ? $webServers['primaryLabel'] : 'the PHP service') . ' — a graceful reload is zero-downtime.';
        if ($distro['packageManager'] !== 'unknown') {
            $notes[] = $distro['packageManagerNote'];
        }
    }

    foreach ($webServers['notes'] as $note) {
        $notes[] = $note;
    }
    if ($fpm['installed'] && $webServers['primary'] !== 'none' && $webServers['primary'] !== 'apache') {
        $notes[] = $webServers['primaryLabel'] . ' fronts PHP-FPM (' . (string)$fpm['service'] . ')'
            . ($fpm['socket'] !== null ? ', socket ' . $fpm['socket'] : '')
            . ' - reload both after a PHP patch.';
    }

    if (!runtimeCmdAllowed('proc_open')) {
        $notes[] = 'proc_open is disabled in php.ini — version probes read from files only (some versions may be unknown).';
    }

    return [
        'id' => $id,
        'label' => $label,
        'os' => PHP_OS_FAMILY,
        'windows' => $isWindows,
        'docker' => runtimeIsDockerEffective(),
        'phpFolder' => $phpFolder,
        'phpIniPath' => $phpInfo['iniPath'] ?? null,
        'phpBinary' => $phpInfo['binary'] ?? null,
        'apachePath' => $apacheInfo['path'] ?? null,
        'apacheControl' => $apacheInfo['control'] ?? null,
        'apacheService' => $apacheInfo['service'] ?? null,
        'distroId' => $distro['id'],
        'distroName' => $distro['name'],
        'packageManager' => $distro['packageManager'],
        'webServer' => $webServers['primary'],
        'webServerLabel' => $webServers['primaryLabel'],
        'webServerAmbiguous' => (bool)$webServers['ambiguous'],
        'fpmService' => $fpm['service'],
        'elevation' => $distro['elevation'],
        'elevationShort' => $isWindows
            ? 'Administrator'
            : (runtimeIsDockerEffective() ? 'Docker host' : ($distro['family'] === 'darwin' ? 'sudo' : 'root / sudo')),
        'requiresElevation' => $isWindows || $id === 'docker' || $distro['family'] !== 'windows',
        'projectRoot' => RUNTIME_PROJECT_ROOT,
        'notes' => $notes,
        'simulated' => (bool)runtimeSimulation()['active'],
    ];
}

/**
 * @return array<string, mixed>
 */
function runtimeHostInfo(?array $layout = null): array
{
    $layout = $layout ?? runtimeDetectLayout();
    return [
        'os' => PHP_OS . ' / ' . php_uname('s') . ' ' . php_uname('r'),
        'family' => PHP_OS_FAMILY,
        'arch' => PHP_INT_SIZE === 8 ? 'x64' : 'x86',
        'phpSapi' => php_sapi_name(),
        'layout' => $layout['id'],
        'layoutLabel' => $layout['label'],
        'docker' => (bool)$layout['docker'],
        'windows' => (bool)$layout['windows'],
        'projectRoot' => RUNTIME_PROJECT_ROOT,
        'dataDir' => defined('DB_DIR') ? DB_DIR : (RUNTIME_PROJECT_ROOT . '/data'),
        'procOpenAllowed' => runtimeCmdAllowed('proc_open'),
        'curlAvailable' => function_exists('curl_init'),
        'checkedAt' => time(),
        'checkedAtIso' => date('c'),
    ];
}

/** The PHP patch level the panel reasons about (simulation-aware). */
function runtimeEffectivePhpVersion(): string
{
    $sim = runtimeSimulation();
    return $sim['phpVersion'] !== null && $sim['phpVersion'] !== '' ? (string)$sim['phpVersion'] : PHP_VERSION;
}

/**
 * Normalise every php.net release JSON shape into our line map:
 *
 *   {"8.5.11": {...}}                      history, keyed by patch version (no `version` field)
 *   {"8": {"8.5": {"version": "8.5.11"}}}  active.php, major -> branch -> release
 *   {"version": "8.5.11", "tags": [...]}    single-release summary (?json&version=8 without &max)
 *
 * @param mixed $decoded
 * @param array<string, array<string, mixed>> $lines mutated, keyed by "8.5"
 * @param array<string, bool> $supported mutated, branches php.net still supports
 */
function runtimePhpNetNormalize($decoded, array &$lines, array &$supported): void
{
    if (!is_array($decoded)) {
        return;
    }
    $queue = [$decoded];
    while ($queue !== []) {
        $node = array_pop($queue);
        if (!is_array($node)) {
            continue;
        }

        $version = isset($node['version']) && is_string($node['version'])
            ? runtimeNormalizeVersion($node['version'])
            : '';
        if ($version !== '' && preg_match('/^\d+\.\d+\.\d+$/', $version)) {
            $line = runtimeVersionLine($version, 2);
            $tags = [];
            foreach ((array)($node['tags'] ?? []) as $tag) {
                if (is_string($tag) && trim($tag) !== '') {
                    $tags[] = strtolower(trim($tag));
                }
            }
            $sourceEntries = is_array($node['source'] ?? null) ? $node['source'] : [];
            $preferred = null;
            foreach (['.tar.xz', '.tar.gz', '.tar.bz2'] as $extension) {
                foreach ($sourceEntries as $entry) {
                    if (is_array($entry) && is_string($entry['filename'] ?? null)
                        && str_ends_with($entry['filename'], $extension)) {
                        $preferred = $entry;
                        break 2;
                    }
                }
            }
            $dateLabel = isset($node['date']) && is_string($node['date']) ? (string)$node['date'] : null;
            $releasedAt = $dateLabel !== null ? (@strtotime($dateLabel) ?: null) : null;

            $existing = $lines[$line]['version'] ?? null;
            if ($existing === null || runtimeCompareVersions($version, (string)$existing) > 0) {
                $lines[$line] = [
                    'line' => $line,
                    'version' => $version,
                    'releasedAt' => $releasedAt,
                    'releasedAtLabel' => $dateLabel,
                    'assetName' => is_string($preferred['filename'] ?? null) ? (string)$preferred['filename'] : null,
                    'assetUrl' => is_string($preferred['filename'] ?? null)
                        ? 'https://www.php.net/distributions/' . rawurlencode((string)$preferred['filename'])
                        : 'https://www.php.net/downloads.php',
                    'sha256' => is_string($preferred['sha256'] ?? null) ? (string)$preferred['sha256'] : null,
                    'size' => null,
                    'threadSafe' => false,
                    'arch' => null,
                    'security' => in_array('security', $tags, true),
                    'tags' => $tags,
                ];
            }

            foreach ((array)($node['supported_versions'] ?? []) as $supportedVersion) {
                if (is_string($supportedVersion) && preg_match('/^\d+\.\d+$/', $supportedVersion)) {
                    $supported[$supportedVersion] = true;
                }
            }
            continue;
        }

        foreach ($node as $key => $value) {
            if (!is_array($value)) {
                continue;
            }
            // Dotted-key maps carry the version in the key, not in the value.
            if (is_string($key) && preg_match('/^\d+\.\d+\.\d+$/', $key) && !isset($value['version'])) {
                $value['version'] = $key;
            }
            // /releases/active.php is keyed major -> branch ("8" -> "8.5"): those branch
            // keys are exactly the lines php.net still supports.
            if (is_string($key)
                && preg_match('/^\d+\.\d+$/', $key)
                && isset($value['version'])
                && is_string($value['version'])
                && str_starts_with(runtimeNormalizeVersion($value['version']), $key . '.')) {
                $supported[$key] = true;
            }
            $queue[] = $value;
        }
    }
}

/**
 * Official Windows PHP build index (downloads.php.net). Non-Windows hosts get the
 * real php.net release endpoints instead of a fabricated data shape.
 *
 * @return array<string, mixed>
 */
function runtimePhpCatalog(bool $force = false): array
{
    // The PHP index differs per platform family (Windows TS builds vs php.net
    // releases), so the cache key must too — otherwise a simulated view could
    // reuse the other platform's catalogue.
    $key = runtimeIsWindowsEffective() ? 'php' : 'php-net';
    $cached = runtimeCacheGet($key, RUNTIME_CACHE_TTL);
    if (!$force && $cached['fresh'] && is_array($cached['value'])) {
        return $cached['value'];
    }

    $result = [
        'source' => 'downloads.php.net',
        'url' => 'https://downloads.php.net/~windows/releases/releases.json',
        'urls' => ['https://downloads.php.net/~windows/releases/releases.json'],
        'fetchedAt' => null,
        'error' => null,
        'stale' => false,
        'lines' => [],
        'supportedVersions' => [],
        'latestAny' => null,
        'latestLine' => null,
        'windowsBuildIndex' => runtimeIsWindowsEffective(),
    ];

    if (runtimeIsWindowsEffective()) {
        $response = runtimeHttpGet('https://downloads.php.net/~windows/releases/releases.json');
        if ($response['ok']) {
            $decoded = json_decode($response['body'], true);
            if (is_array($decoded)) {
                $lines = [];
                foreach ($decoded as $lineKey => $lineData) {
                    if (!is_array($lineData) || !isset($lineData['version'])) {
                        continue;
                    }
                    $build = null;
                    foreach (['ts-vs17-x64', 'ts-vs16-x64', 'ts-vc15-x64'] as $preferred) {
                        if (isset($lineData[$preferred]) && is_array($lineData[$preferred])) {
                            $build = $lineData[$preferred];
                            break;
                        }
                    }
                    if ($build === null) {
                        foreach ($lineData as $buildKey => $buildData) {
                            if (is_string($buildKey)
                                && str_starts_with($buildKey, 'ts-')
                                && str_ends_with($buildKey, '-x64')
                                && is_array($buildData)) {
                                $build = $buildData;
                                break;
                            }
                        }
                    }
                    if (!is_array($build) || !isset($build['zip']['path'])) {
                        continue;
                    }
                    $lines[(string)$lineKey] = [
                        'line' => (string)$lineKey,
                        'version' => (string)$lineData['version'],
                        'releasedAt' => isset($build['mtime']) ? (string)$build['mtime'] : null,
                        'assetName' => (string)$build['zip']['path'],
                        'assetUrl' => 'https://downloads.php.net/~windows/releases/' . rawurlencode((string)$build['zip']['path']),
                        'sha256' => isset($build['zip']['sha256']) ? (string)$build['zip']['sha256'] : null,
                        'size' => isset($build['zip']['size']) ? (string)$build['zip']['size'] : null,
                        'threadSafe' => true,
                        'arch' => 'x64',
                    ];
                }
                $result['lines'] = $lines;
                $result['latestAny'] = runtimeMaxVersion(array_map(
                    static fn ($row) => $row['version'] ?? null,
                    $lines
                ));
                $result['latestLine'] = $result['latestAny'] !== null
                    ? runtimeVersionLine($result['latestAny'], 2)
                    : null;
                $result['fetchedAt'] = time();
            } else {
                $result['error'] = 'PHP release index was not valid JSON';
            }
        } else {
            $result['error'] = $response['error'] ?? 'PHP release index unavailable';
        }
    } else {
        /* ------------------------------------------------------------------
         * php.net has three JSON shapes and only one of them is keyed by full
         * patch versions. We read the two endpoints that actually carry what we
         * need and normalise all shapes:
         *
         *   /releases/active.php                        -> latest patch per supported line (+ tags)
         *   /releases/index.php?json&version=8&max=60   -> patch history, keyed "8.5.11"
         *
         * NOTE: /releases/index.php?json&version=8 WITHOUT &max returns a single
         * object ({"version":"8.5.11", ...}) and no dotted keys at all — reading
         * only that endpoint is what made Linux report "No PHP versions parsed".
         * ---------------------------------------------------------------- */
        $major = (int)explode('.', runtimeEffectivePhpVersion())[0];
        $historyUrl = 'https://www.php.net/releases/index.php?json&version=' . $major . '&max=60';
        $activeUrl = 'https://www.php.net/releases/active.php';
        $result['source'] = 'php.net';
        $result['url'] = $historyUrl;
        $result['urls'] = [$activeUrl, $historyUrl];

        $lines = [];
        $supported = [];
        $errors = [];
        $fetched = false;

        $activeResponse = runtimeHttpGet($activeUrl, 1048576);
        if ($activeResponse['ok']) {
            runtimePhpNetNormalize(json_decode($activeResponse['body'], true), $lines, $supported);
            $fetched = true;
        } else {
            $errors[] = 'active.php: ' . ($activeResponse['error'] ?? 'unavailable');
        }

        $historyResponse = runtimeHttpGet($historyUrl);
        if ($historyResponse['ok']) {
            runtimePhpNetNormalize(json_decode($historyResponse['body'], true), $lines, $supported);
            $fetched = true;
        } else {
            $errors[] = 'releases index: ' . ($historyResponse['error'] ?? 'unavailable');
        }

        $result['lines'] = $lines;
        $result['supportedVersions'] = array_keys($supported);
        usort($result['supportedVersions'], static fn ($a, $b) => runtimeCompareVersions($b, $a));

        if ($lines !== []) {
            $result['latestAny'] = runtimeMaxVersion(array_map(
                static fn ($row) => $row['version'] ?? null,
                $lines
            ));
            $result['latestLine'] = $result['latestAny'] !== null
                ? runtimeVersionLine($result['latestAny'], 2)
                : null;
        }
        if ($result['latestAny'] === null) {
            $result['error'] = $errors !== []
                ? implode('; ', $errors)
                : 'No PHP versions parsed from php.net';
        } elseif (!$fetched) {
            $result['error'] = implode('; ', $errors);
        }
        if ($result['latestAny'] !== null) {
            $result['fetchedAt'] = time();
        }
    }

    if ($result['error'] !== null && is_array($cached['value']) && !empty($cached['value']['lines'])) {
        $stale = $cached['value'];
        $stale['stale'] = true;
        $stale['error'] = $result['error'];
        return $stale;
    }

    if (!empty($result['lines'])) {
        runtimeCachePut($key, $result);
    }
    return $result;
}

/**
 * Official Node.js release index (nodejs.org/dist/index.json).
 * The `security` flag on a release is vendor-declared, so it drives our badge.
 *
 * @return array<string, mixed>
 */
function runtimeNodeCatalog(bool $force = false): array
{
    $key = 'node';
    $cached = runtimeCacheGet($key, RUNTIME_CACHE_TTL);
    if (!$force && $cached['fresh'] && is_array($cached['value'])) {
        return $cached['value'];
    }

    $result = [
        'source' => 'nodejs.org/dist/index.json',
        'url' => 'https://nodejs.org/dist/index.json',
        'fetchedAt' => null,
        'error' => null,
        'stale' => false,
        'lines' => [],
        'ltsLines' => [],
        'latestCurrent' => null,
        'latestLts' => null,
    ];

    $response = runtimeHttpGet('https://nodejs.org/dist/index.json', 2097152);
    if (!$response['ok']) {
        $result['error'] = $response['error'] ?? 'Node release index unavailable';
    } else {
        $decoded = json_decode($response['body'], true);
        if (!is_array($decoded)) {
            $result['error'] = 'Node release index was not valid JSON';
        } else {
            foreach ($decoded as $entry) {
                if (!is_array($entry) || !isset($entry['version'])) {
                    continue;
                }
                $version = runtimeNormalizeVersion((string)$entry['version']);
                if ($version === '') {
                    continue;
                }
                $major = runtimeVersionLine($version, 1);
                $normalized = [
                    'version' => $version,
                    'date' => isset($entry['date']) ? (string)$entry['date'] : null,
                    'security' => !empty($entry['security']),
                    'lts' => isset($entry['lts']) && $entry['lts'] !== false ? (string)$entry['lts'] : false,
                    'npm' => isset($entry['npm']) ? (string)$entry['npm'] : null,
                    'files' => isset($entry['files']) && is_array($entry['files']) ? array_values($entry['files']) : [],
                ];
                // index.json is newest-first: the first hit per major is that line's latest.
                if (!isset($result['lines'][$major])) {
                    $normalized['securityVersions'] = $normalized['security'] ? [$version] : [];
                    $result['lines'][$major] = $normalized;
                } elseif ($normalized['security']) {
                    $result['lines'][$major]['securityVersions'][] = $version;
                }
                if ($normalized['lts'] !== false && !isset($result['ltsLines'][$major])) {
                    $result['ltsLines'][$major] = $normalized['lts'];
                }
                if ($result['latestLts'] === null && $normalized['lts'] !== false) {
                    $result['latestLts'] = $normalized;
                }
                if ($result['latestCurrent'] === null) {
                    $result['latestCurrent'] = $normalized;
                }
            }
            if ($result['lines'] === []) {
                $result['error'] = 'No Node.js releases parsed from the index';
            } else {
                $result['fetchedAt'] = time();
            }
        }
    }

    if ($result['error'] !== null && is_array($cached['value']) && !empty($cached['value']['lines'])) {
        $stale = $cached['value'];
        $stale['stale'] = true;
        $stale['error'] = $result['error'];
        return $stale;
    }

    if (!empty($result['lines'])) {
        runtimeCachePut($key, $result);
    }
    return $result;
}

/**
 * Vendor "this was a security release" hint for a PHP patch, read from the
 * official php.net news feed. Advisory only — always paired with the real link.
 *
 * @return array<string, mixed>
 */
function runtimePhpSecurityHint(string $version, bool $force = false): array
{
    $version = runtimeNormalizeVersion($version);
    $key = 'phpSecurity:' . $version;
    $cached = runtimeCacheGet($key, 86400);
    if (!$force && $cached['fresh'] && is_array($cached['value'])) {
        return $cached['value'];
    }

    $result = [
        'version' => $version,
        'status' => 'unknown',
        'source' => 'https://www.php.net/feed.atom',
        'excerpt' => null,
        'error' => null,
    ];

    if ($version === '') {
        $result['error'] = 'No version supplied';
        return $result;
    }

    $response = runtimeHttpGet('https://www.php.net/feed.atom', 4194304);
    if (!$response['ok']) {
        $result['error'] = $response['error'] ?? 'php.net news feed unavailable';
        return $result;
    }

    $body = $response['body'];
    $position = stripos($body, 'PHP ' . $version);
    if ($position === false) {
        $position = stripos($body, '>' . $version . '<');
    }
    if ($position === false) {
        $result['error'] = 'Version not mentioned in the recent PHP news feed';
        return $result;
    }

    $snippet = substr($body, max(0, $position - 200), 2500);
    $plain = trim((string)preg_replace('/\s+/', ' ', strip_tags($snippet)));
    $result['excerpt'] = mb_substr($plain, 0, 400);
    $isSecurity = (bool)preg_match('/CVE-\d{4}-\d{3,7}/i', $snippet)
        || (bool)preg_match('/\bsecurit(y|ies)\b/i', $snippet);
    $result['status'] = $isSecurity ? 'security' : 'patch';

    runtimeCachePut($key, $result);
    return $result;
}

/**
 * PHP: installed vs newest published patch for the same minor (and newest minor).
 *
 * @param array<string, mixed> $phpInfo
 * @param array<string, mixed> $catalog
 * @return array<string, mixed>
 */
function runtimePhpCandidate(array $phpInfo, array $catalog, bool $force = false): array
{
    $current = (string)($phpInfo['version'] ?? '');
    $line = runtimeVersionLine($current, 2);
    $row = is_array($catalog['lines'][$line] ?? null) ? $catalog['lines'][$line] : null;
    $latestForLine = $row['version'] ?? null;
    $latestAny = $catalog['latestAny'] ?? null;
    $latestLine = $catalog['latestLine'] ?? ($latestAny !== null ? runtimeVersionLine($latestAny, 2) : null);

    $supportedLines = is_array($catalog['supportedVersions'] ?? null) ? $catalog['supportedVersions'] : [];
    // Only claim "unsupported" when php.net actually told us which lines it supports.
    $lineSupported = $supportedLines === [] ? null : in_array($line, $supportedLines, true);

    $error = $catalog['error'] ?? null;
    $patchAvailable = is_string($latestForLine) && runtimeCompareVersions($latestForLine, $current) > 0;
    $newerMinor = is_string($latestAny) && runtimeCompareVersions((string)$latestLine, $line) > 0;
    $vendorSecurity = !empty($row['security']);

    $hint = $patchAvailable
        ? runtimePhpSecurityHint((string)$latestForLine, $force)
        : ['status' => 'unknown', 'excerpt' => null, 'source' => 'https://www.php.net/feed.atom', 'error' => null];
    // The release index tag is authoritative; the news feed is the fallback hint.
    $security = $patchAvailable && ($vendorSecurity || ($hint['status'] ?? 'unknown') === 'security');

    if ($patchAvailable && $security) {
        $status = 'security-patch-available';
    } elseif ($patchAvailable) {
        $status = 'patch-available';
    } elseif ($lineSupported === false) {
        $status = 'unsupported-line';
    } elseif ($newerMinor) {
        $status = 'minor-available';
    } elseif (is_string($latestForLine)) {
        $status = 'up-to-date';
    } else {
        // Never pretend "up to date" when the index could not be read.
        $status = 'could-not-check';
    }

    $publishedAt = null;
    $publishedAtLabel = $row['releasedAtLabel'] ?? null;
    if (isset($row['releasedAt']) && is_numeric($row['releasedAt'])) {
        $publishedAt = date('c', (int)$row['releasedAt']);
    } elseif (is_string($row['releasedAt'] ?? null) && $row['releasedAt'] !== '') {
        $publishedAt = $row['releasedAt'];
    }

    return [
        'component' => 'php',
        'currentVersion' => $current,
        'line' => $line,
        'latestForLine' => $latestForLine,
        'latestForLineInfo' => $row,
        'latestAny' => $latestAny,
        'latestAnyLine' => $latestLine,
        'supportedLines' => $supportedLines,
        'lineSupported' => $lineSupported,
        'status' => $status,
        'patchAvailable' => $patchAvailable,
        'newerMinorAvailable' => $newerMinor,
        'security' => $security,
        'vendorSecurityTag' => $vendorSecurity,
        'securityHint' => $hint,
        'source' => $catalog['source'] ?? null,
        'sourceUrl' => $catalog['url'] ?? null,
        'stale' => (bool)($catalog['stale'] ?? false),
        'notesUrl' => PHP_MAJOR_VERSION > 0
            ? 'https://www.php.net/ChangeLog-' . runtimeVersionLine($current, 1) . '.php'
            : 'https://www.php.net/ChangeLog-8.php',
        'publishedAt' => $publishedAt,
        'publishedAtLabel' => $publishedAtLabel,
        'assetName' => $row['assetName'] ?? null,
        'assetUrl' => $row['assetUrl'] ?? null,
        'sha256' => $row['sha256'] ?? null,
        'assetSize' => $row['size'] ?? null,
        'error' => $error,
    ];
}

/**
 * Node.js: installed vs newest release on the same major line (plus the current LTS).
 *
 * @param array<string, mixed> $nodeInfo
 * @param array<string, mixed> $catalog
 * @return array<string, mixed>
 */
function runtimeNodeCandidate(array $nodeInfo, array $catalog): array
{
    $current = (string)($nodeInfo['version'] ?? '');
    $installed = !empty($nodeInfo['installed']);
    $line = $installed ? runtimeVersionLine($current, 1) : '';
    $row = ($line !== '' && is_array($catalog['lines'][$line] ?? null)) ? $catalog['lines'][$line] : null;
    $latestForLine = $row['version'] ?? null;
    // Any vendor-declared security release newer than what is installed means the
    // host is missing those fixes, even when the newest patch itself is not flagged.
    $securityVersions = is_array($row['securityVersions'] ?? null) ? $row['securityVersions'] : [];
    $missingSecurity = [];
    foreach ($securityVersions as $securityVersion) {
        if (!is_string($securityVersion) || $securityVersion === '') {
            continue;
        }
        if (runtimeCompareVersions($securityVersion, $current) > 0) {
            $missingSecurity[] = $securityVersion;
        }
    }
    $security = $missingSecurity !== [];
    $patchAvailable = $installed && is_string($latestForLine) && runtimeCompareVersions($latestForLine, $current) > 0;

    $latestLts = is_array($catalog['latestLts'] ?? null) ? $catalog['latestLts'] : null;
    $latestCurrent = is_array($catalog['latestCurrent'] ?? null) ? $catalog['latestCurrent'] : null;
    $ltsMajor = $latestLts !== null ? runtimeVersionLine((string)$latestLts['version'], 1) : null;
    $ltsUpgrade = $installed && $ltsMajor !== null && runtimeCompareVersions($ltsMajor, $line) > 0;

    if (!$installed) {
        $status = 'not-installed';
    } elseif ($patchAvailable && $security) {
        $status = 'security-patch-available';
    } elseif ($patchAvailable) {
        $status = 'patch-available';
    } elseif ($ltsUpgrade) {
        $status = 'lts-upgrade-available';
    } elseif (is_string($latestForLine)) {
        $status = 'up-to-date';
    } else {
        // No data for this major line: never claim "up to date".
        $status = 'could-not-check';
    }

    $target = is_string($latestForLine) && $latestForLine !== '' ? $latestForLine : $current;
    $tag = 'v' . $target;
    $assetUrl = null;
    $assetName = null;
    $shasumsUrl = null;
    if ($target !== '') {
        $shasumsUrl = 'https://nodejs.org/dist/' . $tag . '/SHASUMS256.txt';
        if (runtimeIsWindows()) {
            $assetName = 'node-' . $tag . '-win-x64.zip';
            $assetUrl = 'https://nodejs.org/dist/' . $tag . '/' . $assetName;
        } else {
            $assetName = 'node-' . $tag . '-linux-x64.tar.xz';
            $assetUrl = 'https://nodejs.org/dist/' . $tag . '/' . $assetName;
        }
    }

    return [
        'component' => 'node',
        'installed' => $installed,
        'currentVersion' => $current !== '' ? $current : null,
        'line' => $line,
        'path' => $nodeInfo['path'] ?? null,
        'pathSource' => $nodeInfo['source'] ?? null,
        'arch' => $nodeInfo['arch'] ?? null,
        'npmVersion' => $nodeInfo['npmVersion'] ?? null,
        'latestForLine' => $latestForLine,
        'latestForLineNpm' => $row['npm'] ?? null,
        'latestForLineDate' => $row['date'] ?? null,
        'latestLts' => $latestLts,
        'latestCurrent' => $latestCurrent,
        'ltsName' => $row['lts'] ?? false,
        'status' => $status,
        'patchAvailable' => $patchAvailable,
        'security' => $security,
        'missingSecurityVersions' => $missingSecurity,
        'ltsUpgradeAvailable' => $ltsUpgrade,
        'source' => $catalog['source'] ?? null,
        'sourceUrl' => $catalog['url'] ?? null,
        'stale' => (bool)($catalog['stale'] ?? false),
        'notesUrl' => $target !== ''
            ? 'https://github.com/nodejs/node/blob/main/doc/changelogs/CHANGELOG_V' . runtimeVersionLine($target, 1) . '.md'
            : 'https://nodejs.org/en/download/releases',
        'releaseNotesUrl' => $target !== '' ? 'https://nodejs.org/en/blog/release/v' . $target : null,
        'assetName' => $assetName,
        'assetUrl' => $assetUrl,
        'shasumsUrl' => $shasumsUrl,
        'error' => $nodeInfo['error'] ?? null,
    ];
}

/**
 * Copy-paste PHP patch commands for the detected host layout.
 *
 * @param array<string, mixed> $layout
 * @return list<array<string, mixed>>
 */
function runtimeInstructionsPhp(array $layout, ?string $targetVersion = null): array
{
    $root = (string)($layout['projectRoot'] ?? RUNTIME_PROJECT_ROOT);
    $line = runtimeVersionLine(PHP_VERSION, 2);
    $target = $targetVersion !== null && $targetVersion !== '' ? $targetVersion : null;
    $targetArg = $target !== null ? ' -Patch ' . $target : '';
    $steps = [];
    $layoutId = (string)($layout['id'] ?? '');

    if ($layoutId === 'xampp') {
        $phpFolder = (string)($layout['phpFolder'] ?? 'C:\\xampp\\php');
        $steps[] = [
            'id' => 'elevated-pinned',
            'title' => 'Elevated PowerShell (recommended)' . ($target !== null ? ' — pin ' . $target : ''),
            'shell' => 'powershell',
            'code' => 'cd "' . $root . '"' . "\n"
                . '.\\scripts\\upgrade-xampp-php-run-elevated.ps1 -Version ' . $line . $targetArg . ' -RestartApache',
            'note' => 'Approves UAC, stops Apache, swaps the PHP folder, keeps your php.ini and re-checks LDAP before activating.',
            'elevated' => true,
        ];
        $steps[] = [
            'id' => 'minor-latest',
            'title' => 'Newest published patch on this minor (no -Patch)',
            'shell' => 'powershell',
            'code' => 'cd "' . $root . '"' . "\n"
                . '.\\scripts\\upgrade-xampp-php.ps1 -Version ' . $line . ' -RestartApache',
            'note' => 'Run from an already elevated PowerShell window.',
            'elevated' => true,
        ];
        $steps[] = [
            'id' => 'newest-minor',
            'title' => 'Newest published TS x64 minor',
            'shell' => 'powershell',
            'code' => 'cd "' . $root . '"' . "\n"
                . '.\\scripts\\upgrade-xampp-php.ps1 -RestartApache',
            'note' => 'Omit -Version to take the newest Thread-Safe x64 build in the official index.',
            'elevated' => true,
        ];
        $steps[] = [
            'id' => 'dry-run',
            'title' => 'Dry run — change nothing, print the plan',
            'shell' => 'powershell',
            'code' => '.\\scripts\\upgrade-xampp-php.ps1 -Version ' . $line . $targetArg . ' -WhatIf',
            'note' => 'Confirms the exact zip URL and SHA256 before you touch anything.',
            'elevated' => false,
        ];
        $steps[] = [
            'id' => 'offline-zip',
            'title' => 'Air-gapped host — reuse a pre-downloaded zip',
            'shell' => 'powershell',
            'code' => '.\\scripts\\upgrade-xampp-php.ps1 -Version ' . $line
                . ' -ZipPath D:\\installers\\' . (string)($layout['phpAssetName'] ?? ('php-' . ($target ?? $line . '.x') . '-Win32-vs17-x64.zip'))
                . ' -RestartApache',
            'note' => 'Copy the official zip to the host first; the script still verifies SHA256 and the LDAP gate.',
            'elevated' => true,
        ];
        $assetUrl = (string)($layout['phpAssetUrl'] ?? '');
        if ($assetUrl === '' || !str_starts_with($assetUrl, 'http')) {
            $assetUrl = 'https://downloads.php.net/~windows/releases/'
                . (string)($layout['phpAssetName'] ?? ('php-' . $line . '.x-Win32-vs17-x64.zip'));
        }
        $steps[] = [
            'id' => 'manual-download',
            'title' => 'Manual download + hash check (no script)',
            'shell' => 'powershell',
            'code' => '$url = "' . $assetUrl . '"' . "\n"
                . '$zip = Join-Path $env:TEMP (Split-Path $url -Leaf)' . "\n"
                . 'Invoke-WebRequest $url -OutFile $zip' . "\n"
                . '(Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()'
                . (isset($layout['phpSha256']) && (string)$layout['phpSha256'] !== ''
                    ? "\n" . '# expect: ' . (string)$layout['phpSha256']
                    : ''),
            'note' => 'Then stop Apache, rename ' . $phpFolder . ' to php-backup-<timestamp>, extract the zip into '
                . $phpFolder . ', copy your saved php.ini back and start Apache.',
            'elevated' => true,
        ];
    } elseif ($layoutId === 'vanilla') {
        $steps[] = [
            'id' => 'bat',
            'title' => 'Double-click helper (UAC prompt)' . ($target !== null ? ' — pin ' . $target : ''),
            'shell' => 'cmd',
            'code' => 'upgrade-vanilla-apache-php.bat',
            'note' => 'Replaces ' . (string)($layout['phpFolder'] ?? 'D:\\php')
                . ' and Apache bin/modules in place; keeps php.ini, httpd.conf, htdocs and logs.',
            'elevated' => true,
        ];
        $steps[] = [
            'id' => 'elevated-pinned',
            'title' => 'Elevated PowerShell' . ($target !== null ? ' — pin ' . $target : ''),
            'shell' => 'powershell',
            'code' => 'cd "' . $root . '"' . "\n"
                . '.\\scripts\\upgrade-vanilla-apache-php.ps1 -Version ' . $line . $targetArg,
            'note' => 'Stops the Apache service, swaps, verifies, restarts.',
            'elevated' => true,
        ];
        $steps[] = [
            'id' => 'php-only',
            'title' => 'PHP only (Apache files untouched)',
            'shell' => 'powershell',
            'code' => '.\\scripts\\upgrade-vanilla-apache-php.ps1 -SkipApache',
            'note' => 'Add -RefreshCacert if you also want a fresh cacert.pem.',
            'elevated' => true,
        ];
        $steps[] = [
            'id' => 'newest-minor',
            'title' => 'Newest TS x64 minor',
            'shell' => 'powershell',
            'code' => '.\\scripts\\upgrade-vanilla-apache-php.ps1 -LatestMinor',
            'note' => 'Moves to the newest published minor (for example 8.6.x when it exists).',
            'elevated' => true,
        ];
        $steps[] = [
            'id' => 'dry-run',
            'title' => 'Dry run — print target URLs only',
            'shell' => 'powershell',
            'code' => '.\\scripts\\upgrade-vanilla-apache-php.ps1 -WhatIf',
            'note' => 'Nothing is stopped or replaced.',
            'elevated' => false,
        ];
    } else {
        $distro = runtimeDetectDistro();
        $webServers = runtimeDetectWebServers();
        $fpm = runtimeFpmTargets();
        $container = runtimeContainerMeta();

        if ($layoutId === 'docker') {
            $steps[] = [
                'id' => 'docker-backup',
                'title' => 'Step 1 — back the database up first (the compose file mounts no host volumes)',
                'shell' => 'bash',
                'code' => $container['commands']['backupDb'] . "\n"
                    . $container['commands']['backupUploads'] . "\n"
                    . '# or, from the repo: ' . $container['commands']['syncOut'],
                'note' => 'docker/docker-compose.yml declares no volume mounts, so data/ and uploads/ live inside the '
                    . 'container. Rebuilding replaces that container — without this copy the database can be lost or '
                    . 'revert to whatever the build context contained.',
                'elevated' => false,
            ];
            $steps[] = [
                'id' => 'docker-rebuild',
                'title' => 'Step 2 — rebuild the image and recreate the container',
                'shell' => 'bash',
                'code' => '# from the repo root' . "\n"
                    . $container['commands']['rebuild'] . "\n"
                    . $container['commands']['recreate'] . "\n"
                    . '# one-shot alternative: ' . $container['commands']['deployScript'],
                'note' => 'Run this on the Docker host — a running container cannot replace its own PHP runtime. PHP '
                    . 'comes from ' . ((string)($container['phpBaseImage'] ?? 'php:8.4-apache')) . ', so a PHP patch '
                    . 'means bumping that FROM line (or letting `--pull` take a newer patch of the same tag).',
                'elevated' => false,
            ];
            $steps[] = [
                'id' => 'docker-restore',
                'title' => 'Step 3 — put your data back',
                'shell' => 'bash',
                'code' => '# if the fresh container lost or reverted the database:' . "\n"
                    . $container['commands']['restore'],
                'note' => 'Skip this only when the rebuilt image already carries the current database.',
                'elevated' => false,
            ];
            $steps[] = [
                'id' => 'docker-verify',
                'title' => 'Step 4 — verify the new container',
                'shell' => 'bash',
                'code' => $container['commands']['verify'] . "\n"
                    . $container['commands']['verifyScript'] . "\n"
                    . $container['commands']['healthCheck'],
                'note' => 'Confirm php_version, pdo_sqlite and curl in the JSON. Ports '
                    . ((string)($container['ports']['http'] ?? '8090')) . ' (HTTP) / '
                    . ((string)($container['ports']['https'] ?? '8443')) . ' (HTTPS).',
                'elevated' => false,
            ];
            $steps[] = [
                'id' => 'docker-base-bump',
                'title' => 'Step 5 (optional) — move to a newer PHP base image',
                'shell' => 'bash',
                'code' => '# docker/Dockerfile' . "\n"
                    . 'FROM ' . ((string)($container['phpBaseImage'] ?? 'php:8.4-apache'))
                    . '   ->   FROM php:8.5-apache   # or a newer patch tag on the same line' . "\n"
                    . '# then rerun Step 1 -> Step 4',
                'note' => 'A patch-only change keeps the same major.minor; moving 8.4 -> 8.5 is a minor upgrade and '
                    . 'needs the extension check that verify-php.sh performs.',
                'elevated' => false,
            ];
        } elseif ($layoutId === 'dev-cli-server') {
            $steps[] = [
                'id' => 'dev-restart',
                'title' => 'Development mode — restart the built-in server',
                'shell' => 'bash',
                'code' => '# stop "npm run dev" (Ctrl+C), patch PHP with your usual installer,' . "\n"
                    . '# then start both servers again:' . "\n"
                    . 'npm run dev',
                'note' => 'Vite (3000) and the PHP built-in server (8000) both restart with npm run dev.',
                'elevated' => false,
            ];
        } else {
            $manager = (string)$distro['packageManager'];
            $family = (string)$distro['family'];
            $packages = is_array($fpm['packages'][$family] ?? null) ? $fpm['packages'][$family] : [];
            $packageList = $packages !== [] ? implode(' ', $packages) : ('php' . $line . '-cli php' . $line . '-fpm');

            $primaryCode = match ($manager) {
                'apt-get', 'apt' => 'sudo apt-get update' . "\n"
                    . 'sudo apt-get install --only-upgrade ' . $packageList,
                'dnf', 'yum', 'microdnf' => 'sudo ' . $manager . ' upgrade ' . $packageList . "\n"
                    . '# before a minor jump, check the module stream:' . "\n"
                    . 'sudo ' . $manager . ' module list php',
                'apk' => 'sudo apk update && sudo apk upgrade ' . $packageList,
                'zypper' => 'sudo zypper update ' . $packageList,
                'pacman' => 'sudo pacman -Syu ' . $packageList,
                'brew' => 'brew upgrade php' . "\n"
                    . 'brew services restart php',
                default => 'sudo apt-get install --only-upgrade ' . $packageList,
            };

            $steps[] = [
                'id' => 'pkg-primary',
                'title' => 'Patch PHP with ' . $manager . ' — ' . $distro['name'],
                'shell' => 'bash',
                'code' => $primaryCode,
                'note' => 'Detected service ' . (string)($fpm['service'] ?? ('php' . $line . '-fpm'))
                    . ($fpm['poolIni'] !== null ? ', pool ini ' . $fpm['poolIni'] : '')
                    . ($fpm['socket'] !== null ? ', socket ' . $fpm['socket'] : '')
                    . '. A patch upgrade only needs a graceful reload — no downtime.',
                'elevated' => true,
            ];

            $reloadLines = [];
            foreach ($webServers['servers'] as $server) {
                $commands = runtimeWebServerCommands($server, $distro);
                $reloadLines[] = '# ' . $server['label'] . "\n" . $commands['reload'];
            }
            if ($fpm['installed'] || $webServers['primary'] === 'none') {
                $reloadLines[] = '# PHP-FPM' . "\n" . $fpm['reload'];
            }
            if ($reloadLines !== []) {
                $steps[] = [
                    'id' => 'reload-web',
                    'title' => 'Reload every service you changed'
                        . ($webServers['ambiguous'] ? ' (two web servers were detected)' : ''),
                    'shell' => 'bash',
                    'code' => implode("\n", $reloadLines),
                    'note' => '`reload` keeps existing connections alive. Run only the lines that exist on this host; '
                        . 'if one fails, inspect it with `systemctl status <unit>`.',
                    'elevated' => true,
                ];
            }

            $compact = str_replace('.', '', $line);
            $rhelPackages = is_array($fpm['packages']['rhel'] ?? null) ? implode(' ', $fpm['packages']['rhel']) : 'php-cli php-fpm';
            $alpinePackages = is_array($fpm['packages']['alpine'] ?? null) ? implode(' ', $fpm['packages']['alpine']) : ('php' . $line . '-fpm');
            $susePackages = is_array($fpm['packages']['suse'] ?? null) ? implode(' ', $fpm['packages']['suse']) : ('php' . $compact . '-fpm');

            $steps[] = [
                'id' => 'pkg-other',
                'title' => 'Another distribution? Pick your package manager',
                'shell' => 'bash',
                'code' => 'sudo apt-get install --only-upgrade ' . $packageList . "   # Debian / Ubuntu\n"
                    . 'sudo dnf upgrade ' . $rhelPackages . "   # RHEL / Rocky / Alma / Fedora\n"
                    . 'sudo apk upgrade ' . $alpinePackages . "   # Alpine\n"
                    . 'sudo zypper update ' . $susePackages . "   # openSUSE / SLES\n"
                    . 'brew upgrade php   # macOS / Linuxbrew',
                'note' => 'Drop the leading "sudo" when you are already root (e.g. inside a container).',
                'elevated' => true,
            ];
            $steps[] = [
                'id' => 'source-build',
                'title' => 'Build from source (last resort)',
                'shell' => 'bash',
                'code' => 'cd /usr/src' . "\n"
                    . 'curl -fsSLO https://www.php.net/distributions/php-' . ($target ?? $line . '.x') . '.tar.gz' . "\n"
                    . 'tar -xzf php-' . ($target ?? $line . '.x') . '.tar.gz && cd php-' . ($target ?? $line . '.x') . "\n"
                    . './configure --with-apxs2 --with-pdo-sqlite --with-curl --enable-mbstring --with-openssl --with-zip --enable-fpm' . "\n"
                    . 'make -j"$(nproc)" && sudo make install' . "\n"
                    . ($fpm['installed'] ? $fpm['restart'] : runtimeWebServerCommands($webServers['servers'][0] ?? ['id' => 'apache'], $distro)['restart']),
                'note' => 'Keep the previous prefix/binary until the app passes /health.php?format=json. With '
                    . '--with-apxs2 PHP is loaded by Apache, so reload Apache as well.',
                'elevated' => true,
            ];
        }
    }

    return $steps;
}

/**
 * Copy-paste Node.js upgrade commands. Node never serves this app (dist/ is
 * prebuilt), so every option here is zero-downtime for the web app.
 *
 * @param array<string, mixed> $layout
 * @param array<string, mixed>|null $candidate
 * @return list<array<string, mixed>>
 */
function runtimeInstructionsNode(array $layout, ?array $candidate = null): array
{
    $target = null;
    if (is_array($candidate)) {
        if (!empty($candidate['latestForLine'])) {
            $target = (string)$candidate['latestForLine'];
        } elseif (is_array($candidate['latestLts'] ?? null) && !empty($candidate['latestLts']['version'])) {
            $target = (string)$candidate['latestLts']['version'];
        }
    }
    if ($target === null || $target === '') {
        $target = runtimeNormalizeVersion((string)($candidate['currentVersion'] ?? ''));
    }
    $placeholder = $target !== '' ? $target : 'X.Y.Z';
    $major = $target !== '' ? runtimeVersionLine($target, 1) : '22';
    $layoutId = (string)($layout['id'] ?? '');
    $steps = [];

    if ($layoutId === 'docker') {
        $container = runtimeContainerMeta();
        $steps[] = [
            'id' => 'docker-node',
            'title' => 'Node in the image — back up, rebuild on the host',
            'shell' => 'bash',
            'code' => '# back up first (the compose file mounts no host volumes)' . "\n"
                . $container['commands']['backupDb'] . "\n"
                . $container['commands']['rebuild'] . "\n"
                . $container['commands']['recreate'],
            'note' => 'The in-container Node (base image ' . ((string)($container['nodeBaseImage'] ?? 'node:20-bookworm-slim'))
                . ') is only used to build dist/ while the image is being built — the running app keeps serving '
                . 'from the image, so there is no request-path downtime.',
            'elevated' => false,
        ];
        return $steps;
    }

    if (runtimeIsWindowsEffective()) {
        $steps[] = [
            'id' => 'winget-lts',
            'title' => 'winget (elevated PowerShell) — official LTS channel',
            'shell' => 'powershell',
            'code' => 'winget upgrade OpenJS.NodeJS.LTS' . "\n"
                . '# or pin an exact release:' . "\n"
                . 'winget install --id OpenJS.NodeJS.LTS --version ' . $placeholder . ' --accept-source-agreements',
            'note' => 'Updates the machine-wide Node.js. Nothing needs to restart: the app is served by PHP/Apache.',
            'elevated' => true,
        ];
        $steps[] = [
            'id' => 'msi-silent',
            'title' => 'Official MSI (elevated, silent)',
            'shell' => 'powershell',
            'code' => '$v = "' . $placeholder . '"' . "\n"
                . '$msi = Join-Path $env:TEMP "node-$v-x64.msi"' . "\n"
                . 'Invoke-WebRequest "https://nodejs.org/dist/v$v/node-v$v-x64.msi" -OutFile $msi' . "\n"
                . 'Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /qn" -Wait -Verb RunAs',
            'note' => 'Use this when winget is unavailable or blocked by policy.',
            'elevated' => true,
        ];
        $steps[] = [
            'id' => 'zip-portable',
            'title' => 'Portable zip — no admin rights (build-only toolchain)',
            'shell' => 'powershell',
            'code' => '$v = "' . $placeholder . '"' . "\n"
                . '$tmp = Join-Path $env:TEMP "node-$v"' . "\n"
                . 'Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue' . "\n"
                . 'New-Item -ItemType Directory -Path $tmp | Out-Null' . "\n"
                . 'Invoke-WebRequest "https://nodejs.org/dist/v$v/node-v$v-win-x64.zip" -OutFile "$tmp\\node.zip"' . "\n"
                . 'Invoke-WebRequest "https://nodejs.org/dist/v$v/SHASUMS256.txt" -OutFile "$tmp\\SHASUMS256.txt"' . "\n"
                . '$want = (Select-String -Path "$tmp\\SHASUMS256.txt" -Pattern "node-v$v-win-x64.zip").Line.Split(" ")[0]' . "\n"
                . '$got = (Get-FileHash "$tmp\\node.zip" -Algorithm SHA256).Hash.ToLower()' . "\n"
                . 'if ($want -ne $got) { throw "SHA256 mismatch: $got" }' . "\n"
                . 'Expand-Archive "$tmp\\node.zip" -DestinationPath "$tmp\\x" -Force' . "\n"
                . '$env:Path = "$tmp\\x\\node-v$v-win-x64;" + $env:Path' . "\n"
                . 'node -v; npm -v',
            'note' => 'Session-only PATH change: ideal for running npm run build without touching the machine install.',
            'elevated' => false,
        ];
        $steps[] = [
            'id' => 'nvm-windows',
            'title' => 'nvm-windows (if you switch Node versions often)',
            'shell' => 'powershell',
            'code' => 'nvm install ' . $placeholder . "\n"
                . 'nvm use ' . $placeholder,
            'note' => 'Requires nvm-windows to be installed already.',
            'elevated' => true,
        ];
    } else {
        $distro = runtimeDetectDistro();
        $manager = (string)$distro['packageManager'];
        $nodePackageCommand = match ($manager) {
            'apt-get', 'apt' => 'curl -fsSL https://deb.nodesource.com/setup_' . $major . '.x | sudo -E bash -' . "\n"
                . 'sudo apt-get install -y nodejs',
            'dnf', 'yum', 'microdnf' => 'sudo ' . $manager . ' module reset nodejs' . "\n"
                . 'sudo ' . $manager . ' module enable nodejs:' . $major . "\n"
                . 'sudo ' . $manager . ' install -y nodejs',
            'apk' => 'sudo apk add --upgrade nodejs npm',
            'zypper' => 'sudo zypper install -y nodejs' . $major . ' npm' . $major,
            'pacman' => 'sudo pacman -Syu nodejs npm',
            'brew' => 'brew upgrade node',
            default => 'curl -fsSL https://deb.nodesource.com/setup_' . $major . '.x | sudo -E bash -'
                . "\n" . 'sudo apt-get install -y nodejs',
        };
        $steps[] = [
            'id' => 'nvm',
            'title' => 'nvm / fnm (recommended on Linux and macOS)',
            'shell' => 'bash',
            'code' => 'nvm install ' . $placeholder . "\n"
                . 'nvm use ' . $placeholder . "\n"
                . 'node -v && npm -v',
            'note' => 'Per-user install — no service restart and no downtime for the app.',
            'elevated' => false,
        ];
        $steps[] = [
            'id' => 'pkg-node',
            'title' => 'Machine-wide packages with ' . $manager . ' — ' . $distro['name'],
            'shell' => 'bash',
            'code' => $nodePackageCommand,
            'note' => 'Machine-wide Node is what build jobs and the MCP stdio adapter use. '
                . 'Node is not in the request path, so this is safe during business hours.',
            'elevated' => true,
        ];
        $steps[] = [
            'id' => 'nodesource-other',
            'title' => 'Other distributions (NodeSource / direct package)',
            'shell' => 'bash',
            'code' => 'curl -fsSL https://deb.nodesource.com/setup_' . $major . '.x | sudo -E bash - && sudo apt-get install -y nodejs   # Debian / Ubuntu'
                . "\n" . 'sudo dnf install -y nodejs   # RHEL / Rocky / Alma / Fedora'
                . "\n" . 'sudo apk add nodejs npm   # Alpine'
                . "\n" . 'sudo zypper install nodejs' . $major . '   # openSUSE / SLES'
                . "\n" . 'brew upgrade node   # macOS / Linuxbrew',
            'note' => 'Distro repositories often lag the current LTS — NodeSource / nvm get you the exact patch.',
            'elevated' => true,
        ];
        $steps[] = [
            'id' => 'tarball-linux',
            'title' => 'Exact patch from nodejs.org (no package manager)',
            'shell' => 'bash',
            'code' => 'v="' . $placeholder . '"' . "\n"
                . 'arch="$(uname -m)"; case "$arch" in x86_64) a=x64 ;; aarch64) a=arm64 ;; *) a=x64 ;; esac' . "\n"
                . 'cd /tmp && curl -fsSLO "https://nodejs.org/dist/v$v/node-v$v-linux-$a.tar.xz"' . "\n"
                . 'curl -fsSLo SHASUMS256.txt "https://nodejs.org/dist/v$v/SHASUMS256.txt"' . "\n"
                . 'sha256sum -c SHASUMS256.txt --ignore-missing' . "\n"
                . 'sudo tar -xJf "node-v$v-linux-$a.tar.xz" -C /usr/local --strip-components=1 --no-same-owner' . "\n"
                . 'node -v && npm -v',
            'note' => 'The SHA256 line is verified before anything is replaced. macOS: use the darwin tarball or brew.',
            'elevated' => true,
        ];
    }

    $steps[] = [
        'id' => 'after-node',
        'title' => 'After upgrading Node',
        'shell' => 'bash',
        'code' => 'node -v' . "\n"
            . 'npm -v' . "\n"
            . '# optional: refresh the built UI with the new toolchain' . "\n"
            . 'npm ci' . "\n"
            . 'npm run build',
        'note' => 'The running app stays online throughout — Node is not part of the request path.',
        'elevated' => false,
    ];

    return $steps;
}

/**
 * Web server (Apache / nginx / Caddy) patch commands. Apache Lounge has no
 * machine-readable index we trust, so this component is always reported as
 * "check the vendor page" — but the *commands* are generated for whichever web
 * server this host actually runs.
 *
 * @param array<string, mixed> $layout
 * @return list<array<string, mixed>>
 */
function runtimeInstructionsApache(array $layout): array
{
    $layoutId = (string)($layout['id'] ?? '');
    $webServers = runtimeDetectWebServers();
    $distro = runtimeDetectDistro();
    $fpm = runtimeFpmTargets();
    $steps = [];

    if ($layoutId === 'vanilla') {
        $steps[] = [
            'id' => 'vanilla-apache',
            'title' => 'Replace Apache bin/modules only (keeps conf, htdocs, logs)',
            'shell' => 'powershell',
            'code' => 'cd "' . (string)($layout['projectRoot'] ?? RUNTIME_PROJECT_ROOT) . '"' . "\n"
                . '.\\scripts\\upgrade-vanilla-apache-php.ps1 -SkipPhp',
            'note' => 'Backs up to Apache-bin-backup-<timestamp> and restarts the Apache service.',
            'elevated' => true,
        ];
        $steps[] = [
            'id' => 'vanilla-apache-url',
            'title' => 'Or point the run at an explicit Apache Lounge zip',
            'shell' => 'powershell',
            'code' => '.\\scripts\\upgrade-vanilla-apache-php.ps1 -SkipPhp -ApacheZipUrl "https://www.apachelounge.com/download/VS17/binaries/httpd-2.4.xx-win64-VS17.zip"',
            'note' => 'Useful for a controlled rollout or an air-gapped host (file:/// path also works).',
            'elevated' => true,
        ];
    } elseif ($layoutId === 'xampp') {
        $steps[] = [
            'id' => 'xampp-apache',
            'title' => 'XAMPP has no standalone Apache patcher',
            'shell' => 'powershell',
            'code' => '# Options, in order of preference:' . "\n"
                . '# 1) Install the current XAMPP release over the existing folder (keep htdocs + config)' . "\n"
                . '# 2) Swap in a current Apache Lounge Win64 build, keeping conf/htdocs/logs:' . "\n"
                . '$url = "https://www.apachelounge.com/download/VS17/binaries/httpd-2.4.xx-win64-VS17.zip"' . "\n"
                . 'Invoke-WebRequest $url -OutFile (Join-Path $env:TEMP (Split-Path $url -Leaf))',
            'note' => 'Always run httpd -t (config test) and keep a copy of conf/ before swapping Apache.',
            'elevated' => true,
        ];
    } else {
        if ($layoutId === 'docker') {
            $container = runtimeContainerMeta();
            $steps[] = [
                'id' => 'docker-apache',
                'title' => 'Back up the database, then rebuild the image',
                'shell' => 'bash',
                'code' => $container['commands']['backupDb'] . "\n"
                    . $container['commands']['rebuild'] . "\n"
                    . $container['commands']['recreate'] . "\n"
                    . $container['commands']['restore'],
                'note' => 'Apache comes from the image (Dockerfile: FROM '
                    . ((string)($container['phpBaseImage'] ?? 'php:8.4-apache'))
                    . '), so it is patched at build time. The compose file has no volume mounts — keep the backup.',
                'elevated' => false,
            ];
        } elseif ($webServers['servers'] === []) {
            $steps[] = [
                'id' => 'no-web-server',
                'title' => 'No Apache / nginx / Caddy found on this host',
                'shell' => 'bash',
                'code' => '# PHP is served by "' . $webServers['sapi'] . '"' . "\n"
                    . 'php -v',
                'note' => 'Nothing to patch here: the web server lives somewhere else (a proxy host, a managed '
                    . 'platform, or the container that fronts this app).',
                'elevated' => false,
            ];
        } else {
            foreach ($webServers['servers'] as $server) {
                $package = null;
                $catalogPackages = is_array($server['packages'] ?? null) ? $server['packages'] : [];
                if (isset($catalogPackages[$distro['family']])) {
                    $package = (string)$catalogPackages[$distro['family']];
                }
                $upgradeCommand = match ($distro['packageManager']) {
                    'dnf', 'yum', 'microdnf' => 'sudo ' . $distro['packageManager'] . ' upgrade ' . ($package ?? 'httpd'),
                    'apk' => 'sudo apk upgrade ' . ($package ?? 'apache2'),
                    'zypper' => 'sudo zypper update ' . ($package ?? 'apache2'),
                    'pacman' => 'sudo pacman -Syu ' . ($package ?? 'apache'),
                    'brew' => 'brew upgrade ' . ($package ?? 'nginx'),
                    default => 'sudo apt-get install --only-upgrade ' . ($package ?? 'apache2'),
                };
                $commands = runtimeWebServerCommands($server, $distro);
                $steps[] = [
                    'id' => 'webserver-' . $server['id'],
                    'title' => 'Patch ' . $server['label']
                        . ($server['role'] === 'primary' ? ' (fronting this app)' : ' (also installed)')
                        . ($server['version'] !== null ? ' — currently ' . $server['version'] : ''),
                    'shell' => 'bash',
                    'code' => $upgradeCommand . "\n"
                        . $commands['configTest'] . "\n"
                        . $commands['reload'],
                    'note' => 'Package name comes from the ' . $distro['name'] . ' family (' . $distro['family']
                        . '). Always run the config test before reloading; reload is graceful, restart is not.',
                    'elevated' => true,
                ];
                $steps[] = [
                    'id' => 'webserver-order-' . $server['id'],
                    'title' => 'Reload order when PHP-FPM is involved (' . $server['label'] . ')',
                    'shell' => 'bash',
                    'code' => '# 1) PHP first, then the web server that proxies to it' . "\n"
                        . ($fpm['installed'] ? $fpm['reload'] . "\n" : '')
                        . $commands['reload'] . "\n"
                        . '# 2) confirm it is listening again' . "\n"
                        . $commands['status'],
                    'note' => 'If the site returns 502/503 after a PHP patch, reloading FPM then the web server '
                        . 'usually clears it.',
                    'elevated' => true,
                ];
            }
            if (count($webServers['servers']) > 1) {
                $steps[] = [
                    'id' => 'webserver-ambiguous',
                    'title' => 'Both web servers are installed — remove the one you do not use',
                    'shell' => 'bash',
                    'code' => '# inspect what is actually answering on 80/443 before removing anything' . "\n"
                        . 'sudo ss -ltnp | grep -E ":80|:443"' . "\n"
                        . 'sudo systemctl status ' . implode(' ', array_map(
                            static fn (array $s): string => (string)$s['service'],
                            $webServers['servers']
                        )) . ' --no-pager',
                    'note' => 'Keeping an unused web server installed is fine for patching; it only needs updates if '
                        . 'it is enabled.',
                    'elevated' => true,
                ];
            }
        }
    }

    $steps[] = [
        'id' => 'apache-verify',
        'title' => 'Verify the configuration',
        'shell' => 'bash',
        'code' => implode("\n", array_filter([
            runtimeIsWindowsEffective() ? '# Windows' : '# this host',
            runtimeIsWindowsEffective()
                ? '& "' . (string)($layout['apachePath'] ?? 'C:\\xampp\\apache\\bin\\httpd.exe') . '" -t'
                : null,
            !runtimeIsWindowsEffective() && isset($webServers['servers'][0]['configTest'])
                ? (string)$webServers['servers'][0]['configTest']
                : null,
            '# then open the app and the Apache monitoring dashboard (footer "online now")',
        ])),
        'note' => 'A config test costs nothing and catches a broken reload before it takes the site down.',
        'elevated' => false,
    ];

    return $steps;
}

/**
 * SQLite engine / libsqlite3.dll commands.
 *
 * @param array<string, mixed> $layout
 * @return list<array<string, mixed>>
 */
function runtimeInstructionsSqlite(array $layout): array
{
    $layoutId = (string)($layout['id'] ?? '');
    $root = (string)($layout['projectRoot'] ?? RUNTIME_PROJECT_ROOT);
    $distro = runtimeDetectDistro();
    $webServers = runtimeDetectWebServers();
    $fpm = runtimeFpmTargets();
    $steps = [];

    if ($layoutId === 'xampp' || $layoutId === 'vanilla') {
        $steps[] = [
            'id' => 'windows-sqlite',
            'title' => 'Install the supported SQLite build into PHP (elevated)',
            'shell' => 'powershell',
            'code' => 'cd "' . $root . '"' . "\n"
                . '.\\scripts\\install-sqlite-xampp.ps1',
            'note' => 'Stop Apache first — libsqlite3.dll is locked while the module is loaded. '
                . '3.53+ is the Windows parity target health.php checks (3.54.0 recommended).',
            'elevated' => true,
        ];
        $steps[] = [
            'id' => 'windows-sqlite-manual',
            'title' => 'Manual DLL refresh',
            'shell' => 'powershell',
            'code' => '$url = "https://www.sqlite.org/2026/sqlite-dll-win-x64-3540000.zip"' . "\n"
                . '$zip = Join-Path $env:TEMP (Split-Path $url -Leaf)' . "\n"
                . 'Invoke-WebRequest $url -OutFile $zip' . "\n"
                . 'Expand-Archive $zip -DestinationPath (Split-Path $zip) -Force' . "\n"
                . '# copy sqlite3.dll -> libsqlite3.dll next to php.ini (stop Apache first)',
            'note' => 'Match PHP bitness (x64) and keep the previous DLL so you can roll back.',
            'elevated' => true,
        ];
    } elseif ($layoutId === 'docker') {
        $container = runtimeContainerMeta();
        $steps[] = [
            'id' => 'docker-sqlite',
            'title' => 'Back up, rebuild the image, restore',
            'shell' => 'bash',
            'code' => $container['commands']['backupDb'] . "\n"
                . $container['commands']['rebuild'] . "\n"
                . $container['commands']['recreate'] . "\n"
                . $container['commands']['restore'],
            'note' => 'The PHP SQLite extension and libsqlite3 ship inside the image — a base-image bump or '
                . '`apt-get upgrade libsqlite3-0` in the Dockerfile is the patch. The compose file has no volumes, '
                . 'so the database must be copied out first.',
            'elevated' => false,
        ];
    } else {
        $packages = match ($distro['packageManager']) {
            'dnf', 'yum', 'microdnf' => 'sudo ' . $distro['packageManager'] . ' upgrade sqlite sqlite-libs',
            'apk' => 'sudo apk upgrade sqlite sqlite-libs',
            'zypper' => 'sudo zypper update sqlite3 libsqlite3-0',
            'pacman' => 'sudo pacman -Syu sqlite',
            'brew' => 'brew upgrade sqlite',
            default => 'sudo apt-get install --only-upgrade libsqlite3-0 sqlite3',
        };
        $reload = $fpm['installed']
            ? $fpm['reload']
            : runtimeWebServerCommands($webServers['servers'][0] ?? ['id' => 'apache'], $distro)['reload'];
        $steps[] = [
            'id' => 'linux-sqlite',
            'title' => 'Distribution packages (' . $distro['packageManager'] . ' — ' . $distro['name'] . ')',
            'shell' => 'bash',
            'code' => '# 1) back the database up first' . "\n"
                . 'cp ' . (string)(defined('DB_PATH') ? DB_PATH : 'data/linknest.db') . ' /tmp/linknest-backup-$(date +%F).db' . "\n"
                . '# 2) upgrade the library' . "\n"
                . $packages . "\n"
                . '# 3) reload so the new library is picked up' . "\n"
                . $reload,
            'note' => 'LinkNest targets SQLite 3.53+ (the Windows build we ships as a DLL). Distro packages may be '
                . 'older — Debian 12 ships 3.40, Ubuntu 24.04 ships 3.45. That is still safe to run, it just misses '
                . 'the newest query-planner and mmap improvements; only the Windows DLL is expected to match 3.54.0.',
            'elevated' => true,
        ];
        $steps[] = [
            'id' => 'linux-sqlite-source',
            'title' => 'Newer SQLite from source (optional, only if you need 3.53+)',
            'shell' => 'bash',
            'code' => 'cd /tmp' . "\n"
                . 'curl -fsSLO https://www.sqlite.org/2026/sqlite-autoconf-3540000.tar.gz' . "\n"
                . './configure --prefix=/opt/sqlite-3.54 && make -j"$(nproc)" && sudo make install' . "\n"
                . '# then point PHP at it (rebuild php-sqlite using /opt/sqlite-3.54) — usually not worth it',
            'note' => 'Prefer the distribution package: a hand-built libsqlite3 must match the PHP SQLite extension '
                . 'that was compiled against the system library.',
            'elevated' => true,
        ];
        $steps[] = [
            'id' => 'macos-sqlite',
            'title' => 'macOS (Homebrew)',
            'shell' => 'bash',
            'code' => 'brew upgrade sqlite',
            'note' => 'PHP from Homebrew uses the system SQLite in most builds — check with the verify command below.',
            'elevated' => false,
        ];
    }

    $steps[] = [
        'id' => 'sqlite-verify',
        'title' => 'Verify the engine',
        'shell' => 'bash',
        'code' => 'php -r "echo SQLite3::version()[\'versionString\'], PHP_EOL;"' . "\n"
            . '# then open /health.php?format=json and check the SQLite row',
        'note' => 'health.php reports the engine version and the journal mode it actually uses.',
        'elevated' => false,
    ];

    return $steps;
}

/**
 * Downtime reality for each component — shown next to the commands so nobody
 * is surprised by an Apache restart.
 *
 * @return array<string, array<string, mixed>>
 */
function runtimeDowntimeNotes(): array
{
    $windows = runtimeIsWindowsEffective();
    $container = runtimeIsDockerEffective();
    $webServers = runtimeDetectWebServers();
    $fpm = runtimeFpmTargets();
    $distro = runtimeDetectDistro();

    $phpSummary = $windows
        ? 'Apache loads php8apache2_4.dll, so the PHP folder cannot be swapped while it runs. Stop Apache, replace '
            . 'the folder, start Apache again — that is the whole outage.'
        : ($container
            ? 'PHP lives in the container image. Rebuild the image and recreate the container; the app is down for '
                . 'as long as the container takes to start.'
            : 'PHP is served by ' . $webServers['primaryLabel'] . ($fpm['installed'] ? ' + PHP-FPM' : '')
                . '. A package patch is applied with a graceful reload, so there is no outage.');

    $apacheSummary = $windows
        ? 'Swapping httpd binaries requires stopping the service; the config test (httpd -t) catches mistakes first.'
        : ($container
            ? 'The web server comes from the image — patching means a rebuild/recreate, not a service reload.'
            : 'A package patch is applied with ' . ($webServers['servers'] !== []
                ? implode(' / ', array_map(
                    static fn (array $s): string => runtimeWebServerCommands($s, $distro)['reload'],
                    $webServers['servers']
                ))
                : 'a service reload') . '; a reload keeps existing connections alive.');

    $sqliteSummary = $windows
        ? 'libsqlite3.dll is loaded by PHP, so Apache must be stopped to replace it on Windows.'
        : ($container
            ? 'The SQLite library ships in the image (PHP extension + libsqlite3) — patched by rebuilding the image.'
            : 'libsqlite3 is loaded into PHP workers; a reload of PHP-FPM/the web server picks up the new library. '
                . 'The 3.53+ expectation is a Windows-build parity target, not a Linux minimum.');

    return [
        'php' => [
            'requiresRestart' => $windows || $container,
            'window' => $windows ? '5–20 seconds' : ($container ? 'container restart' : '0 seconds (graceful reload)'),
            'summary' => $phpSummary,
            'planning' => 'Do the download, SHA256 check, extraction and php.ini merge first; only the swap needs the stop.',
        ],
        'node' => [
            'requiresRestart' => false,
            'window' => '0 seconds',
            'summary' => 'Node.js is not part of the request path: the browser loads the prebuilt dist/ bundle and PHP serves the API.',
            'planning' => 'Safe to do at any time, including during business hours.',
        ],
        'apache' => [
            'requiresRestart' => $windows || $container,
            'window' => $windows ? '5–20 seconds' : ($container ? 'container restart' : '0 seconds (systemctl reload)'),
            'summary' => $apacheSummary,
            'planning' => 'Run the config test first and keep a copy of conf/ plus the previous binaries.',
        ],
        'sqlite' => [
            'requiresRestart' => $windows || $container,
            'window' => $windows ? '5–20 seconds' : ($container ? 'container restart' : '0 seconds (reload)'),
            'summary' => $sqliteSummary,
            'planning' => 'Take a database backup first (Admin → Database → snapshot) even though the library swap is not a schema change.',
        ],
    ];
}

/**
 * Dispatcher: copy-paste guidance for one component.
 *
 * @param array<string, mixed> $layout enriched by runtimeBuildStatusPayload()
 * @param array<string, mixed>|null $candidate
 * @return array<string, mixed>
 */
function runtimeInstructions(string $component, array $layout, ?array $candidate = null): array
{
    $component = strtolower(trim($component));
    $downtime = runtimeDowntimeNotes();
    $distro = runtimeDetectDistro();
    $webServers = runtimeDetectWebServers();
    $windows = runtimeIsWindowsEffective();
    $container = runtimeIsDockerEffective();

    switch ($component) {
        case 'php':
            $steps = runtimeInstructionsPhp($layout, $candidate['latestForLine'] ?? null);
            break;
        case 'node':
        case 'npm':
            $steps = runtimeInstructionsNode($layout, $candidate);
            break;
        case 'apache':
            $steps = runtimeInstructionsApache($layout);
            break;
        case 'sqlite':
            $steps = runtimeInstructionsSqlite($layout);
            break;
        default:
            return [
                'component' => $component,
                'layout' => $layout['id'] ?? null,
                'steps' => [],
                'downtime' => null,
                'error' => 'Unknown component: ' . $component,
            ];
    }

    // A section that is really about the host's web server (not Apache) is titled honestly.
    $sectionTitle = null;
    if ($component === 'apache') {
        $sectionTitle = match ($webServers['primary']) {
            'nginx' => $webServers['ambiguous'] ? 'Web server patch (nginx + Apache)' : 'Web server patch (nginx)',
            'caddy' => 'Web server patch (Caddy)',
            'litespeed' => 'Web server patch (OpenLiteSpeed)',
            'none' => 'Web server patch (none detected)',
            default => $webServers['ambiguous'] ? 'Web server patch (Apache + nginx)' : 'Apache patch',
        };
    }

    return [
        'component' => $component,
        'layout' => $layout['id'] ?? null,
        'layoutLabel' => $layout['label'] ?? null,
        'sectionTitle' => $sectionTitle,
        'requiresElevation' => (bool)($layout['requiresElevation'] ?? false),
        'elevationLabel' => $windows
            ? 'Administrator'
            : ($container ? 'Docker host' : ($distro['family'] === 'darwin' ? 'sudo' : 'root / sudo')),
        'elevationNote' => $windows
            ? 'Run these in an elevated (Administrator) shell.'
            : ($container
                ? 'Run these on the Docker host, not inside the container.'
                : 'Run these as root or with sudo.'),
        'webServer' => [
            'primary' => $webServers['primary'],
            'label' => $webServers['primaryLabel'],
            'ambiguous' => (bool)$webServers['ambiguous'],
            'ids' => $webServers['ids'],
        ],
        'packageManager' => $distro['packageManager'],
        'steps' => $steps,
        'downtime' => $downtime[$component] ?? null,
        'docs' => [
            'runtime' => 'RUNTIME_UPDATES.md',
            'phpXampp' => 'XAMPP_PHP_UPGRADE.md',
            'phpVanilla' => 'VANILLA_APACHE_PHP_UPGRADE.md',
            'appUpdates' => 'APP_UPDATES.md',
        ],
        'readOnly' => true,
    ];
}

/**
 * Honest, per-component summary used by the panel header and the nav badge.
 * A component that could not be checked never renders as "up to date".
 *
 * @param array<string, mixed> $php
 * @param array<string, mixed> $node
 * @return array<string, mixed>
 */
function runtimeSummary(array $php, array $node): array
{
    $phpStatus = (string)($php['status'] ?? 'could-not-check');
    $nodeStatus = (string)($node['status'] ?? 'could-not-check');
    $phpPatch = !empty($php['patchAvailable']);
    $nodePatch = !empty($node['patchAvailable']);
    $phpSecurity = $phpPatch && !empty($php['security']);
    $nodeSecurity = $nodePatch && !empty($node['security']);

    // PHP line
    if ($phpPatch) {
        $phpLine = 'PHP ' . (string)$php['currentVersion'] . ' → ' . (string)$php['latestForLine']
            . ($phpSecurity ? ' (security patch)' : '');
    } elseif ($phpStatus === 'unsupported-line') {
        $supported = is_array($php['supportedLines'] ?? null) ? $php['supportedLines'] : [];
        $phpLine = 'PHP ' . (string)$php['currentVersion'] . ' runs on an unsupported line'
            . ($supported !== [] ? ' (php.net supports ' . implode(', ', $supported) . ')' : '');
    } elseif (!empty($php['newerMinorAvailable'])) {
        $phpLine = 'PHP ' . (string)$php['currentVersion'] . ': newer minor ' . (string)$php['latestAny'] . ' is published';
    } elseif ($phpStatus === 'could-not-check') {
        $phpLine = 'PHP could not be checked (vendor index unavailable)';
    } elseif ($phpStatus === 'up-to-date') {
        $phpLine = 'PHP ' . (string)$php['currentVersion'] . ' is up to date';
    } else {
        $phpLine = 'PHP ' . (string)$php['currentVersion'] . ' (' . $phpStatus . ')';
    }

    // Node.js line
    if (empty($node['installed'])) {
        $nodeLine = 'Node.js is not installed';
    } elseif ($nodePatch) {
        $nodeLine = 'Node.js ' . (string)$node['currentVersion'] . ' → ' . (string)$node['latestForLine']
            . ($nodeSecurity ? ' (security patch)' : '');
    } elseif ($nodeStatus === 'lts-upgrade-available') {
        $nodeLine = 'Node.js ' . (string)$node['currentVersion'] . ': a newer LTS line is available'
            . (!empty($node['latestLts']['version']) ? ' (' . (string)$node['latestLts']['version'] . ')' : '');
    } elseif (in_array($nodeStatus, ['could-not-check', 'unknown'], true)) {
        $nodeLine = 'Node.js could not be checked (vendor index unavailable)';
    } else {
        $nodeLine = 'Node.js ' . (string)$node['currentVersion'] . ' is up to date';
    }

    $couldNotCheck = !$phpPatch && in_array($phpStatus, ['could-not-check', 'unknown'], true)
        || (!$nodePatch && !empty($node['installed']) && in_array($nodeStatus, ['could-not-check', 'unknown'], true));

    return [
        'updateAvailable' => $phpPatch || $nodePatch,
        'securityAvailable' => $phpSecurity || $nodeSecurity,
        'patchCount' => (int)$phpPatch + (int)$nodePatch,
        'php' => $phpStatus,
        'node' => $nodeStatus,
        'couldNotCheck' => $couldNotCheck,
        'phpLine' => $phpLine,
        'nodeLine' => $nodeLine,
        'message' => $phpLine . ' · ' . $nodeLine,
    ];
}

/**
 * One-line "what is out of date" summary (kept for callers that only want the string).
 *
 * @param array<string, mixed> $php
 * @param array<string, mixed> $node
 */
function runtimeSummaryMessage(array $php, array $node): string
{
    return (string)(runtimeSummary($php, $node)['message'] ?? '');
}

/**
 * What this feature can and cannot do. Kept in the payload so the UI can state
 * the read-only contract explicitly.
 *
 * @return array<string, mixed>
 */
function runtimeCapabilities(): array
{
    return [
        'readOnly' => true,
        'inAppUpgrade' => false,
        'reason' => 'Read-only mode: versions and patches are reported, upgrades are run by the operator '
            . 'from an elevated shell using the generated commands.',
        'networkGetOnly' => true,
        'hostAllowlist' => RUNTIME_HOST_ALLOWLIST,
        'cacheTtlSeconds' => RUNTIME_CACHE_TTL,
        'procOpen' => runtimeCmdAllowed('proc_open'),
        'curl' => function_exists('curl_init'),
        'writes' => 'data/runtime-cache.json only',
        'platformProbes' => [
            'files' => ['/etc/os-release', '/usr/lib/os-release', '/.dockerenv', '/run/.containerenv', '/proc/self/cgroup'],
            'pathWalk' => true,
            'procScan' => PHP_OS_FAMILY === 'Linux',
            'childProcesses' => 'read-only version probes only (node -v, node -p process.arch, npm -v, httpd -v, nginx -v, php-fpm -v, caddy version, git --version)',
            'simulation' => runtimeSimulation()['active'],
        ],
    ];
}

/**
 * Full read-only status payload for the admin panel and the JSON report.
 *
 * @return array<string, mixed>
 */
function runtimeBuildStatusPayload(bool $forceCheck = false): array
{
    $phpInfo = runtimePhpInfo();
    $nodeInfo = runtimeNodeInfo();
    $apacheInfo = runtimeApacheInfo();
    $sqliteInfo = runtimeSqliteInfo();
    $gitInfo = runtimeGitInfo();
    $layout = runtimeDetectLayout($phpInfo, $apacheInfo);

    $phpCatalog = runtimePhpCatalog($forceCheck);
    $nodeCatalog = runtimeNodeCatalog($forceCheck);

    $php = runtimePhpCandidate($phpInfo, $phpCatalog, $forceCheck);
    $node = runtimeNodeCandidate($nodeInfo, $nodeCatalog);

    $layoutRich = $layout;
    $layoutRich['phpAssetName'] = $php['assetName'];
    $layoutRich['phpAssetUrl'] = $php['assetUrl'];
    $layoutRich['phpSha256'] = $php['sha256'];

    $webServers = runtimeDetectWebServers();
    $distro = runtimeDetectDistro();
    $fpm = runtimeFpmTargets($phpInfo);
    $container = runtimeContainerMeta();
    $simulation = runtimeSimulation();
    $summary = runtimeSummary($php, $node);

    $cache = runtimeCacheRead();

    return [
        'readOnly' => true,
        'generatedAt' => time(),
        'generatedAtIso' => date('c'),
        'host' => runtimeHostInfo($layout),
        'layout' => $layoutRich,
        'platform' => [
            'osFamily' => $simulation['osFamily'] !== null ? $simulation['osFamily'] : PHP_OS_FAMILY,
            'osLabel' => PHP_OS . ' / ' . php_uname('s') . ' ' . php_uname('r'),
            'distro' => $distro,
            'webServer' => $webServers,
            'fpm' => $fpm,
            'container' => $container,
            'shell' => [
                'elevation' => $distro['elevation'],
                'elevationShort' => (string)($layout['elevationShort'] ?? $distro['elevation']),
                'privilegedPrefix' => runtimeIsWindowsEffective() ? '' : 'sudo ',
                'serviceManager' => $distro['serviceManager'],
                'note' => runtimeIsWindowsEffective()
                    ? 'Run these in an elevated (Administrator) PowerShell or Command Prompt.'
                    : (runtimeIsDockerEffective()
                        ? 'Run these on the Docker host (not inside the container).'
                        : 'Run these as root or with sudo — a graceful reload avoids downtime.'),
            ],
            'simulation' => [
                'active' => (bool)$simulation['active'],
                'profile' => $simulation['profile'],
                'osFamily' => $simulation['osFamily'],
                'webServer' => $simulation['webServer'],
                'docker' => $simulation['docker'],
                'phpVersion' => $simulation['phpVersion'],
                'source' => $simulation['active'] ? 'LINKNEST_RUNTIME_SIMULATE' : null,
            ],
        ],
        'capabilities' => runtimeCapabilities(),
        'components' => [
            'php' => [
                'component' => 'php',
                'info' => $phpInfo,
                'update' => $php,
                'instructions' => runtimeInstructions('php', $layoutRich, $php),
            ],
            'node' => [
                'component' => 'node',
                'info' => $nodeInfo,
                'update' => $node,
                'instructions' => runtimeInstructions('node', $layoutRich, $node),
            ],
            'apache' => [
                'component' => 'apache',
                'info' => $apacheInfo,
                'update' => null,
                'instructions' => runtimeInstructions('apache', $layoutRich, null),
            ],
            'sqlite' => [
                'component' => 'sqlite',
                'info' => $sqliteInfo,
                'update' => null,
                'instructions' => runtimeInstructions('sqlite', $layoutRich, null),
            ],
            'git' => [
                'component' => 'git',
                'info' => $gitInfo,
                'update' => null,
                'instructions' => null,
            ],
        ],
        'downtime' => runtimeDowntimeNotes(),
        'sources' => [
            'php' => [
                'source' => $phpCatalog['source'] ?? null,
                'url' => $phpCatalog['url'] ?? null,
                'urls' => $phpCatalog['urls'] ?? [],
                'fetchedAt' => $phpCatalog['fetchedAt'] ?? null,
                'stale' => (bool)($phpCatalog['stale'] ?? false),
                'error' => $phpCatalog['error'] ?? null,
                'lineCount' => count($phpCatalog['lines'] ?? []),
                'supportedVersions' => $phpCatalog['supportedVersions'] ?? [],
                'windowsBuildIndex' => (bool)($phpCatalog['windowsBuildIndex'] ?? false),
            ],
            'node' => [
                'source' => $nodeCatalog['source'] ?? null,
                'url' => $nodeCatalog['url'] ?? null,
                'fetchedAt' => $nodeCatalog['fetchedAt'] ?? null,
                'stale' => (bool)($nodeCatalog['stale'] ?? false),
                'error' => $nodeCatalog['error'] ?? null,
                'lineCount' => count($nodeCatalog['lines'] ?? []),
            ],
        ],
        'cacheFile' => RUNTIME_CACHE_FILE,
        'cacheUpdatedAt' => $cache['updatedAt'],
        // Advisory auto-recheck hint (settings.runtime_check_interval_minutes, default 6).
        // Vendor indexes themselves stay cached for capabilities.cacheTtlSeconds (6 h).
        'checkIntervalMinutes' => max(1, (int)round(runtimeCheckIntervalMinutes() / 60)),
        'summary' => $summary,
    ];
}

/**
 * Downloadable Markdown diagnostics report (same data the panel shows).
 *
 * @param array<string, mixed> $payload
 */
function runtimeBuildMarkdownReport(array $payload): string
{
    $lines = [];
    $host = $payload['host'] ?? [];
    $layout = $payload['layout'] ?? [];
    $components = $payload['components'] ?? [];
    $php = $components['php']['update'] ?? [];
    $node = $components['node']['update'] ?? [];

    $lines[] = '# Underlying software report (read-only)';
    $lines[] = '';
    $lines[] = '- Generated: ' . (string)($payload['generatedAtIso'] ?? date('c'));
    $lines[] = '- Host: ' . (string)($host['os'] ?? 'unknown');
    $lines[] = '- Layout: ' . (string)($layout['label'] ?? 'unknown') . ' (`' . (string)($layout['id'] ?? '?') . '`)';
    $lines[] = '- Summary: ' . (string)($payload['summary']['message'] ?? '');
    $lines[] = '- This report was produced by the LinkNest runtime panel. **Nothing was installed, replaced or restarted.**';
    $lines[] = '';

    $lines[] = '## Current versions';
    $lines[] = '';
    $lines[] = '| Component | Version | Details |';
    $lines[] = '| --- | --- | --- |';
    $phpInfo = $components['php']['info'] ?? [];
    $nodeInfo = $components['node']['info'] ?? [];
    $apacheInfo = $components['apache']['info'] ?? [];
    $sqliteInfo = $components['sqlite']['info'] ?? [];
    $gitInfo = $components['git']['info'] ?? [];

    $lines[] = '| PHP | ' . (string)($phpInfo['version'] ?? '?') . ' | '
        . ((!empty($phpInfo['zts']) ? 'TS' : 'NTS') . ' · ' . (string)($phpInfo['arch'] ?? '?')
            . ' · ' . (string)($phpInfo['sapi'] ?? '?') . ' · ' . (string)($phpInfo['iniPath'] ?? 'php.ini unknown'))
        . ' |';
    $lines[] = '| Node.js | ' . (string)($nodeInfo['version'] ?? 'not installed') . ' | '
        . (string)($nodeInfo['arch'] ?? '?') . ' · ' . (string)($nodeInfo['path'] ?? 'path unknown') . ' |';
    $lines[] = '| npm | ' . (string)($nodeInfo['npmVersion'] ?? 'unknown') . ' | bundled with Node.js |';
    $lines[] = '| Apache | ' . (string)($apacheInfo['version'] ?? 'unknown') . ' | '
        . (string)($apacheInfo['path'] ?? 'not found') . ' |';
    $lines[] = '| SQLite | ' . (string)($sqliteInfo['engineVersion'] ?? 'unknown') . ' | '
        . (string)($sqliteInfo['journalMode'] ?? '?') . ' · schema ' . (string)($sqliteInfo['schemaVersion'] ?? '?')
        . ' · ' . runtimeFormatBytes((int)($sqliteInfo['dbBytes'] ?? 0)) . ' |';
    $lines[] = '| git | ' . (string)($gitInfo['version'] ?? 'not found') . ' | app '
        . (string)($gitInfo['appVersion'] ?? '?') . ' |';
    $lines[] = '';

    // Host / platform block — the part that changes on Linux and Docker.
    $platform = is_array($payload['platform'] ?? null) ? $payload['platform'] : [];
    $distro = is_array($platform['distro'] ?? null) ? $platform['distro'] : [];
    $webServer = is_array($platform['webServer'] ?? null) ? $platform['webServer'] : [];
    $fpm = is_array($platform['fpm'] ?? null) ? $platform['fpm'] : [];
    $container = is_array($platform['container'] ?? null) ? $platform['container'] : [];
    $shellInfo = is_array($platform['shell'] ?? null) ? $platform['shell'] : [];
    $simulation = is_array($platform['simulation'] ?? null) ? $platform['simulation'] : [];

    $lines[] = '## Host platform';
    $lines[] = '';
    $lines[] = '| Item | Value |';
    $lines[] = '| --- | --- |';
    $lines[] = '| OS family | ' . (string)($platform['osFamily'] ?? ($host['family'] ?? '?')) . ' |';
    $lines[] = '| Distribution | ' . (string)($distro['pretty'] ?? 'n/a')
        . (($distro['family'] ?? '') !== '' && ($distro['family'] ?? '') !== 'unknown' ? ' (' . (string)$distro['family'] . ')' : '')
        . ' |';
    $lines[] = '| Package manager | ' . (string)($distro['packageManager'] ?? 'unknown') . ' |';
    $lines[] = '| Web server | ' . (string)($webServer['primaryLabel'] ?? 'none detected')
        . ($webServer['ambiguous'] ?? false ? ' (more than one installed)' : '') . ' |';
    foreach ((array)($webServer['servers'] ?? []) as $server) {
        $lines[] = '| Web server detail | ' . (string)($server['label'] ?? $server['id'] ?? '?')
            . ' ' . (string)($server['version'] ?? 'version unknown')
            . ' — ' . (string)($server['path'] ?? 'path unknown')
            . ($server['processRunning'] ?? false ? ' (running)' : '') . ' |';
    }
    $lines[] = '| PHP SAPI | ' . (string)($webServer['sapi'] ?? ($host['phpSapi'] ?? '?')) . ' |';
    if (!empty($fpm['service'])) {
        $lines[] = '| PHP-FPM | ' . (string)$fpm['service']
            . ' — ' . (string)($fpm['socket'] ?? 'socket unknown')
            . ' (' . ((($fpm['installed'] ?? false) ? 'installed' : 'not detected')) . ') |';
    }
    if (!empty($container['isContainer'])) {
        $lines[] = '| Container | ' . (string)($container['runtime'] ?? 'container')
            . ' — service ' . (string)($container['service'] ?? '?')
            . ', container ' . (string)($container['container'] ?? '?')
            . ', ports ' . (string)($container['ports']['http'] ?? '?') . '/' . (string)($container['ports']['https'] ?? '?')
            . ', volume mounts: ' . (!empty($container['volumeMounts']) ? 'yes' : 'no') . ' |';
        $lines[] = '| Base images | PHP: ' . (string)($container['phpBaseImage'] ?? '?')
            . ' · Node: ' . (string)($container['nodeBaseImage'] ?? '?') . ' |';
    }
    $lines[] = '| Elevation | ' . (string)($shellInfo['elevation'] ?? '?')
        . ' — ' . (string)($shellInfo['note'] ?? '') . ' |';
    if (!empty($simulation['active'])) {
        $lines[] = '| Simulation | ACTIVE (profile: ' . (string)($simulation['profile'] ?? 'custom')
            . ', source ' . (string)($simulation['source'] ?? 'env') . ') — values below are simulated |';
    }
    $lines[] = '';

    $lines[] = '## Available updates';
    $lines[] = '';
    $lines[] = '| Component | Current | Available | Security | Status |';
    $lines[] = '| --- | --- | --- | --- | --- |';
    $lines[] = '| PHP | ' . (string)($php['currentVersion'] ?? '?') . ' → ' . (string)($php['latestForLine'] ?? 'n/a')
        . ' | line ' . (string)($php['latestAny'] ?? 'n/a') . ' | ' . (!empty($php['security']) ? 'yes' : 'no')
        . ' | ' . (string)($php['status'] ?? 'unknown') . ' |';
    $lines[] = '| Node.js | ' . (string)($node['currentVersion'] ?? '?') . ' → ' . (string)($node['latestForLine'] ?? 'n/a')
        . ' | LTS ' . (string)($node['latestLts']['version'] ?? 'n/a') . ' | ' . (!empty($node['security']) ? 'yes' : 'no')
        . ' | ' . (string)($node['status'] ?? 'unknown') . ' |';
    $lines[] = '';

    foreach (['php' => 'PHP', 'node' => 'Node.js', 'apache' => 'Apache', 'sqlite' => 'SQLite'] as $key => $label) {
        $instructions = $components[$key]['instructions'] ?? null;
        if (!is_array($instructions) || empty($instructions['steps'])) {
            continue;
        }
        $lines[] = '## ' . $label . ' — commands';
        $lines[] = '';
        if (!empty($instructions['downtime']['summary'])) {
            $lines[] = 'Downtime: **' . (string)$instructions['downtime']['window'] . '** — '
                . (string)$instructions['downtime']['summary'];
            $lines[] = '';
        }
        foreach ($instructions['steps'] as $step) {
            $lines[] = '### ' . (string)($step['title'] ?? 'Step');
            $lines[] = '';
            $lines[] = '```' . (string)($step['shell'] ?? '') ;
            $lines[] = rtrim((string)($step['code'] ?? ''));
            $lines[] = '```';
            if (!empty($step['note'])) {
                $lines[] = '_' . (string)$step['note'] . '_';
            }
            $lines[] = '';
        }
    }

    $lines[] = '## Sources';
    $lines[] = '';
    foreach (($payload['sources'] ?? []) as $key => $source) {
        $lines[] = '- ' . $key . ': ' . (string)($source['source'] ?? '?')
            . ' (' . (string)($source['url'] ?? '') . ')'
            . (!empty($source['stale']) ? ' — cached copy' : '')
            . (!empty($source['error']) ? ' — ' . (string)$source['error'] : '');
    }
    $lines[] = '';
    $lines[] = 'Guide: `docs/RUNTIME_UPDATES.md`';
    $lines[] = '';

    return implode("\n", $lines);
}




















