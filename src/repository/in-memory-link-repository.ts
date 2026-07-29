import type { Link } from "../domain/link.js";
import { ConflictError } from "../errors.js";
import type {
  CreateLinkData,
  LinkRepository,
  UpdateLinkData,
} from "./link-repository.js";

/**
 * Simple in-memory implementation backed by a Map. Data is not durable across
 * restarts — intentional for v1 (see README). The class is the seam where a
 * real database would plug in.
 */
export class InMemoryLinkRepository implements LinkRepository {
  private readonly store = new Map<string, Link>();

  constructor(seed: CreateLinkData[] = []) {
    for (const item of seed) {
      const now = new Date().toISOString();
      this.store.set(item.slug, {
        slug: item.slug,
        url: item.url,
        description: item.description,
        hits: 0,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  async list(query?: string): Promise<Link[]> {
    const all = [...this.store.values()];
    const filtered =
      query && query.trim().length > 0
        ? all.filter((link) => matchesQuery(link, query.trim().toLowerCase()))
        : all;
    return filtered.sort((a, b) => a.slug.localeCompare(b.slug));
  }

  async get(slug: string): Promise<Link | null> {
    return this.store.get(slug) ?? null;
  }

  async create(data: CreateLinkData): Promise<Link> {
    if (this.store.has(data.slug)) {
      throw new ConflictError(`A link for "${data.slug}" already exists`);
    }
    const now = new Date().toISOString();
    const link: Link = {
      slug: data.slug,
      url: data.url,
      description: data.description,
      hits: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(link.slug, link);
    return link;
  }

  async update(slug: string, patch: UpdateLinkData): Promise<Link | null> {
    const existing = this.store.get(slug);
    if (!existing) return null;

    const updated: Link = {
      ...existing,
      url: patch.url ?? existing.url,
      description: patch.description ?? existing.description,
      updatedAt: new Date().toISOString(),
    };
    this.store.set(slug, updated);
    return updated;
  }

  async delete(slug: string): Promise<boolean> {
    return this.store.delete(slug);
  }

  async recordHit(slug: string): Promise<Link | null> {
    const existing = this.store.get(slug);
    if (!existing) return null;

    const updated: Link = {
      ...existing,
      hits: existing.hits + 1,
      lastAccessedAt: new Date().toISOString(),
    };
    this.store.set(slug, updated);
    return updated;
  }

  async count(): Promise<number> {
    return this.store.size;
  }
}

function matchesQuery(link: Link, needle: string): boolean {
  return (
    link.slug.toLowerCase().includes(needle) ||
    link.url.toLowerCase().includes(needle) ||
    (link.description?.toLowerCase().includes(needle) ?? false)
  );
}
