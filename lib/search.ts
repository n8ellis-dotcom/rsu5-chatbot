import { cosineDistance, desc, gt, sql } from 'drizzle-orm';
import { getDb } from './db';
import { embeddings } from './schema';
import { generateEmbedding } from './embeddings';

export async function findRelevantChunks(query: string, limit = 8) {
  const db = getDb();
  const queryEmbedding = await generateEmbedding(query);

  const similarity = sql<number>`1 - (${cosineDistance(
    embeddings.embedding,
    queryEmbedding
  )})`;

  const results = await db
    .select({
      filepath: embeddings.filepath,
      chunk: embeddings.chunk,
      similarity,
    })
    .from(embeddings)
    .where(gt(similarity, 0.3))
    .orderBy(desc(similarity))
    .limit(limit);

  return results;
}
