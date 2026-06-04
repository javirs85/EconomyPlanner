$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $workspace 'data\local-processes.json'

if (-not (Test-Path $pidFile)) {
  Write-Host 'No hay una instancia registrada de Renta.'
  exit 0
}

$processes = Get-Content -Raw $pidFile | ConvertFrom-Json
foreach ($registered in @(
  @{ id = $processes.apiPid; startedAt = $processes.apiStartedAt },
  @{ id = $processes.webPid; startedAt = $processes.webStartedAt }
)) {
  $process = Get-Process -Id $registered.id -ErrorAction SilentlyContinue
  if ($process -and $registered.startedAt -and $process.StartTime.ToString('o') -eq $registered.startedAt) {
    Stop-Process -Id $registered.id -Force
  }
}

Remove-Item -LiteralPath $pidFile
Write-Host 'Renta se ha cerrado correctamente.' -ForegroundColor Green
