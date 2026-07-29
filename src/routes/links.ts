import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import { createLinkSchema, slugSchema, updateLinkSchema } from "../domain/link.js";
import { NotFoundError } from "../errors.js";
import { linksTotal } from "../metrics.js";
import type { LinkRepository } from "../repository/link-repository.js";

interface LinkRouteOptions extends FastifyPluginOptions {
  repository: LinkRepository;
}

/**
 * JSON management API for links. Validation lives in the domain schemas so the
 * same rules apply everywhere; handlers stay thin and delegate to the
 * repository. Responses use a consistent `{ data, ... }` envelope.
 */
export async function registerLinkRoutes(
  app: FastifyInstance,
  opts: LinkRouteOptions,
): Promise<void> {
  const { repository } = opts;

  app.get<{ Querystring: { q?: string } }>("/api/links", async (req) => {
    const links = await repository.list(req.query.q);
    return { data: links, count: links.length };
  });

  app.get<{ Params: { slug: string } }>("/api/links/:slug", async (req) => {
    const slug = slugSchema.parse(req.params.slug);
    const link = await repository.get(slug);
    if (!link) throw new NotFoundError(`No link found for "${slug}"`);
    return { data: link };
  });

  app.post<{ Body: unknown }>("/api/links", async (req, reply) => {
    const input = createLinkSchema.parse(req.body);
    const link = await repository.create(input);
    linksTotal.set(await repository.count());
    req.log.info({ slug: link.slug }, "link created");
    reply.header("location", `/go/${link.slug}`);
    return reply.status(201).send({ data: link });
  });

  app.put<{ Params: { slug: string }; Body: unknown }>(
    "/api/links/:slug",
    async (req) => {
      const slug = slugSchema.parse(req.params.slug);
      const patch = updateLinkSchema.parse(req.body);
      const updated = await repository.update(slug, patch);
      if (!updated) throw new NotFoundError(`No link found for "${slug}"`);
      req.log.info({ slug }, "link updated");
      return { data: updated };
    },
  );

  app.delete<{ Params: { slug: string } }>("/api/links/:slug", async (req, reply) => {
    const slug = slugSchema.parse(req.params.slug);
    const deleted = await repository.delete(slug);
    if (!deleted) throw new NotFoundError(`No link found for "${slug}"`);
    linksTotal.set(await repository.count());
    req.log.info({ slug }, "link deleted");
    return reply.status(204).send();
  });
}
