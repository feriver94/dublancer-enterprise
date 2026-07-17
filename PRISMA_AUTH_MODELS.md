enum SessionStatus {
  ACTIVE
  REVOKED
  EXPIRED
}

model AuthSession {
  id                   String        @id @default(cuid())
  userId               String
  organizationId       String?
  status               SessionStatus @default(ACTIVE)
  refreshTokenHash     String        @unique
  userAgent            String?
  ipAddress            String?
  deviceLabel          String?
  expiresAt            DateTime
  lastSeenAt           DateTime      @default(now())
  revokedAt            DateTime?
  rotatedFromSessionId String?
  user                 User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt            DateTime      @default(now())
  updatedAt            DateTime      @updatedAt

  @@index([userId, status])
  @@index([organizationId, status])
  @@index([expiresAt])
}

model LoginEvent {
  id         String   @id @default(cuid())
  userId     String?
  email      String
  outcome    String
  reason     String?
  ipAddress  String?
  userAgent  String?
  occurredAt DateTime @default(now())
  user       User?    @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([email, occurredAt])
  @@index([userId, occurredAt])
  @@index([outcome, occurredAt])
}
