import { cosineDistance, desc, gt, sql } from 'drizzle-orm';
import { db } from './db';
import { embeddings } from './schema';
import { generateEmbedding } from './embeddings';

export async function findRelevantChunks(query: string, limit = 8) {
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
    .where(gt(similarity, 0.5))
    .orderBy(desc(similarity))
    .limit(limit);

  return results;
}
