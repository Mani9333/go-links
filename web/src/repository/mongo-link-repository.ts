import { type Collection, type Db, type Filter, MongoServerError } from "mongodb";

import type { Link } from "../domain/link.js";
import { ConflictError } from "../errors.js";
import type {
  CreateLinkData,
  LinkRepository,
  UpdateLinkData,
} from "./link-repository.js";

/**
 * Storage shape. The slug is used as `_id` so uniqueness is enforced by the
 * primary key and lookups are index-backed. Dates are stored as native BSON
 * dates and serialised to ISO strings at the boundary.
 */
interface LinkDoc {
  _id: string;
  url: string;
  description?: string;
  hits: number;
  createdAt: Date;
  updatedAt: Date;
  lastAccessedAt?: Date;
}

function toLink(doc: LinkDoc): Link {
  return {
    slug: doc._id,
    url: doc.url,
    // Normalise any legacy null values to undefined so JSON omits the field.
    description: doc.description ?? undefined,
    hits: doc.hits,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    lastAccessedAt: doc.lastAccessedAt?.toISOString(),
  };
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * MongoDB-backed implementation of {@link LinkRepository}. Interchangeable with
 * the in-memory store — the API layer only ever sees the interface.
 */
export class MongoLinkRepository implements LinkRepository {
  private readonly collection: Collection<LinkDoc>;

  constructor(db: Db, collectionName: string) {
    this.collection = db.collection<LinkDoc>(collectionName);
  }

  async list(query?: string): Promise<Link[]> {
    const trimmed = query?.trim();
    const filter: Filter<LinkDoc> =
      trimmed && trimmed.length > 0 ? buildSearchFilter(trimmed) : {};
    const docs = await this.collection.find(filter).sort({ _id: 1 }).toArray();
    return docs.map(toLink);
  }

  async get(slug: string): Promise<Link | null> {
    const doc = await this.collection.findOne({ _id: slug });
    return doc ? toLink(doc) : null;
  }

  async create(data: CreateLinkData): Promise<Link> {
    const now = new Date();
    const doc: LinkDoc = {
      _id: data.slug,
      url: data.url,
      description: data.description,
      hits: 0,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await this.collection.insertOne(doc);
    } catch (err) {
      if (err instanceof MongoServerError && err.code === 11000) {
        throw new ConflictError(`A link for "${data.slug}" already exists`);
      }
      throw err;
    }
    return toLink(doc);
  }

  async update(slug: string, patch: UpdateLinkData): Promise<Link | null> {
    const set: Partial<LinkDoc> = { updatedAt: new Date() };
    if (patch.url !== undefined) set.url = patch.url;
    if (patch.description !== undefined) set.description = patch.description;

    const doc = await this.collection.findOneAndUpdate(
      { _id: slug },
      { $set: set },
      { returnDocument: "after", includeResultMetadata: false },
    );
    return doc ? toLink(doc) : null;
  }

  async delete(slug: string): Promise<boolean> {
    const result = await this.collection.deleteOne({ _id: slug });
    return result.deletedCount === 1;
  }

  async recordHit(slug: string): Promise<Link | null> {
    const doc = await this.collection.findOneAndUpdate(
      { _id: slug },
      { $inc: { hits: 1 }, $set: { lastAccessedAt: new Date() } },
      { returnDocument: "after", includeResultMetadata: false },
    );
    return doc ? toLink(doc) : null;
  }

  async count(): Promise<number> {
    return this.collection.countDocuments();
  }
}

function buildSearchFilter(needle: string): Filter<LinkDoc> {
  const rx = new RegExp(escapeRegex(needle), "i");
  return { $or: [{ _id: rx }, { url: rx }, { description: rx }] };
}
