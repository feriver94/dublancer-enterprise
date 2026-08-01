-- Phase 10 production-readiness indexes are additive and target measured hot paths.
CREATE INDEX "SearchQueryLog_organizationId_durationMs_createdAt_idx"
  ON "SearchQueryLog"("organizationId", "durationMs", "createdAt");

CREATE INDEX "SearchQueryLog_organizationId_resultCount_createdAt_idx"
  ON "SearchQueryLog"("organizationId", "resultCount", "createdAt");

CREATE INDEX "PerformanceProfile_organizationId_status_startedAt_idx"
  ON "PerformanceProfile"("organizationId", "status", "startedAt");

CREATE INDEX "PerformanceProfile_organizationId_operation_durationMs_idx"
  ON "PerformanceProfile"("organizationId", "operation", "durationMs");

CREATE INDEX "LoadTestRun_organizationId_completedAt_idx"
  ON "LoadTestRun"("organizationId", "completedAt");

CREATE INDEX "BackgroundJob_organizationId_queue_status_priority_availableAt_idx"
  ON "BackgroundJob"("organizationId", "queue", "status", "priority", "availableAt");

CREATE INDEX "WorkerHeartbeat_organizationId_status_lastSeenAt_idx"
  ON "WorkerHeartbeat"("organizationId", "status", "lastSeenAt");

CREATE INDEX "IntegrationRun_organizationId_status_availableAt_idx"
  ON "IntegrationRun"("organizationId", "status", "availableAt");
