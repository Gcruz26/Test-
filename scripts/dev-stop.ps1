$ErrorActionPreference = "Stop"

$ports = @(3000, 8000)

foreach ($port in $ports) {
  $lines = netstat -ano | Select-String ":$port"
  if (-not $lines) {
    continue
  }

  foreach ($line in $lines) {
    $parts = ($line.ToString() -split "\s+") | Where-Object { $_ }
    if ($parts.Length -lt 5) {
      continue
    }

    $localAddress = $parts[1]
    $state = $parts[3]
    $processId = $parts[4]

    if ($localAddress -notmatch ":$port$" -or $state -ne "LISTENING") {
      continue
    }

    try {
      Stop-Process -Id $processId -Force -ErrorAction Stop
      Write-Host "Stopped process $processId on port $port"
    } catch {
      Write-Warning "Failed to stop process $processId on port ${port}: $($_.Exception.Message)"
    }
  }
}
