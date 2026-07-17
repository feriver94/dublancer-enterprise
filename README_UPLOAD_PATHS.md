# Sprint 28 v2 – Enterprise Realtime Notifications

This package fixes the previous import/export mismatch.

## Recommended installation

Extract this ZIP into a temporary folder.

Open PowerShell in the Dublancer project root:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
& "C:\PATH\TO\EXTRACTED\INSTALL_SPRINT_28_V2.ps1"
```

The installer force-replaces every Sprint 28 file using its exact path.

## Then run

```powershell
npx.cmd prisma format
npx.cmd prisma generate
npx.cmd prisma migrate dev --name enterprise_realtime_notifications_v2
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npm.cmd run dev
```

If Prisma reports that no schema changes exist, that is expected because
the previous Sprint 28 database migration was already applied.

## Verify the critical export

```powershell
Select-String `
  -Path ".\src\lib\notifications\notification.service.ts" `
  -Pattern "export class NotificationService"
```

It must return a matching line.

## Create notification

```powershell
Invoke-RestMethod `
  -Uri http://localhost:3000/api/internal/notifications/create `
  -Method POST `
  -ContentType "application/json" `
  -Headers @{
    "x-internal-notification-secret" = $env:INTERNAL_NOTIFICATION_SECRET
  } `
  -Body '{
    "userId":"user_admin_001",
    "organizationId":"org_dublancer_001",
    "projectId":"project_dublancer_001",
    "type":"PROJECT_TASK_ASSIGNED",
    "category":"PROJECTS",
    "priority":"HIGH",
    "title":"Sprint 28 v2 Test Notification",
    "body":"Enterprise notification pipeline operational.",
    "actionUrl":"/projects/project_dublancer_001",
    "dedupeKey":"sprint28-v2-test-001",
    "channels":["IN_APP"]
  }' |
ConvertTo-Json -Depth 20
```

Use the actual secret value if it is not loaded into the PowerShell
environment.
