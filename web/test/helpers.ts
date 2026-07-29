import type { FastifyInstance } from "fastify";

import { buildApp } from "../src/app.js";

/** Builds an app with a clean, unseeded in-memory store and silent logging. */
export async function makeTestApp(): Promise<FastifyInstance> {
  const app = await buildApp({
    seed: false,
    config: {
      host: "127.0.0.1",
      port: 0,
      logLevel: "silent",
      nodeEnv: "test",
      mongoDb: "golinks_test",
      mongoCollection: "links",
    },
  });
  await app.ready();
  return app;
}
