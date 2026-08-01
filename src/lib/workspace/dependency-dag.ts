import { AppError } from "@/lib/errors/app-error";

export type TaskDependencyEdge = {
  predecessorTaskId: string;
  successorTaskId: string;
};

export function validateTaskDependencyDag(edges: TaskDependencyEdge[]) {
  const nodes = new Set<string>();
  const adjacency = new Map<string, Set<string>>();
  const indegree = new Map<string, number>();

  for (const edge of edges) {
    if (edge.predecessorTaskId === edge.successorTaskId) {
      throw new AppError("VALIDATION_ERROR", "A task cannot depend on itself.", 422);
    }
    nodes.add(edge.predecessorTaskId);
    nodes.add(edge.successorTaskId);
    adjacency.set(edge.predecessorTaskId, adjacency.get(edge.predecessorTaskId) ?? new Set());
    adjacency.set(edge.successorTaskId, adjacency.get(edge.successorTaskId) ?? new Set());
    indegree.set(edge.predecessorTaskId, indegree.get(edge.predecessorTaskId) ?? 0);
    indegree.set(edge.successorTaskId, indegree.get(edge.successorTaskId) ?? 0);
    const successors = adjacency.get(edge.predecessorTaskId)!;
    if (!successors.has(edge.successorTaskId)) {
      successors.add(edge.successorTaskId);
      indegree.set(edge.successorTaskId, (indegree.get(edge.successorTaskId) ?? 0) + 1);
    }
  }

  const ready = [...nodes].filter((node) => (indegree.get(node) ?? 0) === 0);
  let visited = 0;
  while (ready.length) {
    const current = ready.pop()!;
    visited += 1;
    for (const successor of adjacency.get(current) ?? []) {
      const next = (indegree.get(successor) ?? 0) - 1;
      indegree.set(successor, next);
      if (next === 0) ready.push(successor);
    }
  }
  if (visited !== nodes.size) {
    throw new AppError("CONFLICT", "Task dependencies must remain a directed acyclic graph.", 409);
  }
}
