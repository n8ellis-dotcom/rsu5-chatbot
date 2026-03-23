import { cosineDistance, desc, gt, sql, or, like, and, eq } from 'drizzle-orm';
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

function prefersBoardMeeting(query: string): boolean {
  const q = query.toLowerCase();
  return ['meeting', 'vote', 'voted', 'board', 'transcript', 'motion', 'approved', 'agenda'].some(w => q.includes(w));
}

async function getFullDocument(db: ReturnType<typeof getDb>, filepath: string): Promise<ChunkResult[]> {
  const filename = filepath.split('/').pop() || filepath;
  const rows = await db.execute(
    sql`SELECT filepath, chunk, cast(0.95 as float8) as similarity, source_url, doc_type, school, doc_date
        FROM embeddings
        WHERE filepath LIKE ${'%' + filename + '%'}
        ORDER BY chunk_index ASC NULLS LAST`
  );
  return rows.rows.map((r: Record<string, unknown>) => ({
    filepath: r.filepath as string,
    chunk: r.chunk as string,
    similarity: Number(r.similarity),
    source_url: r.source_url as string | null,
    doc_type: r.doc_type as string | null,
    school: r.school as string | null,
    doc_date: r.doc_date as string | null,
  }));
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
  const wantsBoardMeeting = prefersBoardMeeting(query);

  // ── Stage 1: Identify relevant files ────────────────────────────────────────

  let dateFilepaths: string[] = [];
  if (datePrefix) {
    // If query is about a board meeting, try transcript doc_type first
    if (wantsBoardMeeting) {
      const transcriptHits = await db
        .select({ filepath: embeddings.filepath })
        .from(embeddings)
        .where(
          and(
            or(
              like(embeddings.filepath, `%${datePrefix}%`),
              like(embeddings.doc_date, `${datePrefix}%`)
            ),
            eq(embeddings.doc_type, 'board_meeting_transcript')
          )
        )
        .limit(5);
      dateFilepaths = [...new Set(transcriptHits.map(r => r.filepath))];
    }
    // Fall back to any doc type if no transcripts found
    if (dateFilepaths.length === 0) {
      const dateHits = await db
        .select({ filepath: embeddings.filepath })
        .from(embeddings)
        .where(
          or(
            like(embeddings.filepath, `%${datePrefix}%`),
            like(embeddings.doc_date, `${datePrefix}%`)
          )
        )
        .limit(5);
      dateFilepaths = [...new Set(dateHits.map(r => r.filepath))];
    }
  }

  let nameFilepaths: string[] = [];
  if (name) {
    const nameHits = await db
      .select({ filepath: embeddings.filepath })
      .from(embeddings)
      .where(like(embeddings.chunk, `%${name}%`))
      .limit(20);
    nameFilepaths = [...new Set(nameHits.map(r => r.filepath))].slice(0, 3);
  }

  const vectorHits = await db
    .select({
      filepath: embeddings.filepath,
      similarity,
    })
    .from(embeddings)
    .where(gt(similarity, 0.25))
    .orderBy(desc(similarity))
    .limit(20);
  const vectorFilepaths = [...new Set(vectorHits.map(r => r.filepath))].slice(0, 3);

  // ── Stage 2: Fetch full documents ────────────────────────────────────────────

  // Date-matched transcripts get priority slots, then vector results fill the rest
  const priorityFilepaths = [...dateFilepaths, ...nameFilepaths, ...vectorFilepaths];
  const uniqueFilepaths = [...new Set(priorityFilepaths)].slice(0, 4);

  const allChunks: ChunkResult[] = [];
  for (const fp of uniqueFilepaths) {
    const docChunks = await getFullDocument(db, fp);
    allChunks.push(...docChunks);
  }

  // Deduplicate
  const seen = new Set<string>();
  const merged: ChunkResult[] = [];
  for (const r of allChunks) {
    const key = `${r.filepath}::${r.chunk.slice(0, 80)}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(r);
    }
  }

  return merged.slice(0, limit);
}
