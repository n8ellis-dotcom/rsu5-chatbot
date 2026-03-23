import { cosineDistance, desc, gt, sql, or, like } from 'drizzle-orm';
import { getDb } from './db';
import { embeddings } from './schema';
import { generateEmbedding } from './embeddings';

type ChunkResult = {
  filepath: string;
  chunk: string;
  similarity: number;
  source_url: string | null;
  doc_type: string | null;
  school: string | null;
  doc_date: string | null;
};

function extractDatePrefix(query: string): string | null {
  const months: Record<string, string> = {
    january: '01', february: '02', march: '03', april: '04',
    may: '05', june: '06', july: '07', august: '08',
    september: '09', october: '10', november: '11', december: '12',
    jan: '01', feb: '02', mar: '03', apr: '04',
    jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  };
  const lower = query.toLowerCase();
  const match = lower.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\b.*?\b(20\d\d)\b/
  );
  if (match) return `${match[2]}-${months[match[1]]}`;
  const iso = query.match(/\b(20\d\d-\d{2})\b/);
  if (iso) return iso[1];
  return null;
}

export async function findRelevantChunks(
  query: string,
  limit = 10,
  name?: string
): Promise<ChunkResult[]> {
  const db = getDb();
  const queryEmbedding = await generateEmbedding(query);
  const similarity = sql<number>`1 - (${cosineDistance(embeddings.embedding, queryEmbedding)})`;
  const datePrefix = extractDatePrefix(query);

  // Date-targeted lookup: inject chunks from the matching date document directly
  let dateChunks: ChunkResult[] = [];
  if (datePrefix) {
    dateChunks = (await db
      .select({
        filepath: embeddings.filepath,
        chunk: embeddings.chunk,
        similarity: sql<number>`cast(0.95 as float8)`,
        source_url: embeddings.source_url,
        doc_type: embeddings.doc_type,
        school: embeddings.school,
        doc_date: embeddings.doc_date,
      })
      .from(embeddings)
      .where(
        or(
          like(embeddings.filepath, `%${datePrefix}%`),
          like(embeddings.doc_date, `${datePrefix}%`)
        )
      )
      .limit(5)) as ChunkResult[];
  }

  // Name-targeted lookup: inject chunks that mention the person directly
  let nameChunks: ChunkResult[] = [];
  if (name) {
    nameChunks = (await db
      .select({
        filepath: embeddings.filepath,
        chunk: embeddings.chunk,
        similarity: sql<number>`cast(0.92 as float8)`,
        source_url: embeddings.source_url,
        doc_type: embeddings.doc_type,
        school: embeddings.school,
        doc_date: embeddings.doc_date,
      })
      .from(embeddings)
      .where(like(embeddings.chunk, `%${name}%`))
      .limit(5)) as ChunkResult[];
  }

  // Standard vector search
  const vectorResults = (await db
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
    .where(gt(similarity, 0.25))
    .orderBy(desc(similarity))
    .limit(limit)) as ChunkResult[];

  // Merge: date and name chunks first, then vector results, deduplicated
  const seen = new Set<string>();
  const merged: ChunkResult[] = [];
  for (const r of [...dateChunks, ...nameChunks, ...vectorResults]) {
    const key = `${r.filepath}::${r.chunk.slice(0, 80)}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(r);
    }
  }
  return merged.slice(0, limit);
}
