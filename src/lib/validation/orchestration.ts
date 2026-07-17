import { z } from "zod";

export const ALLOWED_WORKFLOW_STEP_TYPES = ["ANALYTICS_EVENT", "NOTIFICATION", "BACKGROUND_JOB", "AI_RUN", "HUMAN_APPROVAL", "WORK_GRAPH_REBUILD"] as const;
const key = z.string().trim().min(2).max(100).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/);
const node = z.object({ key, name: z.string().trim().min(2).max(160), type: z.enum(ALLOWED_WORKFLOW_STEP_TYPES), maxAttempts: z.number().int().min(1).max(10).default(3), config: z.record(z.string(), z.unknown()).default({}) });
const edge = z.object({ from: key, to: key });
export const workflowGraphSchema = z.object({ nodes: z.array(node).min(1).max(100), edges: z.array(edge).max(500) }).superRefine((graph, ctx) => {
  const keys = new Set(graph.nodes.map((entry) => entry.key));
  if (keys.size !== graph.nodes.length) ctx.addIssue({ code: "custom", message: "Workflow step keys must be unique." });
  for (const relation of graph.edges) if (!keys.has(relation.from) || !keys.has(relation.to) || relation.from === relation.to) ctx.addIssue({ code: "custom", message: "Workflow edges must reference distinct existing nodes." });
  const outgoing = new Map<string, string[]>();
  graph.nodes.forEach((entry) => outgoing.set(entry.key, []));
  graph.edges.forEach((relation) => outgoing.get(relation.from)?.push(relation.to));
  const visiting = new Set<string>(); const visited = new Set<string>();
  const cycle = (nodeKey: string): boolean => { if (visiting.has(nodeKey)) return true; if (visited.has(nodeKey)) return false; visiting.add(nodeKey); if ((outgoing.get(nodeKey) ?? []).some(cycle)) return true; visiting.delete(nodeKey); visited.add(nodeKey); return false; };
  if (graph.nodes.some((entry) => cycle(entry.key))) ctx.addIssue({ code: "custom", message: "Workflow graph must be acyclic." });
});
export const createWorkflowDefinitionSchema = z.object({ key, name: z.string().trim().min(3).max(160), description: z.string().trim().max(2000).optional(), concurrencyLimit: z.number().int().min(1).max(100).default(10), timeoutSeconds: z.number().int().min(30).max(86400).default(3600), publish: z.boolean().default(false), graph: workflowGraphSchema });
export const startWorkflowRunSchema = z.object({ definitionId: z.string().min(1).max(191), idempotencyKey: z.string().min(8).max(191), input: z.record(z.string(), z.unknown()).default({}) });
export const workflowApprovalSchema = z.object({ decision: z.enum(["APPROVED", "REJECTED"]), comment: z.string().trim().max(2000).optional() });
export const workerClaimSchema = z.object({ workerId: z.string().trim().min(3).max(191) });
export const talentMatchSchema = z.object({ listingId: z.string().min(1).max(191), limit: z.number().int().min(1).max(100).default(25) });
export type WorkflowGraph = z.infer<typeof workflowGraphSchema>;
