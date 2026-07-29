import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import type { Registry } from "prom-client";

interface SystemRouteOptions extends FastifyPluginOptions {
  registry: Registry;
}

/**
 * Operational endpoints: liveness/readiness and Prometheus metrics. These are
 * intentionally unauthenticated and cheap so schedulers and scrapers can hit
 * them frequently.
 */
export async function registerSystemRoutes(
  app: FastifyInstance,
  opts: SystemRouteOptions,
): Promise<void> {
  const startedAt = Date.now();

  app.get("/healthz", async () => ({
    status: "ok",
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
  }));

  app.get("/metrics", async (_req, reply) => {
    reply.header("content-type", opts.registry.contentType);
    return opts.registry.metrics();
  });
}
