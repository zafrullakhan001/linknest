#Requires -Version 5.1
<#
.SYNOPSIS
    Rebuild the Apache+PHP runtime ZIP and the LinkNest deploy ZIP, then
    upload them to GitHub Release tag apache-php85-runtime.

.DESCRIPTION
    This is the Windows "new host" bootstrap publisher. It does NOT bump
    app versions and does NOT become GitHub Latest (make_latest=false).
    App Updates still uses vX.Y.Z + linknest-update-vX.Y.Z.zip.

    Double-click publish-windows-bootstrap-bundles.bat in the repo root, or:

        .\scripts\publish-windows-bootstrap-bundles.ps1
        .\scripts\publish-windows-bootstrap-bundles.ps1 -Yes
        .\scripts\publish-windows-bootstrap-bundles.ps1 -SkipUpload
        .\scripts\publish-windows-bootstrap-bundles.ps1 -IncludeDatabase -Yes
        .\scripts\publish-windows-bootstrap-bundles.ps1 -IncludeUploads

    Auth: GITHUB_TOKEN / GH_TOKEN, gh auth login, or Git Credential Manager.

.PARAMETER Yes
    Skip the Continue? confirmation.
.PARAMETER SkipUpload
    Build local ZIPs only (no GitHub API).
.PARAMETER SkipRuntime
    Do not rebuild the Apache/PHP ZIP; reuse the newest timestamped one.
.PARAMETER SkipApp
    Do not rebuild the LinkNest deploy ZIP; reuse the newest timestamped one.
.PARAMETER SkipBuild
    Pass -SkipBuild to package-for-deployment.ps1 (reuse existing dist/).
.PARAMETER IncludeDatabase
    Pass -IncludeDatabase to the app packager.
.PARAMETER IncludeUploads
    Pass through so the app ZIP includes this PC's uploads/ (off by default —
    test videos and other local uploads are not bundled).
.PARAMETER DryRun
    Package and copy stable names; do not upload.
.PARAMETER Token
    GitHub PAT (repo scope).
.PARAMETER Repo
    owner/repo. Default: git remote origin.
.PARAMETER Tag
    GitHub Release tag. Default: apache-php85-runtime.
#>
param(
    [Alias('y')]
    [switch]$Yes,
    [switch]$SkipUpload,
    [switch]$SkipRuntime,
    [switch]$SkipApp,
    [switch]$SkipBuild,
    [switch]$IncludeDatabase,
    [switch]$IncludeUploads,
    [switch]$DryRun,
    [string]$Token = '',
    [string]$Repo = '',
    [string]$Tag = 'apache-php85-runtime'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$ProjectRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $ProjectRoot 'package.json'))) {
    throw "Cannot locate project root (package.json) from $PSScriptRoot"
}
Set-Location $ProjectRoot

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Get-GitHubTokenFromGitCredential {
    $prevPrompt = $env:GIT_TERMINAL_PROMPT
    $env:GIT_TERMINAL_PROMPT = '0'
    try {
        $spec = "protocol=https`nhost=github.com`n`n"
        $raw = $spec | git credential fill 2>$null
        if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($raw)) {
            return ''
        }
        foreach ($line in @($raw -split "`r?`n")) {
            if ($line -match '^password=(.+)$') {
                return $Matches[1].Trim()
            }
        }
    } finally {
        if ($null -eq $prevPrompt) {
            Remove-Item Env:GIT_TERMINAL_PROMPT -ErrorAction SilentlyContinue
        } else {
            $env:GIT_TERMINAL_PROMPT = $prevPrompt
        }
    }
    return ''
}

function Get-GitHubToken {
    param([string]$Explicit)
    if (-not [string]::IsNullOrWhiteSpace($Explicit)) { return $Explicit.Trim() }
    if (-not [string]::IsNullOrWhiteSpace($env:GITHUB_TOKEN)) { return $env:GITHUB_TOKEN.Trim() }
    if (-not [string]::IsNullOrWhiteSpace($env:GH_TOKEN)) { return $env:GH_TOKEN.Trim() }
    $gh = Get-Command gh -ErrorAction SilentlyContinue
    if ($gh) {
        $fromGh = & gh auth token 2>$null
        if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($fromGh)) {
            return ([string]$fromGh).Trim()
        }
    }
    $fromGit = Get-GitHubTokenFromGitCredential
    if (-not [string]::IsNullOrWhiteSpace($fromGit)) {
        return $fromGit
    }
    return ''
}

function Get-GitHubRepoSlug {
    param([string]$Explicit)
    if (-not [string]::IsNullOrWhiteSpace($Explicit)) {
        return $Explicit.Trim()
    }
    $url = (git remote get-url origin 2>$null)
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($url)) {
        throw 'Cannot detect repo. Pass -Repo owner/name'
    }
    if ($url -match 'github\.com[:/]([^/]+)/([^/\s]+?)(?:\.git)?$') {
        return "$($Matches[1])/$($Matches[2] -replace '\.git$','')"
    }
    throw 'origin remote is not a GitHub URL. Pass -Repo owner/name'
}

function Invoke-GitHubApi {
    param(
        [string]$Method,
        [string]$Url,
        [string]$Token,
        [object]$Body = $null
    )
    $headers = @{
        'Authorization'        = "Bearer $Token"
        'Accept'               = 'application/vnd.github+json'
        'User-Agent'           = 'LinkNest-Windows-Bootstrap-Publish'
        'X-GitHub-Api-Version' = '2022-11-28'
    }
    $params = @{
        Method      = $Method
        Uri         = $Url
        Headers     = $headers
        ErrorAction = 'Stop'
    }
    if ($null -ne $Body) {
        $params.Body = ($Body | ConvertTo-Json -Depth 6 -Compress)
        $params.ContentType = 'application/json'
    }
    return Invoke-RestMethod @params
}

function Get-LatestTimestampedZip {
    param(
        [string]$Directory,
        [string]$Regex
    )
    $hit = Get-ChildItem -LiteralPath $Directory -Filter '*.zip' -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match $Regex } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    if (-not $hit) {
        throw "No ZIP matching /$Regex/ in $Directory"
    }
    return $hit.FullName
}

function Copy-StableName {
    param([string]$Source, [string]$DestName)
    $dest = Join-Path $ProjectRoot $DestName
    Copy-Item -LiteralPath $Source -Destination $dest -Force
    return $dest
}

function Send-ReleaseAsset {
    param(
        [object]$Release,
        [string]$Token,
        [string]$RepoSlug,
        [string]$AssetPath,
        [string]$AssetName
    )
    if ($Release.assets) {
        foreach ($asset in @($Release.assets)) {
            if ($asset.name -eq $AssetName) {
                Write-Host "  Replacing existing asset $AssetName" -ForegroundColor Yellow
                Invoke-GitHubApi -Method DELETE -Url "https://api.github.com/repos/$RepoSlug/releases/assets/$($asset.id)" -Token $Token | Out-Null
            }
        }
    }
    $uploadUrl = ($Release.upload_url -replace '\{\?name,label\}$', '') + '?name=' + [uri]::EscapeDataString($AssetName)
    $sizeMb = [math]::Round((Get-Item -LiteralPath $AssetPath).Length / 1MB, 1)
    Write-Host "  Uploading $AssetName ($sizeMb MB)..." -ForegroundColor Cyan
    $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
    if (-not $curl) {
        throw 'curl.exe is required to upload large ZIP assets'
    }
    $curlArgs = @(
        '-sS', '-f', '-L',
        '-X', 'POST',
        '-H', "Authorization: Bearer $Token",
        '-H', 'Accept: application/vnd.github+json',
        '-H', 'Content-Type: application/zip',
        '-H', 'User-Agent: LinkNest-Windows-Bootstrap-Publish',
        '--data-binary', "@$AssetPath",
        $uploadUrl
    )
    $out = & curl.exe @curlArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Asset upload failed for $AssetName (curl exit $LASTEXITCODE)"
    }
    $uploaded = $out | ConvertFrom-Json
    Write-Host "  OK $($uploaded.browser_download_url)" -ForegroundColor Green
}

# ---------------------------------------------------------------------------
$pkgJson = Get-Content (Join-Path $ProjectRoot 'package.json') -Raw | ConvertFrom-Json
$appVersion = [string]$pkgJson.version
$RepoSlug = Get-GitHubRepoSlug -Explicit $Repo
$branch = ([string](git branch --show-current 2>$null)).Trim()
if ([string]::IsNullOrWhiteSpace($branch)) { $branch = 'HEAD' }

Write-Host ""
Write-Host "  LinkNest Windows bootstrap bundles" -ForegroundColor Cyan
Write-Host "  App version : $appVersion" -ForegroundColor Gray
Write-Host "  Repo        : $RepoSlug" -ForegroundColor Gray
Write-Host "  Release tag : $Tag" -ForegroundColor Gray
Write-Host "  Branch      : $branch" -ForegroundColor Gray
Write-Host "  Runtime ZIP : $(if ($SkipRuntime) { 'reuse newest' } else { 'rebuild' })" -ForegroundColor Gray
Write-Host "  App ZIP     : $(if ($SkipApp) { 'reuse newest' } else { 'rebuild' })  (fresh DB=$(-not $IncludeDatabase); uploads=$(if ($IncludeUploads) { 'included' } else { 'excluded' }))" -ForegroundColor Gray
Write-Host "  Upload      : $(if ($SkipUpload -or $DryRun) { 'no' } else { 'yes' })" -ForegroundColor Gray
Write-Host ""

if (-not $Yes -and -not $SkipUpload -and -not $DryRun) {
    $answer = Read-Host "  Rebuild bundles and publish to GitHub Release '$Tag'? [y/N]"
    if ($answer -notmatch '^(y|yes)$') {
        Write-Host "  Cancelled." -ForegroundColor Yellow
        exit 1
    }
}

$runtimePs1 = Join-Path $PSScriptRoot 'package-vanilla-apache-php85.ps1'
$appPs1 = Join-Path $ProjectRoot 'package-for-deployment.ps1'
if (-not (Test-Path $runtimePs1)) { throw "Missing $runtimePs1" }
if (-not (Test-Path $appPs1)) { throw "Missing $appPs1" }

if (-not $SkipRuntime) {
    Write-Step 'Packaging Apache + PHP 8.5 runtime'
    & $runtimePs1
    if ($LASTEXITCODE -ne 0) { throw "Runtime packager failed (exit $LASTEXITCODE)" }
}

$runtimeSrc = Get-LatestTimestampedZip -Directory $ProjectRoot -Regex '^linknest-apache-php85-runtime-\d{8}_\d{6}\.zip$'
$runtimeStable = Copy-StableName $runtimeSrc 'linknest-apache-php85-runtime.zip'
Write-Host "  Runtime: $runtimeSrc" -ForegroundColor Gray
Write-Host "  Stable : $runtimeStable" -ForegroundColor Gray

if (-not $SkipApp) {
    Write-Step 'Packaging LinkNest full deploy ZIP'
    $packArgs = @{}
    if ($SkipBuild) { $packArgs.SkipBuild = $true }
    if ($IncludeDatabase) { $packArgs.IncludeDatabase = $true }
    if (-not $IncludeUploads) { $packArgs.ExcludeUploads = $true }
    & $appPs1 @packArgs
    if ($LASTEXITCODE -ne 0) { throw "App packager failed (exit $LASTEXITCODE)" }
}

$deploySrc = Get-LatestTimestampedZip -Directory $ProjectRoot -Regex '^linknest-deploy-\d{8}_\d{6}\.zip$'
$deployStable = Copy-StableName $deploySrc 'linknest-deploy.zip'
$updateName = "linknest-update-v$appVersion.zip"
$updateSrc = Join-Path $ProjectRoot $updateName
if (-not (Test-Path $updateSrc)) {
    Write-Warning "Updater asset not found: $updateSrc (continuing without it)"
    $updateSrc = ''
}
Write-Host "  Deploy : $deploySrc" -ForegroundColor Gray
Write-Host "  Stable : $deployStable" -ForegroundColor Gray

if ($SkipUpload -or $DryRun) {
    Write-Host ""
    Write-Host "  Local bundles ready (no GitHub upload)." -ForegroundColor Green
    Write-Host "  $runtimeStable"
    Write-Host "  $deployStable"
    if ($updateSrc) { Write-Host "  $updateSrc" }
    Write-Host ""
    Write-Host "  Docs: docs\WINDOWS_BOOTSTRAP_BUNDLES.md"
    exit 0
}

$AuthToken = Get-GitHubToken -Explicit $Token
if ([string]::IsNullOrWhiteSpace($AuthToken)) {
    throw @"
No GitHub token found.

Set GITHUB_TOKEN / GH_TOKEN, run gh auth login, or sign in with Git Credential Manager.
Classic PAT (repo scope): https://github.com/settings/tokens/new?scopes=repo
"@
}

Write-Step "Publishing GitHub Release $Tag"
$api = "https://api.github.com/repos/$RepoSlug"
$release = $null
try {
    $release = Invoke-GitHubApi -Method GET -Url "$api/releases/tags/$Tag" -Token $AuthToken
} catch {
    $release = $null
}

$dbLine = if ($IncludeDatabase) { 'Includes this PC live SQLite database.' } else { 'Fresh database on first launch (live DB not shipped).' }
$notes = @"
## Windows bootstrap bundles (Apache + PHP runtime + LinkNest app)

Two ZIPs for a new machine. This is **not** an in-app App Update. App Updates still uses ``linknest-update-vX.Y.Z.zip`` on version tags.

### 1) Apache + PHP 8.5 runtime
``linknest-apache-php85-runtime.zip``

Extract to **D:\**, then run ``install-runtime.bat`` as Administrator.
Install [VC++ 2015-2022 x64](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist) if needed.

### 2) LinkNest full deploy package (v$appVersion)
``linknest-deploy.zip``

$dbLine
Extract, then copy into ``D:\Apache\htdocs\linknest`` (vanilla Apache) or run ``deploy-xampp.bat`` (XAMPP).

### Order on the remote PC
1. Download both ZIPs from this release (private repo: sign in first)
2. Extract Apache/PHP ZIP to **D:\** and run ``install-runtime.bat`` as Administrator
3. Extract LinkNest ZIP into ``D:\Apache\htdocs\linknest``
4. Open ``http://localhost/linknest/``

Stable URLs:
- https://github.com/$RepoSlug/releases/download/$Tag/linknest-apache-php85-runtime.zip
- https://github.com/$RepoSlug/releases/download/$Tag/linknest-deploy.zip

Rebuild on a build PC: ``publish-windows-bootstrap-bundles.bat``
Docs: ``docs/WINDOWS_BOOTSTRAP_BUNDLES.md``
"@

$payload = @{
    name        = 'Windows runtime + LinkNest deploy bundles'
    body        = $notes
    draft       = $false
    prerelease  = $false
    make_latest = 'false'
}

if ($release) {
    Write-Host "  Release exists (id=$($release.id)) - updating notes" -ForegroundColor Gray
    $release = Invoke-GitHubApi -Method PATCH -Url "$api/releases/$($release.id)" -Token $AuthToken -Body $payload
} else {
    Write-Host "  Creating release $Tag" -ForegroundColor Cyan
    $create = $payload.Clone()
    $create['tag_name'] = $Tag
    $create['target_commitish'] = $branch
    $release = Invoke-GitHubApi -Method POST -Url "$api/releases" -Token $AuthToken -Body $create
}

Send-ReleaseAsset -Release $release -Token $AuthToken -RepoSlug $RepoSlug -AssetPath $runtimeStable -AssetName 'linknest-apache-php85-runtime.zip'
# Re-fetch so we do not delete the asset we just uploaded when names collide
$release = Invoke-GitHubApi -Method GET -Url "$api/releases/$($release.id)" -Token $AuthToken
Send-ReleaseAsset -Release $release -Token $AuthToken -RepoSlug $RepoSlug -AssetPath $deployStable -AssetName 'linknest-deploy.zip'
if ($updateSrc) {
    $release = Invoke-GitHubApi -Method GET -Url "$api/releases/$($release.id)" -Token $AuthToken
    Send-ReleaseAsset -Release $release -Token $AuthToken -RepoSlug $RepoSlug -AssetPath $updateSrc -AssetName $updateName
}

Write-Host ""
Write-Host "  OK  $($release.html_url)" -ForegroundColor Green
Write-Host "  Docs: docs\WINDOWS_BOOTSTRAP_BUNDLES.md"
Write-Output $release.html_url
