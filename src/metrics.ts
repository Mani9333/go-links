import client from "prom-client";

/**
 * A dedicated registry (rather than the global default) keeps metrics isolated
 * and makes the app safe to instantiate multiple times (e.g. in tests).
 */
export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

export const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status_code"] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

export const redirectsTotal = new client.Counter({
  name: "golinks_redirects_total",
  help: "Total number of go/ redirect attempts, labelled by result",
  labelNames: ["result"] as const,
  registers: [registry],
});

export const linksTotal = new client.Gauge({
  name: "golinks_links_total",
  help: "Current number of go links stored",
  registers: [registry],
});
