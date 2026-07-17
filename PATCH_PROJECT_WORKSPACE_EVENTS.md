After each successful project mutation, enqueue an event inside the same
Prisma transaction when possible.

Example after creating a task:

```ts
await tx.realtimeEvent.create({
  data: {
    organizationId: context.organizationId,
    projectId,
    topic: `project:${projectId}`,
    eventType: "project.task.created",
    aggregateType: "ProjectTask",
    aggregateId: task.id,
    actorUserId: context.userId,
    payload: {
      taskId: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority
    }
  }
});
```

Recommended mappings:

```text
Task created       -> project.task.created
Task updated       -> project.task.updated
Comment created    -> project.comment.created
Milestone created  -> project.milestone.created
Member changed     -> project.member.updated
Notification added -> notification.created
```

The database outbox is the source of truth. Do not publish directly to
Redis from business transactions.
