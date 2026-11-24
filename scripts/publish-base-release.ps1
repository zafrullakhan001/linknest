#Requires -Version 5.1
<#
.SYNOPSIS
    One-shot portable ("base") App Updates release from the current git branch.

.DESCRIPTION
    Bumps the patch version (or uses -Version), commits package.json if needed,
    pushes the current branch, then publishes a GitHub Release with a portable
    Vite base (./) so the same ZIP works under /ArchLinks, /ERP3, /linknest, etc.

    Double-click publish-base-release.bat in the repo root, or:

        .\scripts\publish-base-release.ps1
        .\scripts\publish-base-release.ps1 -Yes
        .\scripts\publish-base-release.ps1 -Bump minor
        .\scripts\publish-base-release.ps1 -Version 2.4.0

    Auth: GITHUB_TOKEN / GH_TOKEN, `gh auth login`, or Git Credential Manager
    (same login you already use for git push). Needs repo scope to create Releases.

.PARAMETER Version
    Semver without leading v. Default: next patch after the higher of package.json
    and the latest v* git tag.
.PARAMETER Bump
    Which part to increment when -Version is omitted: patch (default), minor, major.
.PARAMETER Yes
    Skip the "Continue?" confirmation (for automation).
.PARAMETER AllowDirty
    Continue even if the working tree has unrelated uncommitted changes.
.PARAMETER SkipBuild
    Reuse existing dist/ (not recommended).
.PARAMETER DryRun
    Show version/notes and package, but do not commit, tag, or publish.
.PARAMETER Notes
    Full release notes markdown (overrides auto-generated notes).
.PARAMETER NotesFile
    Path to a markdown file used as release notes.
.PARAMETER Token
    GitHub PAT (repo scope). Optional if git credentials or gh are already set up.
.PARAMETER Repo
    owner/repo. Default: detected from git remote origin.
#>
param(
    [string]$Version = "",
    [ValidateSet("patch", "minor", "major")]
    [string]$Bump = "patch",
    [Alias("y")]
    [switch]$Yes,
    [switch]$AllowDirty,
    [switch]$SkipBuild,
    [switch]$DryRun,
    [string]$Notes = "",
    [string]$NotesFile = "",
    [string]$Token = "",
    [string]$Repo = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
if (-not (Test-Path (Join-Path $ProjectRoot "package.json"))) {
    throw "Cannot locate project root (package.json)"
}
Set-Location $ProjectRoot

function Get-SemverParts {
    param([string]$Value)
    $clean = $Value.Trim().TrimStart("v", "V")
    if ($clean -notmatch '^(\d+)\.(\d+)\.(\d+)') {
        throw "Version must look like X.Y.Z (got: $Value)"
    }
    return [pscustomobject]@{
        Major = [int]$Matches[1]
        Minor = [int]$Matches[2]
        Patch = [int]$Matches[3]
        Text  = "$([int]$Matches[1]).$([int]$Matches[2]).$([int]$Matches[3])"
    }
}

function Compare-SemverText {
    param([string]$Left, [string]$Right)
    $a = Get-SemverParts $Left
    $b = Get-SemverParts $Right
    if ($a.Major -ne $b.Major) { return $a.Major - $b.Major }
    if ($a.Minor -ne $b.Minor) { return $a.Minor - $b.Minor }
    return $a.Patch - $b.Patch
}

function Step-Semver {
    param($Parts, [string]$Kind)
    switch ($Kind) {
        "major" { $Parts.Major++; $Parts.Minor = 0; $Parts.Patch = 0 }
        "minor" { $Parts.Minor++; $Parts.Patch = 0 }
        "patch" { $Parts.Patch++ }
    }
    $Parts.Text = "$($Parts.Major).$($Parts.Minor).$($Parts.Patch)"
    return $Parts
}

function Get-LatestReleaseTagVersion {
    $tags = @(git tag --list "v*" --sort=-v:refname 2>$null)
    if ($LASTEXITCODE -ne 0 -or $tags.Count -eq 0) {
        return $null
    }
    foreach ($t in $tags) {
        $name = ([string]$t).Trim()
        if ($name -match '^v\d+\.\d+\.\d+') {
            return (Get-SemverParts $name).Text
        }
    }
    return $null
}

function Set-JsonPackageVersion {
    param([string]$Path, [string]$NewVersion, [int]$MaxReplacements = 1)
    if (-not (Test-Path $Path)) {
        return
    }
    $raw = [System.IO.File]::ReadAllText($Path)
    $pattern = '"version"\s*:\s*"[^"]+"'
    $replacement = '"version": "' + $NewVersion + '"'
    $rx = [regex]$pattern
    $updated = $rx.Replace($raw, $replacement, $MaxReplacements)
    if ($updated -eq $raw) {
        throw "Could not update version in $Path"
    }
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($Path, $updated, $utf8NoBom)
}

git rev-parse --is-inside-work-tree 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Not a git repository."
}

$branch = ([string](git branch --show-current 2>$null)).Trim()
if ([string]::IsNullOrWhiteSpace($branch)) {
    throw "Detached HEAD. Check out a branch before publishing."
}

$pkgJsonPath = Join-Path $ProjectRoot "package.json"
$lockJsonPath = Join-Path $ProjectRoot "package-lock.json"
$pkgJson = Get-Content $pkgJsonPath -Raw | ConvertFrom-Json
$pkgVersion = Get-SemverParts ([string]$pkgJson.version)
$tagVersion = Get-LatestReleaseTagVersion

if ([string]::IsNullOrWhiteSpace($Version)) {
    $baseText = $pkgVersion.Text
    if ($tagVersion -and (Compare-SemverText $tagVersion $baseText) -gt 0) {
        $baseText = $tagVersion
    }
    if ($tagVersion -and (Compare-SemverText $pkgVersion.Text $tagVersion) -gt 0) {
        $Version = $pkgVersion.Text
    } else {
        $Version = (Step-Semver (Get-SemverParts $baseText) $Bump).Text
    }
}
$Version = (Get-SemverParts $Version).Text
$Tag = "v$Version"

$dirty = @(git status --porcelain)
$unrelatedDirty = @()
foreach ($line in $dirty) {
    $path = ($line.Substring(3).Trim() -replace '^"|"$', '')
    if ($path -ne "package.json" -and $path -ne "package-lock.json") {
        $unrelatedDirty += $line
    }
}
if ($unrelatedDirty.Count -gt 0 -and -not $AllowDirty) {
    Write-Host ""
    Write-Host "  Uncommitted changes would be left out of this release:" -ForegroundColor Yellow
    $unrelatedDirty | ForEach-Object { Write-Host "    $_" }
    throw "Commit or stash those files, or re-run with -AllowDirty."
}

Write-Host ""
Write-Host "  LinkNest portable (base) release" -ForegroundColor Cyan
Write-Host "  Branch  : $branch" -ForegroundColor Gray
Write-Host "  Version : $Version  ($Tag)" -ForegroundColor Gray
Write-Host "  Base    : ./  (portable - ArchLinks / ERP3 / any folder)" -ForegroundColor Gray
if ($tagVersion) {
    Write-Host "  Previous: v$tagVersion" -ForegroundColor Gray
}
Write-Host ""

if (-not $Yes -and -not $DryRun) {
    $answer = Read-Host "  Publish $Tag from $branch now? [Y/n]"
    if ($answer -and $answer -notmatch '^(y|yes)$') {
        Write-Host "  Cancelled." -ForegroundColor Yellow
        exit 1
    }
}

if ($pkgVersion.Text -ne $Version -and -not $DryRun) {
    Write-Host "  Bumping package.json / package-lock.json -> $Version" -ForegroundColor Cyan
    Set-JsonPackageVersion -Path $pkgJsonPath -NewVersion $Version -MaxReplacements 1
    if (Test-Path $lockJsonPath) {
        Set-JsonPackageVersion -Path $lockJsonPath -NewVersion $Version -MaxReplacements 2
    }
    git add -- package.json package-lock.json
    $staged = @(git diff --cached --name-only)
    if ($staged.Count -gt 0) {
        git commit -m "chore: Release $Tag for in-app App Updates."
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to commit version bump."
        }
    }
}

if (-not $DryRun) {
    Write-Host "  Pushing branch $branch..." -ForegroundColor Cyan
    git push -u origin HEAD
    if ($LASTEXITCODE -ne 0) {
        throw "git push failed. Fix remote access, then re-run."
    }
}

$publisher = Join-Path $ProjectRoot "scripts\publish-update-release.ps1"
if (-not (Test-Path $publisher)) {
    throw "Missing $publisher"
}

$publishArgs = @{
    Version  = $Version
    BasePath = "relative"
}
if ($SkipBuild) { $publishArgs.SkipBuild = $true }
if ($DryRun) { $publishArgs.DryRun = $true }
if ($Notes) { $publishArgs.Notes = $Notes }
if ($NotesFile) { $publishArgs.NotesFile = $NotesFile }
if ($Token) { $publishArgs.Token = $Token }
if ($Repo) { $publishArgs.Repo = $Repo }

& $publisher @publishArgs
if ($LASTEXITCODE -ne 0) {
    throw "publish-update-release.ps1 failed with exit $LASTEXITCODE"
}

Write-Host ""
Write-Host "  Apply in-app: Admin -> App Updates -> Track branch = $branch -> Check for updates -> Release $Tag" -ForegroundColor Green
Write-Host ""
