Add inside `model User`:

```prisma
realtimeConnections RealtimeConnection[]
presenceSessions    PresenceSession[]
```

Add inside `model Project`:

```prisma
realtimeEvents   RealtimeEvent[]
presenceSessions PresenceSession[]
```

Add these enums and models at the end of `prisma/schema.prisma`:

```prisma
enum RealtimeEventStatus {
  PENDING
  PUBLISHED
  FAILED
}

enum PresenceStatus {
  ONLINE
  AWAY
  OFFLINE
}

model RealtimeEvent {
  id             String              @id @default(cuid())
  organizationId String
  projectId      String?
  topic          String
  eventType      String
  aggregateType  String?
  aggregateId    String?
  actorUserId    String?
  payload        Json
  status         RealtimeEventStatus @default(PENDING)
  attempts       Int                 @default(0)
  availableAt    DateTime            @default(now())
  publishedAt    DateTime?
  lastError      String?
  project        Project?            @relation(fields: [projectId], references: [id], onDelete: Cascade)
  createdAt      DateTime            @default(now())
  updatedAt      DateTime            @updatedAt

  @@index([status, availableAt])
  @@index([organizationId, createdAt])
  @@index([projectId, createdAt])
  @@index([topic, createdAt])
  @@index([aggregateType, aggregateId])
}

model RealtimeConnection {
  id             String   @id @default(cuid())
  userId         String
  organizationId String
  connectionId   String   @unique
  transport      String
  userAgent      String?
  ipAddress      String?
  connectedAt    DateTime @default(now())
  lastSeenAt     DateTime @default(now())
  disconnectedAt DateTime?
  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, disconnectedAt])
  @@index([organizationId, disconnectedAt])
}

model PresenceSession {
  id             String         @id @default(cuid())
  userId         String
  organizationId String
  projectId      String?
  connectionId   String
  status         PresenceStatus @default(ONLINE)
  resourceType   String?
  resourceId     String?
  metadata       Json?
  expiresAt      DateTime
  user           User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  project        Project?       @relation(fields: [projectId], references: [id], onDelete: Cascade)
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt

  @@unique([userId, connectionId])
  @@index([organizationId, status, expiresAt])
  @@index([projectId, status, expiresAt])
  @@index([resourceType, resourceId, status])
}
```
