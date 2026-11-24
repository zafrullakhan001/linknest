# Install websockify into bin/python-packages for the LinkNest VNC Easy gateway.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $root 'bin'))) {
  $root = $PSScriptRoot
  if (-not (Test-Path (Join-Path $root 'bin'))) {
    $root = Get-Location
  }
}
$target = Join-Path $root 'bin\python-packages'
New-Item -ItemType Directory -Force -Path $target | Out-Null
Write-Host "Installing websockify into $target ..."
python -m pip install --upgrade --target=$target websockify
Write-Host "Done. VNC Easy mode can use: python -m websockify (PYTHONPATH=$target)"
