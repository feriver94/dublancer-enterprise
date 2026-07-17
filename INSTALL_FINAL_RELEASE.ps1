param([string]$Destination = "$PWD\DublancerFinal")
$ErrorActionPreference = "Stop"
$Archive = Join-Path $PSScriptRoot "Dublancer_Final_Enterprise_Release.zip"
if (-not (Test-Path $Archive)) { throw "Place this installer beside Dublancer_Final_Enterprise_Release.zip." }
Expand-Archive -Path $Archive -DestinationPath $Destination -Force
Set-Location (Join-Path $Destination "dublancer-enterprise")
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm.cmd ci
npx.cmd prisma validate
npx.cmd prisma generate
Write-Host "Source installed. Configure .env, run 'npx prisma migrate deploy', then 'npm run dev'." -ForegroundColor Green
