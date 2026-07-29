import type { Link } from "../domain/link.js";

export interface CreateLinkData {
  slug: string;
  url: string;
  description?: string;
}

export interface UpdateLinkData {
  url?: string;
  description?: string;
}

/**
 * Persistence boundary for links. The API layer depends only on this
 * interface, so the in-memory store can be swapped for a Postgres-backed
 * implementation (asyncpg/SQLAlchemy-style) without touching route handlers.
 * All methods are async to keep that future swap seamless.
 */
export interface LinkRepository {
  list(query?: string): Promise<Link[]>;
  get(slug: string): Promise<Link | null>;
  create(data: CreateLinkData): Promise<Link>;
  update(slug: string, patch: UpdateLinkData): Promise<Link | null>;
  delete(slug: string): Promise<boolean>;
  recordHit(slug: string): Promise<Link | null>;
  count(): Promise<number>;
}
