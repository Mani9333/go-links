import type { MongoClient } from "mongodb";

import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { connectMongo, ensureLinkSchema } from "./db/mongo.js";
import type { LinkRepository } from "./repository/link-repository.js";
import { MongoLinkRepository } from "./repository/mongo-link-repository.js";

async function main(): Promise<void> {
  const config = loadConfig();

  // Composition root: choose the storage backend based on configuration.
  let repository: LinkRepository | undefined;
  let mongoClient: MongoClient | undefined;

  if (config.mongoUri) {
    const { client, db } = await connectMongo(config.mongoUri, config.mongoDb);
    await ensureLinkSchema(db, config.mongoCollection);
    repository = new MongoLinkRepository(db, config.mongoCollection);
    mongoClient = client;
  }

  // When no repository is provided, buildApp falls back to a seeded in-memory store.
  const app = await buildApp(repository ? { config, repository } : { config });

  if (config.mongoUri) {
    app.log.info(
      { db: config.mongoDb, collection: config.mongoCollection },
      "connected to MongoDB store",
    );
  } else {
    app.log.warn(
      "MONGODB_URI not set — using in-memory store (data resets on restart)",
    );
  }

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, "shutting down");
    await app.close();
    if (mongoClient) await mongoClient.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (err) {
    app.log.error(err, "failed to start server");
    if (mongoClient) await mongoClient.close();
    process.exit(1);
  }
}

void main();
