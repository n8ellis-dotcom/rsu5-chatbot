cat > ~/rsu5-chatbot/lib/search.ts << 'ENDOFFILE'
import { cosineDistance, desc, gt, sql } from 'drizzle-orm';
import { getDb } from './db';
import { embeddings } from './schema';
import { generateEmbedding } from './embeddings';

const RECENCY_KEYWORDS = [
  'current', 'this year', 'latest', 'now', 'today', 'recent', 'fy27', 'fy26',
  'budget', 'position', 'salary', 'salary', 'cut', 'reduction', 'retirement',
  'proposed', '2025', '2026'
];

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

export async function findRelevantChunks(query: string, limit = 8) {
  const db = getDb();
  const queryEmbedding = await generateEmbedding(query);
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
    .limit(boost ? limit * 2 : limit);

  if (!boost) return results.slice(0, limit);

  // Apply recency boost and re-sort
  const boosted = results.map(r => ({
    ...r,
    boostedScore: (r.similarity as number) + recencyScore(r.doc_date)
  }));
  boosted.sort((a, b) => b.boostedScore - a.boostedScore);
  return boosted.slice(0, limit);
}
ENDOFFILE
echo "search.ts written"
