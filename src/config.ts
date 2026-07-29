export interface AppConfig {
  host: string;
  port: number;
  logLevel: string;
  nodeEnv: string;
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

  return {
    host: env.HOST ?? "0.0.0.0",
    port,
    logLevel: env.LOG_LEVEL ?? "info",
    nodeEnv: env.NODE_ENV ?? "development",
  };
}
