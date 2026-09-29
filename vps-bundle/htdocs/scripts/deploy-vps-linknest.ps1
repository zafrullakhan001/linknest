# ============================================================================
#  deploy-vps-linknest.ps1 - build, bundle and deploy LinkNest to a Linux VPS
#  (nginx + PHP-FPM) and optionally provision a local OpenLDAP for auth.
#
#  Entry point: deploy-vps-linknest.bat  (see docs/DEPLOY_VPS.md)
#    deploy-vps-linknest.bat root@198.251.72.41
#    deploy-vps-linknest.bat root@198.251.72.41 -Mode Update
#    deploy-vps-linknest.bat root@198.251.72.41 -Domain links.example.com -SkipOpenLdap
#
#  Safe to re-run: -Mode Auto detects an existing install and switches to an
#  update that preserves the remote data/ and uploads/ directories.
# ============================================================================
[CmdletBinding()]
param(
    # VPS target - user@host (positional, may be placed right after the script)
    [Parameter(Position = 0)][string]$Server = 'root@198.251.72.41',
    # Public hostname; default: linknest.<ip-with-dashes>.nip.io for an IP target
    [string]$Domain = '',
    [string]$AppUser = 'linknest',
    [string]$AppRoot = '',
    [ValidateSet('Auto', 'Fresh', 'Update')][string]$Mode = 'Auto',
    # OpenLDAP (on by default, as requested); -SkipOpenLdap leaves LDAP untouched
    [switch]$SkipOpenLdap,
    [string]$LdapBaseDn = 'dc=oneflorida,dc=org',
    [string]$LdapDomain = 'oneflorida.org',
    [string]$LdapOrg = '',
    [string]$LdapServicePassword = '',
    [string]$LdapAdminPassword = '',
    [string]$LeEmail = '',
    # Packaging
    [switch]$ExcludeDatabase,
    [switch]$SkipBuild,
    [switch]$SkipUpload,
    [string]$TarballPath = '',
    # Behaviour
    [switch]$SkipVerify,
    [int]$MaxChildren = 3,
    [string]$MemoryLimit = '384M',
    [switch]$Force,
    [switch]$DryRun,
    [switch]$Yes
)

$ErrorActionPreference = 'Continue'   # native tools (ssh/scp/tar/node) write warnings to
                                      # stderr; with 'Stop' PowerShell 5.1 would abort on them.
                                      # Every native call below therefore checks $LASTEXITCODE.
$ProgressPreference = 'SilentlyContinue'

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$DeployDir   = '/root/linknest-deploy'
$Stamp       = Get-Date -Format 'yyyyMMdd_HHmmss'
$StageDir    = Join-Path $ProjectRoot 'vps-bundle'
$DistDir     = Join-Path $ProjectRoot 'dist-vps'

function Step($m) { Write-Host "`n=== $m ===" -ForegroundColor Cyan }
function Info($m) { Write-Host "  $m" }
function Ok($m)   { Write-Host "  [ok]   $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  [warn] $m" -ForegroundColor Yellow }
function Die($m)  { Write-Host "  [FAIL] $m" -ForegroundColor Red; if ($env:LN_NO_PAUSE -ne '1') { }; exit 1 }
function Need($n) { if (-not (Get-Command $n -ErrorAction SilentlyContinue)) { Die "required command '$n' not found in PATH" } }

function Invoke-Remote([string]$Command, [switch]$AllowFail) {
    $out = & ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new $Server $Command 2>&1
    $code = $LASTEXITCODE
    if ($out) { $out | ForEach-Object { Write-Host $_ } }
    if ($code -ne 0 -and -not $AllowFail) { Die "remote command failed (exit $code): $Command" }
    return $code
}
function Send-Remote([string]$Local, [string]$Remote) {
    $out = & scp -o BatchMode=yes -o StrictHostKeyChecking=accept-new $Local "${Server}:${Remote}" 2>&1
    if ($LASTEXITCODE -ne 0) { $out | ForEach-Object { Write-Host $_ }; Die "scp failed: $Local -> $Remote" }
}
function Run-Step([string]$Name) {
    Step "remote: $Name"
    Invoke-Remote "bash $DeployDir/vps/$Name" | Out-Null
}
function New-TextFile([string]$Path, [string]$Content) {
    # always LF, no BOM - these files are consumed by bash/PHP on Linux
    $lf = $Content -replace "`r`n", "`n"
    [System.IO.File]::WriteAllText($Path, $lf, (New-Object System.Text.UTF8Encoding($false)))
}

# --------------------------------------------------------------- target parsing
if ($Server -notmatch '@') { $Server = "root@$Server" }
$RemoteHost = ($Server -split '@', 2)[1]
if (-not $Domain) {
    if ($RemoteHost -match '^\d{1,3}(\.\d{1,3}){3}$') {
        $Domain = 'linknest.' + ($RemoteHost -replace '\.', '-') + '.nip.io'
    } else {
        $Domain = "linknest.$RemoteHost"
    }
}
if (-not $AppRoot) { $AppRoot = "/home/$AppUser/htdocs" }
if (-not $LdapOrg) { $LdapOrg = $LdapDomain }
$AppUrl = "https://$Domain"

Step "LinkNest -> VPS deployment"
Info "server     : $Server"
Info "hostname   : $Domain   ($AppUrl)"
Info "app root   : $AppRoot   (user: $AppUser)"
Info "requested  : mode=$Mode  openldap=$(if ($SkipOpenLdap) { 'skip' } else { 'yes' })  database=$(if ($ExcludeDatabase) { 'fresh: start empty' } else { 'fresh: import local snapshot' })"
Info "local      : project=$ProjectRoot  dist=$DistDir"
Info "timestamp  : $Stamp"

# ============================================================================
# preflight
# ============================================================================
Step 'preflight (local tools + ssh)'
Need ssh
Need scp
Need tar
if (-not $SkipBuild) { Need node; Need npm }
if (-not $ExcludeDatabase -and $Mode -eq 'Fresh') { Need php }

function Remote-Output([string]$Command) {
    $out = & ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new $Server $Command 2>&1
    $script:RemoteCode = $LASTEXITCODE
    return ((($out | ForEach-Object { "$_" }) -join "`n")).Trim()
}

$null = Remote-Output 'echo ok'
if ($script:RemoteCode -ne 0) { Die "cannot ssh into $Server - verify passwordless SSH for this key" }
Ok "ssh connectivity to $Server"

# ---- upload the server-side helpers (small files, done before mode detection)
Step 'uploading deploy helpers'
Invoke-Remote "install -d -m 755 $DeployDir $DeployDir/vps $DeployDir/vps/templates" | Out-Null
foreach ($f in (Get-ChildItem (Join-Path $PSScriptRoot 'vps') -File)) { Send-Remote $f.FullName "$DeployDir/vps/" }
foreach ($f in (Get-ChildItem (Join-Path $PSScriptRoot 'vps\templates') -File)) { Send-Remote $f.FullName "$DeployDir/vps/templates/" }
foreach ($n in @('openldap-add-user.sh', 'openldap-provision-linknest.sh')) {
    $p = Join-Path $PSScriptRoot $n
    if (Test-Path $p) { Send-Remote $p "$DeployDir/" }
}
# normalise line endings + permissions (files came from Windows)
Invoke-Remote "sed -i 's/\r$//' $DeployDir/vps/*.sh $DeployDir/*.sh 2>/dev/null; chmod 750 $DeployDir/*.sh; chmod 755 $DeployDir/vps/*.sh" | Out-Null
Ok "helpers uploaded to $DeployDir"

# ---- remote facts
$factsRaw = Remote-Output "bash $DeployDir/vps/facts.sh '$AppRoot' '$Domain' '$AppUser'"
if ($script:RemoteCode -ne 0) { Die "could not read remote facts (see output above)" }
$F = @{}
foreach ($line in ($factsRaw -split "`n")) {
    if ($line -match '^([a-z_]+)=(.*)$') { $F[$matches[1]] = $matches[2].Trim() }
}
$PhpVer = $F['php']
Step 'remote host'
foreach ($k in @('os', 'kernel', 'nginx', 'php', 'certbot', 'slapd', 'disk_avail', 'mem_avail_mb', 'app_installed', 'cert', 'user')) {
    if ($F.ContainsKey($k)) { Info ("{0,-14}= {1}" -f $k, $F[$k]) }
}
if ($F['nginx'] -ne 'yes') { Die "nginx is not installed on the remote host" }
if ([string]::IsNullOrWhiteSpace($F['php'])) { Die "no PHP-FPM (/etc/php/*/fpm) found on the remote host" }
if (-not $SkipOpenLdap -and $F['certbot'] -ne 'yes') { Warn 'certbot missing on remote - TLS will fail (apt-get install -y certbot)' }

# ---- resolve mode
if ($Mode -eq 'Auto') {
    $Mode = if ($F['app_installed'] -eq 'yes') { 'Update' } else { 'Fresh' }
    Info "mode resolved from remote state: $Mode"
}
if ($Mode -eq 'Fresh' -and $F['app_installed'] -eq 'yes' -and -not $Force) {
    Die "a LinkNest install already exists at $AppRoot. Use -Mode Update (keeps data/uploads) or -Force to overwrite."
}
if ($Mode -eq 'Update' -and $F['app_installed'] -ne 'yes') {
    Warn "update requested but no install found at $AppRoot - falling back to Fresh"
    $Mode = 'Fresh'
}
if ($Mode -eq 'Update' -and -not $ExcludeDatabase) {
    Info 'update mode: the remote database and uploads are preserved (local DB not shipped)'
}

Step 'deployment plan'
Info "mode       : $Mode$(if (-not $SkipBuild) { ' (frontend will be rebuilt)' } else { ' (reusing existing build)' })"
Info "database   : $(if ($Mode -eq 'Update') { 'preserved on server' } elseif ($ExcludeDatabase) { 'server creates a fresh one' } else { 'local snapshot will be imported' })"
Info "openldap   : $(if ($SkipOpenLdap) { 'left untouched' } else { "$LdapBaseDn (install/harden/wire)" })"
Info "php-fpm    : pool '$AppUser' -> $AppUser socket, max_children=$MaxChildren, memory_limit=$MemoryLimit"
Info "steps      : app -> php-fpm -> nginx+TLS -> openldap -> wire ldap -> verify"
if ($DryRun) { Step 'dry run - stopping before any change'; exit 0 }
if (-not $Yes) {
    $answer = Read-Host "`nProceed with this deployment to $Server ? (y/N)"
    if ($answer -notmatch '^(y|yes)$') { Warn 'aborted by user'; exit 1 }
}

# ============================================================================
# build the frontend for a domain-root deploy
# ============================================================================
if (-not $SkipBuild) {
    Step 'build frontend (VITE_BASE_PATH=/, VITE_API_BASE=/api)'
    Push-Location $ProjectRoot
    try {
        $env:VITE_BASE_PATH = '/'
        $env:VITE_API_BASE = '/api'
        & node 'scripts/copy-tinymce-assets.mjs' | Out-Null
        # call the locally installed Vite directly (no npx/registry round-trip)
        $viteJs = Join-Path $ProjectRoot 'node_modules\vite\bin\vite.js'
        if (-not (Test-Path $viteJs)) { Die "vite is not installed - run 'npm install' in $ProjectRoot first" }
        & node $viteJs build --mode production --outDir dist-vps
        if ($LASTEXITCODE -ne 0) { Die 'vite build failed' }
    } finally {
        Remove-Item Env:\VITE_BASE_PATH -ErrorAction SilentlyContinue
        Remove-Item Env:\VITE_API_BASE -ErrorAction SilentlyContinue
        Pop-Location
    }
    $indexHtml = Join-Path $DistDir 'index.html'
    if (-not (Test-Path $indexHtml)) { Die "build output missing: $indexHtml" }
    if ((Get-Content $indexHtml -Raw) -match '/linknest/') { Die 'built SPA still references /linknest/ - check VITE_BASE_PATH' }
    $distMb = [math]::Round(((Get-ChildItem $DistDir -Recurse -File | Measure-Object Length -Sum).Sum / 1MB), 1)
    Ok "frontend built: dist-vps ($distMb MB), referencing /assets/ and /api"
}
if (-not (Test-Path (Join-Path $DistDir 'index.html'))) { Die "-SkipBuild used but $DistDir/index.html does not exist" }

# ============================================================================
# database snapshot (fresh installs only)
# ============================================================================
$DbFile = ''
if ($Mode -eq 'Fresh' -and -not $ExcludeDatabase) {
    Step 'database snapshot (consistent copy via VACUUM INTO)'
    Need php
    $srcDb = Join-Path $ProjectRoot 'data\linknest.db'
    if (-not (Test-Path $srcDb)) { Die "local database not found: $srcDb (use -ExcludeDatabase for an empty install)" }
    $DbFile = Join-Path $ProjectRoot 'data\linknest-vps.db'
    Remove-Item $DbFile -ErrorAction SilentlyContinue
    $vacuum = @'
$src = $argv[1]; $dst = $argv[2];
$db = new PDO("sqlite:" . $src);
$db->exec("VACUUM INTO " . $db->quote($dst));
$a = new PDO("sqlite:" . $src); $b = new PDO("sqlite:" . $dst);
foreach (["tiles","links","users","settings"] as $t) {
  $ca = (int)$a->query("SELECT COUNT(*) FROM \"$t\"")->fetchColumn();
  $cb = (int)$b->query("SELECT COUNT(*) FROM \"$t\"")->fetchColumn();
  echo "  $t: $cb rows " . ($ca === $cb ? "OK" : "MISMATCH") . PHP_EOL;
}
echo "  integrity=" . $b->query("PRAGMA integrity_check")->fetchColumn()
   . " schema=" . $b->query("PRAGMA user_version")->fetchColumn()
   . " size=" . round(filesize($dst)/1048576,1) . " MB" . PHP_EOL;
'@
    $tmpPhp = Join-Path $env:TEMP "ln-vacuum-$Stamp.php"
    New-TextFile $tmpPhp $vacuum
    & php $tmpPhp $srcDb $DbFile
    $ok = ($LASTEXITCODE -eq 0 -and (Test-Path $DbFile))
    Remove-Item $tmpPhp -ErrorAction SilentlyContinue
    if (-not $ok) { Die 'database snapshot failed' }
    if (-not (Test-Path (Join-Path $ProjectRoot 'data\.encryption_key'))) {
        Die 'data\.encryption_key is missing - encrypted settings (SMTP/SAML/LDAP secrets) could not be decrypted on the VPS'
    }
    Ok 'database snapshot verified'
}

# ============================================================================
# staging
# ============================================================================
Step 'staging the bundle'
Remove-Item $StageDir -Recurse -Force -ErrorAction SilentlyContinue
$StageApp = Join-Path $StageDir 'htdocs'
New-Item -ItemType Directory -Force -Path $StageApp | Out-Null

foreach ($d in @('api', 'config', 'docs', 'land', 'scripts', 'vendor', 'monitorv2', 'migrations')) {
    $p = Join-Path $ProjectRoot $d
    if (Test-Path $p) { Copy-Item $p (Join-Path $StageApp $d) -Recurse -Force }
}
Copy-Item $DistDir (Join-Path $StageApp 'dist') -Recurse -Force
New-Item -ItemType Directory -Force -Path (Join-Path $StageApp 'analytics\geoip') | Out-Null
Copy-Item (Join-Path $ProjectRoot 'analytics\geoip\*') (Join-Path $StageApp 'analytics\geoip') -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item (Join-Path $ProjectRoot 'analytics\schema.sql') (Join-Path $StageApp 'analytics\') -Force -ErrorAction SilentlyContinue

foreach ($f in @(
        's.php', 'health.php', 'health.js', 'health.css', 'sw-cache-first.php', 'landing.php',
        'docker-landing.php', 'router.php', 'clones.php', 'backup_restore.php', 'backup_restore_docker.php',
        'migrate_templates.php', 'check_opcache.php', 'check_monitor_rules.php', 'check_rules.php',
        'check_versions.php', 'force_status_change.php', 'robots.txt', 'BUILD_INFO.json', '.htaccess')) {
    $p = Join-Path $ProjectRoot $f
    if (Test-Path $p) { Copy-Item $p (Join-Path $StageApp $f) -Force }
}

if ($Mode -eq 'Fresh') {
    foreach ($d in @('data\backups', 'data\exports', 'data\tmp', 'logs')) {
        New-Item -ItemType Directory -Force -Path (Join-Path $StageApp $d) | Out-Null
    }
    if ($DbFile) { Copy-Item $DbFile (Join-Path $StageApp 'data\linknest.db') -Force }
    $key = Join-Path $ProjectRoot 'data\.encryption_key'
    if (Test-Path $key) { Copy-Item $key (Join-Path $StageApp 'data\') -Force }
    if (Test-Path (Join-Path $ProjectRoot 'data\cache')) {
        Copy-Item (Join-Path $ProjectRoot 'data\cache') (Join-Path $StageApp 'data\cache') -Recurse -Force
    }
    if (Test-Path (Join-Path $ProjectRoot 'uploads')) {
        & robocopy (Join-Path $ProjectRoot 'uploads') (Join-Path $StageApp 'uploads') /E /NFL /NDL /NJH /NJS /NP /R:1 /W:1 | Out-Null
        if ($LASTEXITCODE -ge 8) { Warn 'some files under uploads/ could not be copied (locked or ACL-restricted) - the app still runs, those media items would be missing' }
    }
} else {
    Info 'update mode: data/, uploads/ and logs/ are NOT shipped (the server copies are kept)'
}
$stageMb = [math]::Round(((Get-ChildItem $StageApp -Recurse -File -Force | Measure-Object Length -Sum).Sum / 1MB), 1)
foreach ($need in @('api\index.php', 'api\config.php', 'dist\index.html', 's.php', 'health.php', 'vendor\autoload.php')) {
    if (-not (Test-Path (Join-Path $StageApp $need))) { Die "staging incomplete: $need is missing" }
}
if ($Mode -eq 'Fresh' -and -not $ExcludeDatabase) {
    foreach ($need in @('data\linknest.db', 'data\.encryption_key')) {
        if (-not (Test-Path (Join-Path $StageApp $need))) { Die "staging incomplete: $need is missing" }
    }
}
Ok "staged $stageMb MB -> $StageApp"

# ============================================================================
# archive
# ============================================================================
Step 'creating the archive'
if (-not $TarballPath) { $TarballPath = Join-Path $ProjectRoot "linknest-vps-$Stamp.tar.gz" }
$notes = @"
LinkNest VPS bundle - $Stamp
target   : $AppUrl  ($Server)
mode     : $Mode
app root : $AppRoot   (user: $AppUser)
php-fpm  : pool $AppUser
created  : $Stamp

Created by scripts/deploy-vps-linknest.ps1 - see docs/DEPLOY_VPS.md.
Update mode preserves data/ and uploads/ on the server.
"@
New-TextFile (Join-Path $StageDir 'DEPLOY_NOTES.txt') $notes
Push-Location $StageDir
try {
    & tar -czf $TarballPath htdocs DEPLOY_NOTES.txt
    if ($LASTEXITCODE -ne 0) { Die 'tar failed' }
} finally { Pop-Location }
$tarList = & tar -tzf $TarballPath 2>&1
if (-not (($tarList | Select-String -SimpleMatch 'htdocs/api/index.php' -Quiet))) { Die 'archive does not contain htdocs/api/index.php' }
if (-not (($tarList | Select-String -SimpleMatch 'htdocs/dist/index.html' -Quiet))) { Die 'archive does not contain htdocs/dist/index.html' }
Ok "archive: $TarballPath ($([math]::Round((Get-Item $TarballPath).Length / 1MB, 1)) MB, verified)"

# ============================================================================
# upload + remote configuration
# ============================================================================
$LdapServiceDn = "cn=linknest,ou=services,$LdapBaseDn"
$BundleName = Split-Path -Leaf $TarballPath
$RemoteTarball = "$DeployDir/$BundleName"

if ($SkipUpload) {
    Info "-SkipUpload: assuming $RemoteTarball already exists on the server"
} else {
    Step "uploading $BundleName"
    Send-Remote $TarballPath "$DeployDir/"
    Ok "uploaded -> $RemoteTarball"
}

# optional explicit LDAP passwords are shipped as files (no shell quoting issues)
if (-not $SkipOpenLdap) {
    if ($LdapAdminPassword) {
        $p = Join-Path $StageDir 'openldap-admin-password.txt'
        New-TextFile $p $LdapAdminPassword
        Send-Remote $p "$DeployDir/"
        Invoke-Remote "chmod 600 $DeployDir/openldap-admin-password.txt" | Out-Null
        Ok 'custom OpenLDAP admin password supplied'
    }
    if ($LdapServicePassword) {
        $p = Join-Path $StageDir 'openldap-linknest-service-password.txt'
        New-TextFile $p $LdapServicePassword
        Send-Remote $p "$DeployDir/"
        Invoke-Remote "chmod 600 $DeployDir/openldap-linknest-service-password.txt" | Out-Null
        Ok 'custom LinkNest service bind password supplied'
    }
}

Step 'writing deploy.env on the server'
$EnvText = @"
DEPLOY_MODE=$($Mode.ToLower())
DOMAIN=$Domain
APP_USER=$AppUser
APP_ROOT=$AppRoot
SESSIONS_DIR=/home/$AppUser/sessions
POOL=$AppUser
SITE=linknest
EDGE=nginx
TARBALL=$RemoteTarball
PHP_VER=$PhpVer
MAX_CHILDREN=$MaxChildren
MEMORY_LIMIT=$MemoryLimit
LE_EMAIL=$LeEmail
OPENLDAP=$(if ($SkipOpenLdap) { 'no' } else { 'yes' })
LDAP_HOST=127.0.0.1
LDAP_PORT=389
LDAP_BASE_DN=$LdapBaseDn
LDAP_DOMAIN=$LdapDomain
LDAP_ORG=$LdapOrg
LDAP_SERVICE_DN=$LdapServiceDn
LDAP_SERVICE_PASSWORD=
"@
$EnvLocal = Join-Path $StageDir 'deploy.env'
New-TextFile $EnvLocal $EnvText
Send-Remote $EnvLocal "$DeployDir/"
Ok 'deploy.env written'

# ============================================================================
# remote steps
# ============================================================================
Run-Step 'step10-app.sh'
Run-Step 'step20-php-fpm.sh'
Run-Step 'step30-nginx.sh'
if (-not $SkipOpenLdap) {
    Run-Step 'step40-openldap.sh'
    Run-Step 'step50-wire-ldap.sh'
} else {
    Info 'OpenLDAP steps skipped (-SkipOpenLdap)'
}
if (-not $SkipVerify) { Run-Step 'step90-verify.sh' }

# ============================================================================
# summary
# ============================================================================
Step 'deployment summary'
Info "url        : $AppUrl"
Info "mode       : $Mode   (server: $Server)"
Info "app root   : $AppRoot   (user: $AppUser, pool: $AppUser, php: $PhpVer)"
Info "nginx site : /etc/nginx/sites-available/linknest"
Info "logs       : /var/log/nginx/linknest.access.log, /var/log/nginx/linknest.error.log"
if (-not $SkipOpenLdap) {
    Info "openldap   : slapd on 127.0.0.1:389, base $LdapBaseDn (loopback only)"
    Info "secrets    : on the server in $DeployDir/"
    Info "             - openldap-admin-password.txt"
    Info "             - openldap-linknest-service-password.txt"
    Info "             - openldap-user-passwords.csv"
    Info "add user   : ssh $Server '$DeployDir/openldap-add-user.sh <username> `"<Display Name>`"'"
    Info "note       : new LDAP users must be approved once in Admin -> Users on first sign-in"
}
Info "local      : $TarballPath (redeploy/rollback artefact)"
Ok 'deployment finished - open the URL above'
