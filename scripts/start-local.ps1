param(
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$dataDirectory = Join-Path $workspace 'data'
$pidFile = Join-Path $dataDirectory 'local-processes.json'
$appUrl = 'http://127.0.0.1:5173/#dashboard'
$apiUrl = 'http://127.0.0.1:5174/api/dashboard'
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$node = $nodeCommand.Source

if (-not $node) {
  $commonNodePaths = @(
    'C:\Program Files\nodejs\node.exe',
    (Join-Path $env:LOCALAPPDATA 'Programs\node\node.exe'),
    (Join-Path $workspace '.tools\node.exe')
  )
  $node = $commonNodePaths | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $node) {
  $reposDirectory = Split-Path -Parent $workspace
  $sharedNodePattern = Join-Path $reposDirectory '*\.tools\node-*-win-x64\node.exe'
  $node = Resolve-Path $sharedNodePattern -ErrorAction SilentlyContinue |
    Select-Object -First 1 -ExpandProperty Path
}

if (-not $node) {
  throw 'No se encuentra Node.js. Instala Node.js y vuelve a intentarlo.'
}
if (-not (Test-Path (Join-Path $workspace 'node_modules\vite\bin\vite.js'))) {
  throw 'Faltan las dependencias. Ejecuta npm install en la carpeta del proyecto.'
}

New-Item -ItemType Directory -Force -Path $dataDirectory | Out-Null

function Test-Url([string]$Url) {
  try {
    Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2 | Out-Null
    return $true
  } catch {
    return $false
  }
}

function Get-PortOwner([int]$Port) {
  return Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1 -ExpandProperty OwningProcess
}

function Wait-ForUrl([string]$Url, [string]$Name) {
  foreach ($attempt in 1..30) {
    if (Test-Url $Url) { return }
    Start-Sleep -Milliseconds 350
  }
  throw "$Name no ha respondido a tiempo. Revisa los logs en data."
}

$apiPid = Get-PortOwner 5174
if ($apiPid -and -not (Test-Url $apiUrl)) {
  throw 'El puerto 5174 está ocupado por otro proceso.'
}
if (-not $apiPid) {
  $apiProcess = Start-Process -FilePath $node `
    -ArgumentList 'server/index.js' `
    -WorkingDirectory $workspace `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $dataDirectory 'api.log') `
    -RedirectStandardError (Join-Path $dataDirectory 'api-error.log') `
    -PassThru
  $apiPid = $apiProcess.Id
  Wait-ForUrl $apiUrl 'La API'
}

$webPid = Get-PortOwner 5173
if ($webPid -and -not (Test-Url $appUrl)) {
  throw 'El puerto 5173 está ocupado por otro proceso.'
}
if (-not $webPid) {
  $webProcess = Start-Process -FilePath $node `
    -ArgumentList 'node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5173', '--strictPort' `
    -WorkingDirectory $workspace `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $dataDirectory 'web.log') `
    -RedirectStandardError (Join-Path $dataDirectory 'web-error.log') `
    -PassThru
  $webPid = $webProcess.Id
  Wait-ForUrl $appUrl 'La web'
}

$apiStartedAt = (Get-Process -Id $apiPid).StartTime.ToString('o')
$webStartedAt = (Get-Process -Id $webPid).StartTime.ToString('o')

@{
  apiPid = $apiPid
  apiStartedAt = $apiStartedAt
  webPid = $webPid
  webStartedAt = $webStartedAt
  startedAt = (Get-Date).ToString('o')
} | ConvertTo-Json | Set-Content -Encoding UTF8 $pidFile

if (-not $NoBrowser) {
  Start-Process $appUrl
}

Write-Host ''
Write-Host 'Renta esta disponible en:' -ForegroundColor Green
Write-Host $appUrl
Write-Host ''
Write-Host 'Puedes cerrar esta ventana. Para apagar la app usa "Cerrar Renta.bat".'
