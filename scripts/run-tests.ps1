# Full system test runner (Windows / PowerShell).
#
#   pwsh scripts/run-tests.ps1            # unit + system
#   pwsh scripts/run-tests.ps1 -UnitOnly  # unit only (no stack needed)
#
# Brings up datastores, migrates, seeds pricing, starts the mock upstream +
# gateway (pointed at the mock) + control-plane, then runs the test suite.
param([switch]$UnitOnly)

$ErrorActionPreference = "Stop"
$env:Path = "$env:APPDATA\npm;$env:Path"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

# Load .env into the process environment.
if (Test-Path .env) {
  Get-Content .env | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]*)=(.*)$') { Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim() }
  }
}

if ($UnitOnly) {
  pnpm --filter "@finops/tests" test:unit
  exit $LASTEXITCODE
}

# Datastores + schema + pricing.
docker compose up -d | Out-Null
pnpm --filter "@finops/db" db:migrate | Out-Null
pnpm --filter "@finops/db" seed-pricing | Out-Null

function Listening($port) { [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) }

# Mock upstream.
if (-not (Listening 8787)) { Start-Process pnpm -ArgumentList "--filter","@finops/gateway","mock" -WindowStyle Hidden }

# Gateway (pointed at the mock).
$env:UPSTREAM_ANTHROPIC_URL = "http://127.0.0.1:8787"
$env:UPSTREAM_OPENAI_URL = "http://127.0.0.1:8787"
if (-not (Listening 4000)) { Start-Process pnpm -ArgumentList "--filter","@finops/gateway","start" -WindowStyle Hidden }

# Control plane.
if (-not (Listening 3000)) { Start-Process pnpm -ArgumentList "--filter","@finops/control-plane","dev" -WindowStyle Hidden }

# Wait for readiness.
foreach ($u in @("http://localhost:4000/health","http://localhost:3000/api/usage")) {
  $ok = $false
  for ($i = 0; $i -lt 40; $i++) { try { Invoke-WebRequest $u -UseBasicParsing -TimeoutSec 2 | Out-Null; $ok = $true; break } catch { Start-Sleep 1 } }
  if (-not $ok) { throw "service not ready: $u" }
}

pnpm --filter "@finops/tests" test
exit $LASTEXITCODE
