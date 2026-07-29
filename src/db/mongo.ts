import { MongoClient, type Db } from "mongodb";

export interface MongoContext {
  client: MongoClient;
  db: Db;
}

/**
 * Opens a MongoDB connection. Fails fast (rather than hanging) if the cluster
 * is unreachable so startup errors surface immediately in the logs.
 */
export async function connectMongo(uri: string, dbName: string): Promise<MongoContext> {
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 8000,
    appName: "go-links",
    // Don't persist undefined fields as BSON null (keeps documents/API clean).
    ignoreUndefined: true,
  });
  await client.connect();
  const db = client.db(dbName);
  return { client, db };
}

/**
 * Ensures the links collection and its indexes exist. Idempotent, so it is
 * safe to run on every startup. The slug is stored as the document `_id`, which
 * gives us a unique constraint for free; the extra indexes support "most used"
 * ordering and time-based queries.
 */
export async function ensureLinkSchema(db: Db, collectionName: string): Promise<void> {
  const existing = await db.listCollections({ name: collectionName }).toArray();
  if (existing.length === 0) {
    await db.createCollection(collectionName);
  }
  const collection = db.collection(collectionName);
  await collection.createIndex({ hits: -1 });
  await collection.createIndex({ createdAt: -1 });
}
