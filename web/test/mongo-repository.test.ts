import { randomUUID } from "node:crypto";

import type { MongoContext } from "../src/db/mongo.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { connectMongo, ensureLinkSchema } from "../src/db/mongo.js";
import { MongoLinkRepository } from "../src/repository/mongo-link-repository.js";

/**
 * Integration test for the MongoDB-backed repository. Skipped unless
 * MONGODB_TEST_URI is provided, so the default `npm test` stays hermetic.
 *
 *   MONGODB_TEST_URI="mongodb://127.0.0.1:27017" npm test
 */
const uri = process.env.MONGODB_TEST_URI;

describe.skipIf(!uri)("MongoLinkRepository (integration)", () => {
  const dbName = `golinks_test_${randomUUID().slice(0, 8)}`;
  const collection = "links";
  let ctx: MongoContext;
  let repo: MongoLinkRepository;

  beforeAll(async () => {
    ctx = await connectMongo(uri as string, dbName);
    await ensureLinkSchema(ctx.db, collection);
    repo = new MongoLinkRepository(ctx.db, collection);
  });

  afterAll(async () => {
    if (ctx) {
      await ctx.db.dropDatabase();
      await ctx.client.close();
    }
  });

  it("creates, reads, updates, counts and deletes", async () => {
    const created = await repo.create({
      slug: "oncall",
      url: "https://example.com/oncall",
      description: "rota",
    });
    expect(created.slug).toBe("oncall");
    expect(created.hits).toBe(0);

    expect((await repo.get("oncall"))?.url).toBe("https://example.com/oncall");
    expect(await repo.count()).toBe(1);

    const updated = await repo.update("oncall", { url: "https://example.com/new" });
    expect(updated?.url).toBe("https://example.com/new");

    const hit = await repo.recordHit("oncall");
    expect(hit?.hits).toBe(1);

    const found = await repo.list("onc");
    expect(found.map((l) => l.slug)).toEqual(["oncall"]);

    expect(await repo.delete("oncall")).toBe(true);
    expect(await repo.get("oncall")).toBeNull();
  });

  it("rejects duplicate slugs with a conflict", async () => {
    await repo.create({ slug: "dup", url: "https://example.com" });
    await expect(repo.create({ slug: "dup", url: "https://example.com" })).rejects.toThrow(
      /already exists/,
    );
  });
});
