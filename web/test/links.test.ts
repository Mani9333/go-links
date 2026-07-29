import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { makeTestApp } from "./helpers.js";

describe("links API", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await makeTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("creates a link and returns 201 with a Location header", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/links",
      payload: { slug: "oncall", url: "https://example.com/oncall", description: "rota" },
    });

    expect(res.statusCode).toBe(201);
    expect(res.headers.location).toBe("/go/oncall");
    const body = res.json();
    expect(body.data).toMatchObject({
      slug: "oncall",
      url: "https://example.com/oncall",
      description: "rota",
      hits: 0,
    });
    expect(res.headers["x-request-id"]).toBeTruthy();
  });

  it("rejects an invalid slug with a 400 validation error", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/links",
      payload: { slug: "Not Valid!", url: "https://example.com" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("validation_error");
  });

  it("rejects a non-http(s) url", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/links",
      payload: { slug: "evil", url: "javascript:alert(1)" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("validation_error");
  });

  it("returns 409 when creating a duplicate slug", async () => {
    const payload = { slug: "dup", url: "https://example.com" };
    await app.inject({ method: "POST", url: "/api/links", payload });
    const res = await app.inject({ method: "POST", url: "/api/links", payload });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("conflict");
  });

  it("lists and filters links via ?q=", async () => {
    await app.inject({
      method: "POST",
      url: "/api/links",
      payload: { slug: "payroll", url: "https://pay.example.com" },
    });
    await app.inject({
      method: "POST",
      url: "/api/links",
      payload: { slug: "oncall", url: "https://ops.example.com" },
    });

    const all = await app.inject({ method: "GET", url: "/api/links" });
    expect(all.json().count).toBe(2);

    const filtered = await app.inject({ method: "GET", url: "/api/links?q=pay" });
    const slugs = filtered.json().data.map((l: { slug: string }) => l.slug);
    expect(slugs).toEqual(["payroll"]);
  });

  it("updates a link", async () => {
    await app.inject({
      method: "POST",
      url: "/api/links",
      payload: { slug: "docs", url: "https://old.example.com" },
    });

    const res = await app.inject({
      method: "PUT",
      url: "/api/links/docs",
      payload: { url: "https://new.example.com" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.url).toBe("https://new.example.com");
  });

  it("returns 404 for unknown slugs on get/update/delete", async () => {
    const get = await app.inject({ method: "GET", url: "/api/links/missing" });
    const put = await app.inject({
      method: "PUT",
      url: "/api/links/missing",
      payload: { url: "https://example.com" },
    });
    const del = await app.inject({ method: "DELETE", url: "/api/links/missing" });

    expect(get.statusCode).toBe(404);
    expect(put.statusCode).toBe(404);
    expect(del.statusCode).toBe(404);
  });

  it("deletes a link and returns 204", async () => {
    await app.inject({
      method: "POST",
      url: "/api/links",
      payload: { slug: "temp", url: "https://example.com" },
    });

    const del = await app.inject({ method: "DELETE", url: "/api/links/temp" });
    expect(del.statusCode).toBe(204);

    const get = await app.inject({ method: "GET", url: "/api/links/temp" });
    expect(get.statusCode).toBe(404);
  });
});
