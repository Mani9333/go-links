export interface AppConfig {
  host: string;
  port: number;
  logLevel: string;
  nodeEnv: string;
  /** MongoDB connection string. When omitted, the app uses an in-memory store. */
  mongoUri?: string;
  mongoDb: string;
  mongoCollection: string;
  /**
   * Base URL of the Python analytics service. When set, the app proxies
   * `/analytics/*` to it — a dev convenience so the UI's insights work without
   * nginx. In production, nginx routes `/analytics` directly to the service.
   */
  analyticsUrl?: string;
}

/**
 * Reads configuration from the environment with safe defaults so the service
 * runs locally with zero setup but stays fully configurable in production.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const port = Number.parseInt(env.PORT ?? "3000", 10);
  if (Number.isNaN(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid PORT: ${String(env.PORT)}`);
  }

  const mongoUri = env.MONGODB_URI?.trim();
  const analyticsUrl = env.ANALYTICS_URL?.trim();

  return {
    host: env.HOST ?? "0.0.0.0",
    port,
    logLevel: env.LOG_LEVEL ?? "info",
    nodeEnv: env.NODE_ENV ?? "development",
    mongoUri: mongoUri && mongoUri.length > 0 ? mongoUri : undefined,
    mongoDb: env.MONGODB_DB ?? "golinks",
    mongoCollection: env.MONGODB_COLLECTION ?? "links",
    analyticsUrl: analyticsUrl && analyticsUrl.length > 0 ? analyticsUrl : undefined,
  };
}
