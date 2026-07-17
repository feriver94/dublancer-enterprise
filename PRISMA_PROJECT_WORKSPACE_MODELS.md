Add these relations inside `model User`:

```prisma
projectMemberships ProjectMembership[]
assignedTasks      ProjectTask[]       @relation("TaskAssignee")
createdTasks       ProjectTask[]       @relation("TaskCreator")
projectComments    ProjectComment[]
uploadedFiles      ProjectAttachment[]
notifications      UserNotification[]
```

Add these relations inside `model Project`:

```prisma
memberships ProjectMembership[]
milestones  ProjectMilestone[]
tasks       ProjectTask[]
comments    ProjectComment[]
attachments ProjectAttachment[]
activities  ProjectActivity[]
```

Add these enums and models at the end of `prisma/schema.prisma`:

```prisma
enum ProjectMemberRole {
  OWNER
  MANAGER
  CONTRIBUTOR
  VIEWER
}

enum ProjectMilestoneStatus {
  PLANNED
  ACTIVE
  COMPLETED
  CANCELLED
}

enum ProjectTaskStatus {
  BACKLOG
  TODO
  IN_PROGRESS
  IN_REVIEW
  BLOCKED
  DONE
  CANCELLED
}

enum ProjectTaskPriority {
  LOW
  MEDIUM
  HIGH
  URGENT
}

enum ProjectActivityType {
  PROJECT_UPDATED
  MEMBER_ADDED
  MEMBER_REMOVED
  MILESTONE_CREATED
  MILESTONE_UPDATED
  TASK_CREATED
  TASK_UPDATED
  TASK_ASSIGNED
  COMMENT_CREATED
  ATTACHMENT_ADDED
}

enum NotificationStatus {
  UNREAD
  READ
  ARCHIVED
}

model ProjectMembership {
  id        String            @id @default(cuid())
  projectId String
  userId    String
  role      ProjectMemberRole @default(CONTRIBUTOR)
  project   Project           @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user      User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime          @default(now())
  updatedAt DateTime          @updatedAt

  @@unique([projectId, userId])
  @@index([userId, role])
  @@index([projectId, role])
}

model ProjectMilestone {
  id          String                 @id @default(cuid())
  projectId   String
  title       String
  description String?
  status      ProjectMilestoneStatus @default(PLANNED)
  dueAt       DateTime?
  project     Project                @relation(fields: [projectId], references: [id], onDelete: Cascade)
  tasks       ProjectTask[]
  createdAt   DateTime               @default(now())
  updatedAt   DateTime               @updatedAt

  @@index([projectId, status])
  @@index([dueAt])
}

model ProjectTask {
  id          String              @id @default(cuid())
  projectId   String
  milestoneId String?
  creatorId   String
  assigneeId  String?
  title       String
  description String?
  status      ProjectTaskStatus   @default(TODO)
  priority    ProjectTaskPriority @default(MEDIUM)
  dueAt       DateTime?
  position    Int                 @default(0)
  metadata    Json?
  project     Project             @relation(fields: [projectId], references: [id], onDelete: Cascade)
  milestone   ProjectMilestone?   @relation(fields: [milestoneId], references: [id], onDelete: SetNull)
  creator     User                @relation("TaskCreator", fields: [creatorId], references: [id], onDelete: Restrict)
  assignee    User?               @relation("TaskAssignee", fields: [assigneeId], references: [id], onDelete: SetNull)
  comments    ProjectComment[]
  attachments ProjectAttachment[]
  createdAt   DateTime            @default(now())
  updatedAt   DateTime            @updatedAt

  @@index([projectId, status, position])
  @@index([assigneeId, status])
  @@index([milestoneId, status])
  @@index([dueAt])
}

model ProjectComment {
  id        String   @id @default(cuid())
  projectId String
  taskId    String?
  authorId  String
  body      String
  metadata  Json?
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  task      ProjectTask? @relation(fields: [taskId], references: [id], onDelete: Cascade)
  author    User     @relation(fields: [authorId], references: [id], onDelete: Restrict)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([projectId, createdAt])
  @@index([taskId, createdAt])
}

model ProjectAttachment {
  id          String   @id @default(cuid())
  projectId   String
  taskId      String?
  uploadedById String
  filename    String
  storageKey  String   @unique
  mimeType    String
  sizeBytes   BigInt
  checksumSha256 String?
  project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  task        ProjectTask? @relation(fields: [taskId], references: [id], onDelete: Cascade)
  uploadedBy  User     @relation(fields: [uploadedById], references: [id], onDelete: Restrict)
  createdAt   DateTime @default(now())

  @@index([projectId, createdAt])
  @@index([taskId, createdAt])
}

model ProjectActivity {
  id             String              @id @default(cuid())
  projectId      String
  actorUserId    String?
  type           ProjectActivityType
  resourceType   String
  resourceId     String?
  summary        String
  metadata       Json?
  project        Project             @relation(fields: [projectId], references: [id], onDelete: Cascade)
  createdAt      DateTime            @default(now())

  @@index([projectId, createdAt])
  @@index([type, createdAt])
}

model UserNotification {
  id             String             @id @default(cuid())
  userId         String
  organizationId String?
  projectId      String?
  type           String
  title          String
  body           String?
  status         NotificationStatus @default(UNREAD)
  metadata       Json?
  user           User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt      DateTime           @default(now())
  readAt         DateTime?

  @@index([userId, status, createdAt])
  @@index([projectId, createdAt])
}
```
