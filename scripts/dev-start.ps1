$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$frontendDir = Join-Path $root "frontend"
$backendDir = Join-Path $root "backend"
$frontendOutLog = Join-Path $frontendDir "frontend-start.out.log"
$frontendErrLog = Join-Path $frontendDir "frontend-start.err.log"
$backendOutLog = Join-Path $backendDir "uvicorn.out.log"
$backendErrLog = Join-Path $backendDir "uvicorn.err.log"

& (Join-Path $PSScriptRoot "dev-stop.ps1")

foreach ($log in @($frontendOutLog, $frontendErrLog, $backendOutLog, $backendErrLog)) {
  Set-Content -Path $log -Value ""
}

Start-Process -FilePath "cmd.exe" `
  -ArgumentList "/c", "npm run dev -- --webpack --hostname 127.0.0.1 --port 3000 1>> frontend-start.out.log 2>> frontend-start.err.log" `
  -WorkingDirectory $frontendDir `
  -WindowStyle Hidden

Start-Process -FilePath "cmd.exe" `
  -ArgumentList "/c", "backend\run_backend.bat 1>> backend\uvicorn.out.log 2>> backend\uvicorn.err.log" `
  -WorkingDirectory $root `
  -WindowStyle Hidden

Write-Host "Frontend starting on http://127.0.0.1:3000"
Write-Host "Backend starting on http://127.0.0.1:8000"
