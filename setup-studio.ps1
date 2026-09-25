# Windows uses the same locked Linux preparation environment through WSL2.
$ErrorActionPreference = 'Stop'
if (-not (Get-Command wsl -ErrorAction SilentlyContinue)) {
  Write-Host 'Install WSL2 Ubuntu first: wsl --install -d Ubuntu'; exit 1
}
Write-Host 'Inside Ubuntu, install Python 3.12, python3.12-venv, git and build-essential.'
Write-Host 'Keep the checkout in the Linux home directory for generation performance.'
Write-Host 'Then run: python3.12 scripts/setup_studio.py'
Write-Host 'Start: .studio/env/bin/python scripts/services.py'
Write-Host 'Open http://localhost:8090/locations.html in your Windows browser.'
wsl --status
