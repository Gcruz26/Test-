param(
  [switch]$Build
)

$composeArgs = if ($Build) { "up --build" } else { "up" }

Write-Host "Starting Alfa Processing Platform with Docker..."
docker compose $composeArgs
