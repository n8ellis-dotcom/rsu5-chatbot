import { cosineDistance, desc, gt, sql } from 'drizzle-orm';
import { getDb } from './db';
import { embeddings } from './schema';
import { generateEmbedding } from './embeddings';

const RECENCY_KEYWORDS = [
  'current', 'this year', 'latest', 'now', 'today', 'recent', 'fy27', 'fy26',
  'budget', 'position', 'salary', 'cut', 'reduction', 'retirement',
  'proposed', '2025', '2026'
];

// Simple in-memory embedding cache — avoids repeat OpenAI calls
const embeddingCache = new Map<string, number[]>();
const CACHE_MAX = 50;

async function getCachedEmbedding(query: string): Promise<number[]> {
  const key = query.toLowerCase().trim();
  if (embeddingCache.has(key)) return embeddingCache.get(key)!;
  const embedding = await generateEmbedding(query);
  if (embeddingCache.size >= CACHE_MAX) {
    embeddingCache.delete(embeddingCache.keys().next().value);
  }
  embeddingCache.set(key, embedding);
  return embedding;
}

function needsRecencyBoost(query: string): boolean {
  const q = query.toLowerCase();
  return RECENCY_KEYWORDS.some(k => q.includes(k));
}

function recencyScore(docDate: string | null): number {
  if (!docDate) return 0;
  const match = docDate.match(/(\d{4})/);
  if (!match) return 0;
  const year = parseInt(match[1]);
  if (year >= 2026) return 0.05;
  if (year >= 2025) return 0.03;
  if (year >= 2024) return 0.01;
  return 0;
}

export async function findRelevantChunks(query: string, limit = 4) {
  const db = getDb();
  const queryEmbedding = await getCachedEmbedding(query);
  const similarity = sql<number>`1 - (${cosineDistance(embeddings.embedding, queryEmbedding)})`;
  const boost = needsRecencyBoost(query);

  const results = await db
    .select({
      filepath: embeddings.filepath,
      chunk: embeddings.chunk,
      similarity,
      source_url: embeddings.source_url,
      doc_type: embeddings.doc_type,
      school: embeddings.school,
      doc_date: embeddings.doc_date,
    })
    .from(embeddings)
    .where(gt(similarity, 0.3))
    .orderBy(desc(similarity))
    .limit(boost ? limit + 4 : limit);

  if (!boost) return results;

  const boosted = results.map(r => ({
    ...r,
    boostedScore: (r.similarity as number) + recencyScore(r.doc_date)
  }));
  boosted.sort((a, b) => b.boostedScore - a.boostedScore);
  return boosted.slice(0, limit);
}
