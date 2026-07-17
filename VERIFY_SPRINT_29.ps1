param(
  [switch]$ApplyMigration,
  [switch]$SkipInstall,
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Push-Location $PSScriptRoot
try {
  if (-not $SkipInstall) {
    npm.cmd ci
  }

  npx.cmd prisma validate
  npx.cmd prisma generate

  if ($ApplyMigration) {
    npx.cmd prisma migrate deploy
  }

  npm.cmd run typecheck
  npm.cmd run lint

  if (-not $SkipBuild) {
    npm.cmd run build
  }

  Write-Host "Sprint 29 verification completed successfully." -ForegroundColor Green
}
finally {
  Pop-Location
}
