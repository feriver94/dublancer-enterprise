import { z } from "zod";

const currencySchema = z
  .string()
  .trim()
  .length(3)
  .transform((value) => value.toUpperCase());

export const createProjectSchema = z.object({
  title: z.string().trim().min(3).max(160),
  slug: z
    .string()
    .trim()
    .min(3)
    .max(180)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().max(10_000).optional(),
  budgetMinor: z
    .union([z.string().regex(/^\d+$/), z.number().int().nonnegative()])
    .optional()
    .transform((value) =>
      value === undefined ? undefined : BigInt(value),
    ),
  currency: currencySchema.default("USD"),
});

export const updateProjectSchema = createProjectSchema
  .partial()
  .extend({
    status: z
      .enum([
        "DRAFT",
        "OPEN",
        "IN_PROGRESS",
        "COMPLETED",
        "CANCELLED",
        "DISPUTED",
      ])
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided.",
  });

export const projectListQuerySchema = z.object({
  cursor: z.string().trim().min(1).optional(),
  take: z.coerce.number().int().min(1).max(100).default(25),
  status: z
    .enum([
      "DRAFT",
      "OPEN",
      "IN_PROGRESS",
      "COMPLETED",
      "CANCELLED",
      "DISPUTED",
    ])
    .optional(),
});
