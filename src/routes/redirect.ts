import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import { redirectsTotal } from "../metrics.js";
import type { LinkRepository } from "../repository/link-repository.js";

interface RedirectRouteOptions extends FastifyPluginOptions {
  repository: LinkRepository;
}

/**
 * The core user-facing path: GET /go/<slug> resolves and 302-redirects to the
 * destination, counting the hit. A miss is a normal outcome (not an error), so
 * we send the user to the UI with the slug prefilled to create it.
 */
export async function registerRedirectRoutes(
  app: FastifyInstance,
  opts: RedirectRouteOptions,
): Promise<void> {
  const { repository } = opts;

  app.get<{ Params: { slug: string } }>("/go/:slug", async (req, reply) => {
    const { slug } = req.params;
    const link = await repository.recordHit(slug);

    if (!link) {
      redirectsTotal.labels("miss").inc();
      req.log.info({ slug }, "redirect miss");
      return reply.redirect(`/?missing=${encodeURIComponent(slug)}`, 302);
    }

    redirectsTotal.labels("hit").inc();
    req.log.info({ slug, hits: link.hits }, "redirect hit");
    return reply.redirect(link.url, 302);
  });
}
