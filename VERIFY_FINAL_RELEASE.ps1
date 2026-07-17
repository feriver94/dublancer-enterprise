param(
  [switch]$ApplyMigration,
  [switch]$Seed,
  [switch]$SkipBuild
)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path Env:DATABASE_URL)) { throw "DATABASE_URL must be set." }
if (-not (Test-Path Env:REDIS_URL)) { Write-Warning "REDIS_URL is not set; realtime environment tests require Redis." }

npm.cmd ci
npx.cmd prisma validate
npx.cmd prisma generate
npm.cmd run verify:migrations
if ($ApplyMigration) { npx.cmd prisma migrate deploy }
if ($Seed) { npx.cmd prisma db seed }
npm.cmd run verify:locales
npm.cmd run verify:security
npm.cmd run verify:secrets
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd audit --audit-level=high
if (-not $SkipBuild) { npm.cmd run build }

Write-Host "Dublancer Final Enterprise Release verification completed." -ForegroundColor Green
