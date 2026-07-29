import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";

import { loadConfig, type AppConfig } from "./config.js";
import { AppError } from "./errors.js";
import { httpRequestDuration, linksTotal, registry } from "./metrics.js";
import { InMemoryLinkRepository } from "./repository/in-memory-link-repository.js";
import type { LinkRepository } from "./repository/link-repository.js";
import { registerLinkRoutes } from "./routes/links.js";
import { registerRedirectRoutes } from "./routes/redirect.js";
import { registerSystemRoutes } from "./routes/system.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

/** Example links so the app is useful on first launch. */
const DEFAULT_SEED = [
  {
    slug: "design-system",
    url: "https://example.com/design-system",
    description: "Component library & UI guidelines",
  },
  {
    slug: "oncall",
    url: "https://example.com/oncall",
    description: "Current on-call schedule",
  },
  {
    slug: "payroll",
    url: "https://example.com/payroll",
    description: "Payroll & benefits portal",
  },
];

export interface BuildAppOptions {
  config?: AppConfig;
  repository?: LinkRepository;
  /** Seed example links (default true). Set false for a clean store in tests. */
  seed?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig();
  const repository =
    options.repository ??
    new InMemoryLinkRepository(options.seed === false ? [] : DEFAULT_SEED);

  const app = Fastify({
    logger: buildLoggerOptions(config),
    trustProxy: true,
    // Honour an inbound correlation id, otherwise mint one. Surfaced on every
    // log line and echoed back via the x-request-id header.
    genReqId: (req) => {
      const header = req.headers["x-request-id"];
      if (typeof header === "string" && header.length > 0) return header;
      if (Array.isArray(header) && header[0]) return header[0];
      return randomUUID();
    },
  });

  app.addHook("onRequest", async (req, reply) => {
    reply.header("x-request-id", req.id);
  });

  // Record request latency for Prometheus, labelled by the route *pattern*
  // (not the raw URL) to keep metric cardinality bounded.
  app.addHook("onResponse", async (req, reply) => {
    const route = req.routeOptions?.url ?? req.url;
    httpRequestDuration
      .labels(req.method, route, String(reply.statusCode))
      .observe(reply.elapsedTime / 1000);
  });

  app.setErrorHandler((error, req, reply) => {
    if (error instanceof ZodError) {
      req.log.info({ issues: error.issues }, "request validation failed");
      return reply.status(400).send({
        error: {
          code: "validation_error",
          message: "Request validation failed",
          details: error.issues.map((issue) => ({
            path: issue.path.join(".") || "(root)",
            message: issue.message,
          })),
          requestId: req.id,
        },
      });
    }

    if (error instanceof AppError) {
      if (error.statusCode >= 500) req.log.error({ err: error }, error.message);
      else req.log.info({ code: error.code }, error.message);
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          requestId: req.id,
        },
      });
    }

    const fastifyError = error as { statusCode?: number; message?: string };
    const statusCode = fastifyError.statusCode ?? 500;
    if (statusCode >= 500) req.log.error({ err: error }, "unhandled error");
    return reply.status(statusCode).send({
      error: {
        code: statusCode >= 500 ? "internal_error" : "bad_request",
        message:
          statusCode >= 500
            ? "Internal server error"
            : (fastifyError.message ?? "Bad request"),
        requestId: req.id,
      },
    });
  });

  app.setNotFoundHandler((req, reply) => {
    reply.status(404).send({
      error: {
        code: "not_found",
        message: `Route ${req.method} ${req.url} not found`,
        requestId: req.id,
      },
    });
  });

  app.addHook("onReady", async () => {
    linksTotal.set(await repository.count());
  });

  await app.register(registerSystemRoutes, { registry });
  await app.register(registerLinkRoutes, { repository });
  await app.register(registerRedirectRoutes, { repository });

  // Serve the minimal browser UI. Registered last so explicit API/redirect
  // routes always take precedence over the static wildcard.
  await app.register(fastifyStatic, {
    root: path.join(currentDir, "..", "public"),
    prefix: "/",
  });

  return app;
}

function buildLoggerOptions(config: AppConfig) {
  const base = { level: config.logLevel };
  if (config.nodeEnv === "development") {
    return {
      ...base,
      transport: {
        target: "pino-pretty",
        options: { translateTime: "HH:MM:ss Z", ignore: "pid,hostname" },
      },
    };
  }
  // Structured JSON logs everywhere else — friendly to log aggregators.
  return base;
}
