export type DatabaseReadiness = {
  status: "healthy" | "unhealthy";
  latencyMs: number;
  checkedAt: string;
};

export type QueueReadiness = {
  status: "healthy" | "unhealthy";
  pendingJobs: number | null;
  deadLetters: number | null;
  reason?: "DATABASE_UNAVAILABLE" | "INSPECTION_FAILED" | "DEAD_LETTERS_PRESENT";
};

export type ReadinessDependencies = {
  checkDatabase: () => Promise<{ status: string; latencyMs: number; checkedAt: string }>;
  checkRedis: () => Promise<boolean>;
  inspectQueue: () => Promise<{ pendingJobs: number; deadLetters: number }>;
  cacheHealth: () => unknown;
  now?: () => Date;
  timeoutMs?: number;
};

async function within<T>(operation: () => Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Readiness dependency timed out.")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function unavailableDatabase(now: Date): DatabaseReadiness {
  return {
    status: "unhealthy",
    latencyMs: 0,
    checkedAt: now.toISOString(),
  };
}

function safeCacheHealth(probe: () => unknown) {
  try {
    return probe();
  } catch {
    return { strategy: "unavailable", circuitOpen: true };
  }
}

export async function evaluateReadiness(dependencies: ReadinessDependencies) {
  const now = dependencies.now?.() ?? new Date();
  const timeoutMs = Number.isFinite(dependencies.timeoutMs) && (dependencies.timeoutMs ?? 0) > 0
    ? dependencies.timeoutMs as number
    : 2_000;
  const [databaseResult, redisResult] = await Promise.allSettled([
    within(dependencies.checkDatabase, timeoutMs),
    within(dependencies.checkRedis, timeoutMs),
  ]);

  const database: DatabaseReadiness = databaseResult.status === "fulfilled"
    ? {
        status: databaseResult.value.status === "healthy" ? "healthy" : "unhealthy",
        latencyMs: Number.isFinite(databaseResult.value.latencyMs) ? databaseResult.value.latencyMs : 0,
        checkedAt: databaseResult.value.checkedAt,
      }
    : unavailableDatabase(now);
  const redisHealthy = redisResult.status === "fulfilled" && redisResult.value === true;

  let queue: QueueReadiness;
  if (database.status !== "healthy") {
    queue = {
      status: "unhealthy",
      pendingJobs: null,
      deadLetters: null,
      reason: "DATABASE_UNAVAILABLE",
    };
  } else {
    const queueResult = await Promise.allSettled([within(dependencies.inspectQueue, timeoutMs)]);
    if (queueResult[0].status === "rejected") {
      queue = {
        status: "unhealthy",
        pendingJobs: null,
        deadLetters: null,
        reason: "INSPECTION_FAILED",
      };
    } else {
      const { pendingJobs, deadLetters } = queueResult[0].value;
      queue = {
        status: deadLetters === 0 ? "healthy" : "unhealthy",
        pendingJobs,
        deadLetters,
        ...(deadLetters === 0 ? {} : { reason: "DEAD_LETTERS_PRESENT" as const }),
      };
    }
  }

  const ready = database.status === "healthy" && redisHealthy && queue.status === "healthy";
  return {
    status: ready ? "ready" as const : "unhealthy" as const,
    checks: {
      database,
      redis: { status: redisHealthy ? "healthy" as const : "unhealthy" as const },
      queue,
      cache: safeCacheHealth(dependencies.cacheHealth),
    },
    timestamp: now.toISOString(),
  };
}

export function unavailableReadiness(now = new Date()) {
  return {
    status: "unhealthy" as const,
    checks: {
      database: unavailableDatabase(now),
      redis: { status: "unhealthy" as const },
      queue: {
        status: "unhealthy" as const,
        pendingJobs: null,
        deadLetters: null,
        reason: "INSPECTION_FAILED" as const,
      },
      cache: { strategy: "unavailable", circuitOpen: true },
    },
    timestamp: now.toISOString(),
  };
}
