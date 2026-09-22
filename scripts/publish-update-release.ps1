#Requires -Version 5.1
<#
.SYNOPSIS
    Build a LinkNest update package and publish a GitHub Release.

.DESCRIPTION
    Packages linknest-update-vX.Y.Z.zip, creates tag vX.Y.Z, and publishes a
    GitHub Release. Release notes are auto-built from git commits since the
    previous tag (Features / Fixes / Other) unless -Notes or -NotesFile is set.

    Uses GitHub CLI when available; otherwise REST API + PAT
    (-Token / $env:GITHUB_TOKEN / $env:GH_TOKEN).

.PARAMETER Version
    Semver without leading v (e.g. 2.2.0). Default: package.json version.
.PARAMETER Notes
    Full release notes markdown (overrides auto-generated notes).
.PARAMETER NotesFile
    Path to a markdown file used as release notes (overrides auto-generated).
.PARAMETER SkipBuild
    Pass -SkipBuild to the packager.
.PARAMETER SkipPackage
    Do not run packager; require existing linknest-update-vX.Y.Z.zip.
.PARAMETER UpdateNotesOnly
    Only update the GitHub Release body (no package, no asset upload). Uses
    auto notes, -Notes, or -NotesFile.
.PARAMETER BasePath
    Vite base path for the package. Default: relative (portable).
    Use "relative" / "auto" / "./" so one ZIP works under /ArchLinks, /ERP3, /linknest, etc.
    Or pass an absolute folder like "/ArchLinks" for a single-instance bake.
.PARAMETER Draft
    Create the GitHub release as a draft.
.PARAMETER DryRun
    Print generated notes and package; do not tag or publish.
.PARAMETER Token
    GitHub PAT (repo scope).
.PARAMETER Repo
    owner/repo. Default: detected from git remote origin.
.PARAMETER MaxCommits
    Max commits to include in auto notes (default 80).

.EXAMPLE
    $env:GITHUB_TOKEN = 'ghp_...'
    .\scripts\publish-update-release.ps1 -Version 2.3.0

.EXAMPLE
    .\scripts\publish-update-release.ps1 -SkipPackage -Version 2.2.0 -UpdateNotesOnly
#>
param(
    [string]$Version = "",
    [string]$Notes = "",
    [string]$NotesFile = "",
    [switch]$SkipBuild,
    [switch]$SkipPackage,
    [switch]$UpdateNotesOnly,
    [string]$BasePath = "relative",
    [switch]$Draft,
    [switch]$DryRun,
    [string]$Token = "",
    [string]$Repo = "",
    [int]$MaxCommits = 80
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-GitHubTokenFromGitCredential {
    $prevPrompt = $env:GIT_TERMINAL_PROMPT
    $env:GIT_TERMINAL_PROMPT = "0"
    try {
        $spec = "protocol=https`nhost=github.com`n`n"
        $raw = $spec | git credential fill 2>$null
        if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($raw)) {
            return ""
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
    return ""
}

<#
.SYNOPSIS
    Run the GitHub CLI without letting its stderr abort this script.

.DESCRIPTION
    gh writes diagnostics (for example "no oauth token found for github.com" when
    it is installed but not logged in) to stderr. With $ErrorActionPreference =
    "Stop" that raises a NativeCommandError and kills the publish run before the
    REST fallback can happen. This helper keeps stderr out of the error stream,
    returns the merged output, and surfaces gh's exit code instead.
#>
function Invoke-GhCommand {
    param([string[]]$Arguments)

    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $merged = & gh @Arguments 2>&1 | ForEach-Object {
            if ($_ -is [System.Management.Automation.ErrorRecord]) { $_.ToString() } else { $_ }
        }
        $exit = $LASTEXITCODE
        return [pscustomobject]@{
            Output   = (($merged | Out-String).Trim())
            ExitCode = $exit
        }
    } finally {
        $ErrorActionPreference = $previousPreference
    }
}

function Get-GitHubToken {
    param([string]$Explicit)
    if (-not [string]::IsNullOrWhiteSpace($Explicit)) { return $Explicit.Trim() }
    if (-not [string]::IsNullOrWhiteSpace($env:GITHUB_TOKEN)) { return $env:GITHUB_TOKEN.Trim() }
    if (-not [string]::IsNullOrWhiteSpace($env:GH_TOKEN)) { return $env:GH_TOKEN.Trim() }
    $gh = Get-Command gh -ErrorAction SilentlyContinue
    if ($gh) {
        $ghToken = Invoke-GhCommand @("auth", "token")
        if ($ghToken.ExitCode -eq 0 -and -not [string]::IsNullOrWhiteSpace($ghToken.Output)) {
            return ([string]$ghToken.Output).Trim()
        }
    }
    $fromGit = Get-GitHubTokenFromGitCredential
    if (-not [string]::IsNullOrWhiteSpace($fromGit)) {
        return $fromGit
    }
    return ""
}

function Get-GitHubRepoSlug {
    param([string]$Explicit)
    if (-not [string]::IsNullOrWhiteSpace($Explicit)) {
        return $Explicit.Trim()
    }
    $url = (git remote get-url origin 2>$null)
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($url)) {
        throw "Cannot detect repo. Pass -Repo owner/name"
    }
    if ($url -match 'github\.com[:/]([^/]+)/([^/\s]+?)(?:\.git)?$') {
        return "$($Matches[1])/$($Matches[2] -replace '\.git$','')"
    }
    throw "origin remote is not a GitHub URL. Pass -Repo owner/name"
}

function Get-PreviousReleaseTag {
    param([string]$CurrentTag)
    $tags = @(git tag --list "v*" --sort=-v:refname 2>$null)
    if ($LASTEXITCODE -ne 0 -or $tags.Count -eq 0) {
        return $null
    }
    foreach ($t in $tags) {
        $name = [string]$t
        if ($name -ne $CurrentTag) {
            return $name
        }
    }
    return $null
}

function New-ReleaseNotesFromGit {
    param(
        [string]$Tag,
        [string]$Version,
        [string]$AssetName,
        [int]$MaxCommits = 80
    )

    $prev = Get-PreviousReleaseTag -CurrentTag $Tag
    $range = if ($prev) { "$prev..HEAD" } else { "" }
    # First release / no prior tag: keep notes shorter
    $limit = if ($prev) { $MaxCommits } else { [Math]::Min(15, $MaxCommits) }

    $logArgs = @("log", "--no-merges", "--pretty=format:%s|||%h", "-n", "$limit")
    if ($range -ne "") { $logArgs += $range }

    $raw = & git @logArgs 2>$null
    $lines = @()
    if ($raw) {
        if ($raw -is [string]) { $lines = @($raw) }
        else { $lines = @($raw) }
    }

    $features = New-Object System.Collections.Generic.List[string]
    $fixes = New-Object System.Collections.Generic.List[string]
    $chores = New-Object System.Collections.Generic.List[string]
    $other = New-Object System.Collections.Generic.List[string]

    foreach ($line in $lines) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        $parts = $line -split '\|\|\|', 2
        $subject = $parts[0].Trim()
        $hash = if ($parts.Count -gt 1) { $parts[1].Trim() } else { "" }
        if ($subject -eq "") { continue }

        # Strip conventional commit type prefixes for cleaner bullets
        $clean = $subject -replace '^(feat|fix|docs|chore|refactor|perf|test|style|build|ci)(\([^)]+\))?\s*:\s*', ''
        $bullet = if ($hash) { "- $clean ($hash)" } else { "- $clean" }

        if ($subject -match '^(feat)(\(|:|$)') {
            $features.Add($bullet)
        } elseif ($subject -match '^(fix)(\(|:|$)' -or $subject -match '(?i)\bfix(es|ed)?\b') {
            $fixes.Add($bullet)
        } elseif ($subject -match '^(chore|docs|ci|build|test|style)(\(|:|$)') {
            $chores.Add($bullet)
        } else {
            $other.Add($bullet)
        }
    }

    $sb = New-Object System.Text.StringBuilder
    [void]$sb.AppendLine("## LinkNest $Tag")
    [void]$sb.AppendLine("")
    if ($prev) {
        [void]$sb.AppendLine("Changes since **$prev**.")
    } else {
        [void]$sb.AppendLine("Initial tagged release notes from recent commits.")
    }
    [void]$sb.AppendLine("")

    if ($features.Count -gt 0) {
        [void]$sb.AppendLine("### Features")
        [void]$sb.AppendLine("")
        foreach ($b in $features) { [void]$sb.AppendLine($b) }
        [void]$sb.AppendLine("")
    }
    if ($fixes.Count -gt 0) {
        [void]$sb.AppendLine("### Fixes")
        [void]$sb.AppendLine("")
        foreach ($b in $fixes) { [void]$sb.AppendLine($b) }
        [void]$sb.AppendLine("")
    }
    if ($other.Count -gt 0) {
        [void]$sb.AppendLine("### Improvements")
        [void]$sb.AppendLine("")
        foreach ($b in $other) { [void]$sb.AppendLine($b) }
        [void]$sb.AppendLine("")
    }
    if ($chores.Count -gt 0) {
        [void]$sb.AppendLine("### Chores / Docs")
        [void]$sb.AppendLine("")
        foreach ($b in $chores) { [void]$sb.AppendLine($b) }
        [void]$sb.AppendLine("")
    }

    if (($features.Count + $fixes.Count + $other.Count + $chores.Count) -eq 0) {
        [void]$sb.AppendLine("### Notes")
        [void]$sb.AppendLine("")
        [void]$sb.AppendLine("- Maintenance / packaging update")
        [void]$sb.AppendLine("")
    }

    [void]$sb.AppendLine("### Install")
    [void]$sb.AppendLine("")
    [void]$sb.AppendLine("- **In-app (XAMPP):** Admin -> App Updates (or nav bell) -> Update now")
    [void]$sb.AppendLine("- **Git mode:** checks out ``$Tag`` and rebuilds the frontend")
    [void]$sb.AppendLine("- **ZIP mode:** downloads ``$AssetName`` and extracts while preserving ``data/`` and ``uploads/``")
    [void]$sb.AppendLine("")
    [void]$sb.AppendLine("See ``docs/APP_UPDATES.md`` for details.")

    return $sb.ToString().TrimEnd() + "`n"
}

function Resolve-ReleaseNotes {
    param(
        [string]$Notes,
        [string]$NotesFile,
        [string]$Tag,
        [string]$Version,
        [string]$AssetName,
        [int]$MaxCommits
    )
    if (-not [string]::IsNullOrWhiteSpace($NotesFile)) {
        if (-not (Test-Path $NotesFile)) {
            throw "NotesFile not found: $NotesFile"
        }
        return (Get-Content $NotesFile -Raw)
    }
    if (-not [string]::IsNullOrWhiteSpace($Notes)) {
        return $Notes
    }
    return New-ReleaseNotesFromGit -Tag $Tag -Version $Version -AssetName $AssetName -MaxCommits $MaxCommits
}

function Invoke-GitHubApi {
    param(
        [string]$Method,
        [string]$Url,
        [string]$Token,
        [object]$Body = $null,
        [string]$ContentType = "application/json",
        [string]$InFile = "",
        [switch]$RawResponse
    )
    $headers = @{
        "Authorization"        = "Bearer $Token"
        "Accept"               = "application/vnd.github+json"
        "User-Agent"           = "LinkNest-Publish-Update"
        "X-GitHub-Api-Version" = "2022-11-28"
    }

    $params = @{
        Method      = $Method
        Uri         = $Url
        Headers     = $headers
        ErrorAction = "Stop"
    }
    if ($InFile -ne "") {
        $params.InFile = $InFile
        $params.ContentType = $ContentType
    } elseif ($null -ne $Body) {
        $params.Body = ($Body | ConvertTo-Json -Depth 6 -Compress)
        $params.ContentType = "application/json"
    }

    try {
        if ($RawResponse) {
            return Invoke-WebRequest @params
        }
        return Invoke-RestMethod @params
    } catch {
        $detail = $_.Exception.Message
        throw "GitHub API $Method $Url failed: $detail"
    }
}

function Get-ReleaseByTag {
    param([string]$RepoSlug, [string]$TagName, [string]$Token)
    try {
        return Invoke-GitHubApi -Method GET -Url "https://api.github.com/repos/$RepoSlug/releases/tags/$TagName" -Token $Token
    } catch {
        return $null
    }
}

function Update-ReleaseNotesViaApi {
    param(
        [string]$RepoSlug,
        [string]$TagName,
        [string]$Title,
        [string]$BodyText,
        [string]$Token,
        [bool]$IsDraft
    )
    $api = "https://api.github.com/repos/$RepoSlug"
    $release = Get-ReleaseByTag -RepoSlug $RepoSlug -TagName $TagName -Token $Token
    if (-not $release) {
        throw "Release $TagName does not exist yet. Publish once without -UpdateNotesOnly first."
    }
    Write-Host "  Updating release notes for $TagName (id=$($release.id))..." -ForegroundColor Cyan
    $updated = Invoke-GitHubApi -Method PATCH -Url "$api/releases/$($release.id)" -Token $Token -Body @{
        name  = $Title
        body  = $BodyText
        draft = [bool]$IsDraft
    }
    Write-Host "  Notes updated: $($updated.html_url)" -ForegroundColor Green
}

function Publish-ReleaseViaApi {
    param(
        [string]$RepoSlug,
        [string]$TagName,
        [string]$Title,
        [string]$BodyText,
        [string]$AssetPath,
        [string]$AssetName,
        [string]$Token,
        [bool]$IsDraft
    )

    $api = "https://api.github.com/repos/$RepoSlug"
    Write-Host "  Publishing via GitHub API ($RepoSlug)..." -ForegroundColor Cyan

    $release = Get-ReleaseByTag -RepoSlug $RepoSlug -TagName $TagName -Token $Token
    if ($release) {
        Write-Host "  Release $TagName already exists (id=$($release.id)) - refreshing notes" -ForegroundColor Gray
        $release = Invoke-GitHubApi -Method PATCH -Url "$api/releases/$($release.id)" -Token $Token -Body @{
            name  = $Title
            body  = $BodyText
            draft = [bool]$IsDraft
        }
    } else {
        Write-Host "  Creating release $TagName..." -ForegroundColor Cyan
        $release = Invoke-GitHubApi -Method POST -Url "$api/releases" -Token $Token -Body @{
            tag_name               = $TagName
            name                   = $Title
            body                   = $BodyText
            draft                  = [bool]$IsDraft
            generate_release_notes = $false
        }
    }

    if ($release.assets) {
        foreach ($asset in @($release.assets)) {
            if ($asset.name -eq $AssetName) {
                Write-Host "  Replacing existing asset $($asset.name)..." -ForegroundColor Yellow
                Invoke-GitHubApi -Method DELETE -Url "$api/releases/assets/$($asset.id)" -Token $Token | Out-Null
            }
        }
    }

    $uploadUrl = ($release.upload_url -replace '\{\?name,label\}$', '') + '?name=' + [uri]::EscapeDataString($AssetName)
    $sizeMb = [math]::Round((Get-Item -LiteralPath $AssetPath).Length / 1MB, 2)
    Write-Host "  Uploading $AssetName (${sizeMb} MB)..." -ForegroundColor Cyan

    $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
    if ($curl) {
        $curlArgs = @(
            "-sS", "-f", "-L",
            "-X", "POST",
            "-H", "Authorization: Bearer $Token",
            "-H", "Accept: application/vnd.github+json",
            "-H", "Content-Type: application/zip",
            "-H", "User-Agent: LinkNest-Publish-Update",
            "--data-binary", "@$AssetPath",
            $uploadUrl
        )
        & curl.exe @curlArgs | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Asset upload failed (curl exit $LASTEXITCODE)"
        }
    } else {
        Invoke-GitHubApi -Method POST -Url $uploadUrl -Token $Token -InFile $AssetPath -ContentType "application/zip" | Out-Null
    }

    Write-Host "  Upload complete: $($release.html_url)" -ForegroundColor Green
}

# ---------------------------------------------------------------------------
# Resolve project root
# ---------------------------------------------------------------------------
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
if (-not (Test-Path (Join-Path $ProjectRoot "package.json"))) {
    $ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
    if (-not (Test-Path (Join-Path $ProjectRoot "package.json"))) {
        throw "Cannot locate project root (package.json)"
    }
}

Set-Location $ProjectRoot

$pkgJson = Get-Content (Join-Path $ProjectRoot "package.json") -Raw | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace($Version)) {
    $Version = [string]$pkgJson.version
}
$Version = $Version.Trim().TrimStart('v', 'V')
if ($Version -notmatch '^\d+\.\d+\.\d+') {
    throw "Version must look like X.Y.Z (got: $Version)"
}

$Tag = "v$Version"
$AssetName = "linknest-update-v$Version.zip"
$AssetPath = Join-Path $ProjectRoot $AssetName
$RepoSlug = Get-GitHubRepoSlug -Explicit $Repo
$AuthToken = Get-GitHubToken -Explicit $Token

if ($UpdateNotesOnly) {
    $SkipPackage = $true
}

Write-Host ""
Write-Host "  LinkNest publish update release" -ForegroundColor Cyan
Write-Host "  Version : $Version" -ForegroundColor Gray
Write-Host "  Tag     : $Tag" -ForegroundColor Gray
Write-Host "  Repo    : $RepoSlug" -ForegroundColor Gray
Write-Host "  Asset   : $AssetName" -ForegroundColor Gray
Write-Host ""

$ReleaseNotes = Resolve-ReleaseNotes -Notes $Notes -NotesFile $NotesFile -Tag $Tag -Version $Version -AssetName $AssetName -MaxCommits $MaxCommits

Write-Host "  --- Release notes (preview) ---" -ForegroundColor DarkCyan
Write-Host $ReleaseNotes
Write-Host "  --- end preview ---" -ForegroundColor DarkCyan
Write-Host ""

if ($pkgJson.version -ne $Version -and -not $UpdateNotesOnly -and -not $DryRun) {
    Write-Host "  Updating package.json version -> $Version" -ForegroundColor Yellow
    $pkgJson.version = $Version
    $pkgJson | ConvertTo-Json -Depth 100 | Set-Content (Join-Path $ProjectRoot "package.json") -Encoding UTF8
}

if (-not $SkipPackage -and -not $UpdateNotesOnly) {
    $packager = Join-Path $ProjectRoot "package-for-deployment.ps1"
    if (-not (Test-Path $packager)) {
        throw "Missing package-for-deployment.ps1"
    }
    $packArgs = @{
        OutputDir = $ProjectRoot
        BasePath  = $BasePath
    }
    if ($SkipBuild) { $packArgs.SkipBuild = $true }
    Write-Host "  Running packager..." -ForegroundColor Cyan
    & $packager @packArgs
} elseif ($UpdateNotesOnly) {
    Write-Host "  Notes-only mode (no package / no asset upload)" -ForegroundColor Gray
} else {
    Write-Host "  Skipping packager (-SkipPackage)" -ForegroundColor Gray
}

if (-not $UpdateNotesOnly -and -not (Test-Path $AssetPath)) {
    throw "Expected updater asset not found: $AssetPath"
}

if ($DryRun) {
    Write-Host ""
    Write-Host "  Dry run - not tagging or publishing." -ForegroundColor Yellow
    if (Test-Path $AssetPath) {
        Write-Host "  Asset: $AssetPath" -ForegroundColor Green
    }
    exit 0
}

if (-not $UpdateNotesOnly) {
    git rev-parse --verify --quiet "refs/tags/$Tag" | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Creating git tag $Tag" -ForegroundColor Cyan
        git tag -a $Tag -m "LinkNest $Tag"
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to create git tag $Tag"
        }
    } else {
        Write-Host "  Tag $Tag already exists locally" -ForegroundColor Gray
    }
    Write-Host "  Pushing tag $Tag to origin..." -ForegroundColor Cyan
    git push origin $Tag
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Warning: git push tag failed (continue if tag exists on remote)" -ForegroundColor Yellow
    }
}

$gh = Get-Command gh -ErrorAction SilentlyContinue
$ghUsable = $false
if ($gh) {
    $ghAuth = Invoke-GhCommand @("auth", "status")
    $ghUsable = ($ghAuth.ExitCode -eq 0)
    if (-not $ghUsable) {
        Write-Host "  GitHub CLI (gh) found but not authenticated - using REST API" -ForegroundColor Yellow
    }
}
if ($ghUsable) {
    Write-Host "  Using GitHub CLI (gh)" -ForegroundColor Cyan
    if ($UpdateNotesOnly) {
        $tmpNotes = Join-Path $env:TEMP "linknest-release-notes-$Tag.md"
        Set-Content -Path $tmpNotes -Value $ReleaseNotes -Encoding UTF8
        $null = Invoke-GhCommand @("release", "edit", $Tag, "--repo", $RepoSlug, "--title", "LinkNest $Tag", "--notes-file", $tmpNotes)
        Remove-Item $tmpNotes -Force -ErrorAction SilentlyContinue
    } else {
        $existing = Invoke-GhCommand @("release", "view", $Tag, "--repo", $RepoSlug)
        $tmpNotes = Join-Path $env:TEMP "linknest-release-notes-$Tag.md"
        Set-Content -Path $tmpNotes -Value $ReleaseNotes -Encoding UTF8
        if ($existing.ExitCode -eq 0) {
            Write-Host "  Release $Tag exists - updating notes + asset" -ForegroundColor Cyan
            $null = Invoke-GhCommand @("release", "edit", $Tag, "--repo", $RepoSlug, "--title", "LinkNest $Tag", "--notes-file", $tmpNotes)
            $null = Invoke-GhCommand @("release", "upload", $Tag, $AssetPath, "--repo", $RepoSlug, "--clobber")
        } else {
            $releaseArgs = @(
                "release", "create", $Tag,
                $AssetPath,
                "--repo", $RepoSlug,
                "--title", "LinkNest $Tag",
                "--notes-file", $tmpNotes
            )
            if ($Draft) { $releaseArgs += "--draft" }
            Write-Host "  Creating GitHub Release $Tag" -ForegroundColor Cyan
            $null = Invoke-GhCommand $releaseArgs
        }
        Remove-Item $tmpNotes -Force -ErrorAction SilentlyContinue
    }
} else {
    Write-Host "  GitHub CLI (gh) unavailable - using REST API" -ForegroundColor Yellow
    if ([string]::IsNullOrWhiteSpace($AuthToken)) {
        Write-Host ""
        Write-Host "  No GITHUB_TOKEN / GH_TOKEN / -Token found." -ForegroundColor Yellow
        Write-Host "  Create a classic PAT with 'repo' scope:" -ForegroundColor Yellow
        Write-Host "  https://github.com/settings/tokens/new?scopes=repo&description=LinkNest%20Publish" -ForegroundColor Cyan
        Write-Host ""
        $secure = Read-Host "  Paste GitHub PAT (input hidden)" -AsSecureString
        $BSTR = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
        try {
            $AuthToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($BSTR)
        } finally {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR)
        }
        if ([string]::IsNullOrWhiteSpace($AuthToken)) {
            throw @"
No GitHub token provided.

Install GitHub CLI: https://cli.github.com/  then: gh auth login

Or set a PAT (repo scope) and re-run:
  `$env:GITHUB_TOKEN = 'ghp_...'
  .\scripts\publish-update-release.ps1 -SkipPackage -Version $Version
"@
        }
        Write-Host "  Token received - publishing via API..." -ForegroundColor Green
    }
    if ($UpdateNotesOnly) {
        Update-ReleaseNotesViaApi -RepoSlug $RepoSlug -TagName $Tag -Title "LinkNest $Tag" `
            -BodyText $ReleaseNotes -Token $AuthToken -IsDraft:([bool]$Draft)
    } else {
        Publish-ReleaseViaApi -RepoSlug $RepoSlug -TagName $Tag -Title "LinkNest $Tag" `
            -BodyText $ReleaseNotes -AssetPath $AssetPath -AssetName $AssetName `
            -Token $AuthToken -IsDraft:([bool]$Draft)
    }
}

Write-Host ""
Write-Host "  Done: $Tag" -ForegroundColor Green
Write-Host "  Admins apply from App Updates (see docs/APP_UPDATES.md)." -ForegroundColor Green
Write-Host ""
