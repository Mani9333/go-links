import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { makeTestApp } from "./helpers.js";

describe("go/ redirect", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await makeTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("302-redirects a known slug and increments its hit count", async () => {
    await app.inject({
      method: "POST",
      url: "/api/links",
      payload: { slug: "oncall", url: "https://example.com/oncall" },
    });

    const res = await app.inject({ method: "GET", url: "/go/oncall" });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("https://example.com/oncall");

    const link = await app.inject({ method: "GET", url: "/api/links/oncall" });
    expect(link.json().data.hits).toBe(1);
  });

  it("redirects a miss back to the UI with the slug prefilled", async () => {
    const res = await app.inject({ method: "GET", url: "/go/unknown" });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/?missing=unknown");
  });
});
