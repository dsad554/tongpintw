$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$port = 51283
$url = "http://127.0.0.1:$port/"
$apiUrl = $url + 'api/state'
function Test-Preview {
  try {
    $response = Invoke-WebRequest -Uri $apiUrl -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -eq 200 -and $response.Content.TrimStart().StartsWith('{')
  } catch { return $false }
}
if (-not (Test-Preview)) {
  $node = Join-Path ${env:ProgramFiles} 'nodejs\node.exe'
  if (-not (Test-Path -LiteralPath $node)) { $node = (Get-Command node -ErrorAction Stop).Source }
  $tool = Join-Path $root '工具\本地预览.mjs'
  $logDir = Join-Path $root 'memory'
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  $stdout = Join-Path $logDir '本地预览-服务.log'
  $stderr = Join-Path $logDir '本地预览-服务.error.log'
  Start-Process -FilePath $node -ArgumentList @($tool) -WorkingDirectory $root -WindowStyle Minimized -RedirectStandardOutput $stdout -RedirectStandardError $stderr | Out-Null
  $ready = $false
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 250
    if (Test-Preview) { $ready = $true; break }
  }
  if (-not $ready) {
    Write-Host "本地服务启动失败。请查看 $stderr" -ForegroundColor Red
    exit 1
  }
}
Start-Process $url
Write-Host "同频提问局已打开：$url"

