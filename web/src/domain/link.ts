import { z } from "zod";

/**
 * Slugs are the "go/<slug>" shortcut. Kept to a flat, URL-safe namespace for
 * v1 (see README tradeoffs — hierarchical slugs like go/team/oncall are a
 * natural follow-up).
 */
export const slugSchema = z
  .string()
  .trim()
  .min(1, "slug is required")
  .max(128, "slug must be at most 128 characters")
  .regex(
    /^[a-z0-9][a-z0-9_-]*$/,
    "slug must be lowercase and may contain letters, numbers, '-' and '_'",
  );

/** Only http(s) destinations are allowed to avoid javascript:/data: redirects. */
const httpUrlSchema = z
  .string()
  .trim()
  .min(1, "url is required")
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }, "url must be a valid http(s) URL");

const descriptionSchema = z.string().trim().max(280).optional();

export const createLinkSchema = z.object({
  slug: slugSchema,
  url: httpUrlSchema,
  description: descriptionSchema,
});

export const updateLinkSchema = z
  .object({
    url: httpUrlSchema.optional(),
    description: descriptionSchema,
  })
  .refine((value) => value.url !== undefined || value.description !== undefined, {
    message: "provide at least one field to update: url or description",
  });

export type CreateLinkInput = z.infer<typeof createLinkSchema>;
export type UpdateLinkInput = z.infer<typeof updateLinkSchema>;

export interface Link {
  slug: string;
  url: string;
  description?: string;
  hits: number;
  createdAt: string;
  updatedAt: string;
  lastAccessedAt?: string;
}
