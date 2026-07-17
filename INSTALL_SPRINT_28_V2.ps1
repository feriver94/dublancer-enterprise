$ErrorActionPreference = "Stop"

Write-Host "Installing Sprint 28 v2 files..." -ForegroundColor Cyan

$sourceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Get-Location

$paths = @(
  "prisma\schema.prisma",
  "src\lib\validation\notifications.ts",
  "src\lib\notifications\notification.service.ts",
  "src\lib\notifications\preferences.service.ts",
  "src\lib\notifications\delivery-worker.ts",
  "src\app\api\notifications\route.ts",
  "src\app\api\notifications\unread-count\route.ts",
  "src\app\api\notifications\read-all\route.ts",
  "src\app\api\notifications\[notificationId]\read\route.ts",
  "src\app\api\notifications\[notificationId]\archive\route.ts",
  "src\app\api\notification-preferences\route.ts",
  "src\app\api\internal\notifications\create\route.ts",
  "src\app\api\internal\notifications\process\route.ts",
  "src\components\notifications\notification-center.tsx"
)

foreach ($relativePath in $paths) {
  $source = Join-Path $sourceRoot $relativePath
  $destination = Join-Path $projectRoot $relativePath
  $destinationDirectory = Split-Path -Parent $destination

  New-Item -ItemType Directory `
    -Path $destinationDirectory `
    -Force | Out-Null

  Copy-Item `
    -LiteralPath $source `
    -Destination $destination `
    -Force
}

Write-Host "Files installed successfully." -ForegroundColor Green
Write-Host "Now run:" -ForegroundColor Yellow
Write-Host "npx.cmd prisma format"
Write-Host "npx.cmd prisma generate"
Write-Host "npx.cmd prisma migrate dev --name enterprise_realtime_notifications_v2"
