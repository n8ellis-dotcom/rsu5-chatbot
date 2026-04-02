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
  chunk_index: number | null;
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

function extractBudgetYear(query: string): string | null {
  const q = query.toLowerCase();
  if (!q.includes('budget') && !q.includes('fiscal') && !q.includes('fy') && !q.includes('spending')) return null;
  const fyMatch = q.match(/\bfy\s?(\d{2})\b/);
  if (fyMatch) return `fy${fyMatch[1]}`;
  const yearMatch = q.match(/\b(20\d{2})[-–/](20\d{2})\b/);
  if (yearMatch) {
    const y = parseInt(yearMatch[2]) % 100;
    return `fy${y.toString().padStart(2, '0')}`;
  }
  const singleYear = q.match(/\b(20\d{2})\b/);
  if (singleYear) {
    const y = parseInt(singleYear[1]) % 100;
    return `fy${y.toString().padStart(2, '0')}`;
  }
  return null;
}

function prefersBoardMeeting(query: string): boolean {
  const q = query.toLowerCase();
  return ['meeting', 'vote', 'voted', 'board', 'transcript', 'motion', 'approved', 'agenda', 'minutes'].some(w => q.includes(w));
}

function prefersPolicy(query: string): boolean {
  const q = query.toLowerCase();
  return ['policy', 'policies', 'procedure', 'handbook', 'rule', 'rules', 'code of conduct',
    'dress code', 'attendance', 'absence', 'truancy', 'discipline', 'acceptable use'].some(w => q.includes(w));
}

function isBudgetNarrative(query: string): boolean {
  const q = query.toLowerCase();
  return (q.includes('budget') || q.includes('fiscal') || q.includes('fy') || q.includes('spending'))
    && (q.includes('why') || q.includes('reason') || q.includes('increase') || q.includes('decrease')
      || q.includes('change') || q.includes('what') || q.includes('how much') || q.includes('total'));
}

// Keyword reranker — scores chunks by query term overlap
// Use this pattern in any RAG app: after retrieval, score each chunk for
// keyword relevance and blend with vector similarity for better ranking
function rerankChunks(chunks: ChunkResult[], query: string): ChunkResult[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'what', 'when', 'where', 'who', 'how', 'why',
    'this', 'that', 'these', 'those', 'it', 'its', 'about', 'rsu5', 'rsu',
    'school', 'district', 'me', 'tell', 'know', 'can', 'you', 'i',
  ]);
  const queryTerms = query.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !stopWords.has(t));

  if (queryTerms.length === 0) return chunks;

  const scored = chunks.map(chunk => {
    const text = chunk.chunk.toLowerCase();
    let keywordScore = 0;
    for (const term of queryTerms) {
      const count = (text.match(new RegExp(term, 'g')) || []).length;
      keywordScore += count > 0 ? 1 + Math.log(count) : 0;
    }
    if (text.includes(queryTerms.join(' '))) keywordScore += 3;
    const normalizedKeyword = keywordScore / Math.sqrt(text.length / 200);
    // Blend: 60% vector similarity, 40% keyword score
    const blended = (chunk.similarity * 0.6) + (normalizedKeyword * 0.4);
    return { chunk, score: blended };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map(s => s.chunk);
}

function rowToChunk(r: Record<string, unknown>, defaultSimilarity = 0.85): ChunkResult {
  return {
    filepath: r.filepath as string,
    chunk: r.chunk as string,
    similarity: r.similarity != null ? Number(r.similarity) : defaultSimilarity,
    source_url: r.source_url as string | null,
    doc_type: r.doc_type as string | null,
    school: r.school as string | null,
    doc_date: r.doc_date as string | null,
    chunk_index: r.chunk_index != null ? Number(r.chunk_index) : null,
  };
}

export async function findRelevantChunks(
  query: string,
  limit = 10,
  name?: string
): Promise<ChunkResult[]> {
  const db = getDb();
  const queryEmbedding = await generateEmbedding(query);
  const similarityExpr = sql<number>`1 - (${cosineDistance(embeddings.embedding, queryEmbedding)})`;

  const datePrefix = extractDatePrefix(query);
  const budgetYear = extractBudgetYear(query);
  const wantsBoardMeeting = prefersBoardMeeting(query);
  const wantsPolicy = prefersPolicy(query);
  const wantsBudgetNarrative = isBudgetNarrative(query);

  const isBudgetHistoryQuery = !budgetYear &&
    (query.toLowerCase().includes('budget') || query.toLowerCase().includes('fiscal')) &&
    ['year', 'history', 'changed', 'over', 'trend', 'past', 'years'].some(w => query.toLowerCase().includes(w));

  // ── PARALLEL STRATEGY EXECUTION ───────────────────────────────────────────
  // All independent search strategies fire simultaneously via Promise.all.
  // This is the key performance pattern: don't await each query sequentially —
  // fire them all at once and collect results together.
  // Rule: only parallelize queries that don't need each other's output to run.
  // The neighbor fetch below stays sequential because it needs topCandidates first.

  const [
    vectorRows,
    budgetBrochureRows,
    budgetLineItemRows,
    budgetHistoryRows,
    dateRows,
    policyRows,
    nameRows,
  ] = await Promise.all([

    // Strategy A: Vector search — semantic similarity, always runs
    db.select({
      filepath: embeddings.filepath,
      chunk: embeddings.chunk,
      similarity: similarityExpr,
      source_url: embeddings.source_url,
      doc_type: embeddings.doc_type,
      school: embeddings.school,
      doc_date: embeddings.doc_date,
      chunk_index: embeddings.chunk_index,
    })
    .from(embeddings)
    .where(and(
      gt(similarityExpr, 0.20),
      sql`${embeddings.chunk} NOT LIKE 'SUMMARY CHUNK%'`
    ))
    .orderBy(desc(similarityExpr))
    .limit(15),

    // Strategy B: Budget brochure — narrative docs for "why" questions
    budgetYear
      ? db.execute(sql`
          SELECT filepath, chunk, 0.92::float8 as similarity, source_url, doc_type, school, doc_date, chunk_index
          FROM embeddings
          WHERE filepath LIKE ${'%' + budgetYear + '_board_adopted_brochure%'}
            AND chunk NOT LIKE 'SUMMARY CHUNK%'
          ORDER BY chunk_index ASC NULLS LAST
          LIMIT 20`)
      : Promise.resolve({ rows: [] }),

    // Strategy C: Budget line-item — detailed numbers, non-narrative queries
    budgetYear && !wantsBudgetNarrative
      ? db.execute(sql`
          SELECT filepath, chunk, 0.88::float8 as similarity, source_url, doc_type, school, doc_date, chunk_index
          FROM embeddings
          WHERE filepath LIKE ${'%' + budgetYear + '_board_adopted%'}
            AND filepath NOT LIKE '%brochure%'
            AND chunk NOT LIKE 'SUMMARY CHUNK%'
          ORDER BY chunk_index ASC NULLS LAST
          LIMIT 10`)
      : Promise.resolve({ rows: [] }),

    // Strategy D: Budget history — multi-year brochures
    isBudgetHistoryQuery
      ? db.execute(sql`
          SELECT filepath, chunk, 0.90::float8 as similarity, source_url, doc_type, school, doc_date, chunk_index
          FROM embeddings
          WHERE (
            filepath LIKE '%fy26_board_adopted_brochure%' OR
            filepath LIKE '%fy25_board_adopted_brochure%' OR
            filepath LIKE '%fy24_board_adopted_brochure%' OR
            filepath LIKE '%fy23_board_adopted_brochure%' OR
            filepath LIKE '%fy22_board_adopted_brochure%'
          )
          AND chunk NOT LIKE 'SUMMARY CHUNK%'
          ORDER BY filepath DESC, chunk_index ASC NULLS LAST
          LIMIT 40`)
      : Promise.resolve({ rows: [] }),

    // Strategy E: Date lookup — transcripts and minutes by date
    datePrefix
      ? db.execute(sql`
          SELECT filepath, chunk, 0.88::float8 as similarity, source_url, doc_type, school, doc_date, chunk_index
          FROM embeddings
          WHERE (filepath LIKE ${'%' + datePrefix + '%'} OR doc_date LIKE ${datePrefix + '%'})
            AND chunk NOT LIKE 'SUMMARY CHUNK%'
            ${wantsBoardMeeting ? sql`AND doc_type = 'board_meeting_transcript'` : sql``}
          ORDER BY chunk_index ASC NULLS LAST
          LIMIT 20`)
      : Promise.resolve({ rows: [] }),

    // Strategy F: Policy lookup — filtered by doc_type
    wantsPolicy
      ? db.execute(sql`
          SELECT filepath, chunk, 0.85::float8 as similarity, source_url, doc_type, school, doc_date, chunk_index
          FROM embeddings
          WHERE doc_type IN ('policy', 'handbook')
            AND chunk NOT LIKE 'SUMMARY CHUNK%'
          ORDER BY (1 - (embedding <=> ${sql.raw(`'[${queryEmbedding.join(',')}]'`)})) DESC
          LIMIT 15`)
      : Promise.resolve({ rows: [] }),

    // Strategy G: Name lookup — keyword search on chunk text
    name
      ? db.execute(sql`
          SELECT filepath, chunk, 0.88::float8 as similarity, source_url, doc_type, school, doc_date, chunk_index
          FROM embeddings
          WHERE chunk ILIKE ${'%' + name + '%'}
            AND chunk NOT LIKE 'SUMMARY CHUNK%'
          ORDER BY chunk_index ASC NULLS LAST
          LIMIT 20`)
      : Promise.resolve({ rows: [] }),
  ]);

  // ── MERGE ALL RESULTS ─────────────────────────────────────────────────────
  const seen = new Set<string>();
  const candidates: ChunkResult[] = [];

  function addChunk(c: ChunkResult) {
    const key = `${c.filepath}::${c.chunk_index ?? c.chunk.slice(0, 60)}`;
    if (!seen.has(key) && c.chunk && !c.chunk.startsWith('SUMMARY CHUNK')) {
      seen.add(key);
      candidates.push(c);
    }
  }

  for (const r of vectorRows) addChunk({ ...r, similarity: Number(r.similarity) });
  for (const r of (budgetBrochureRows as any).rows) addChunk(rowToChunk(r, 0.92));
  for (const r of (budgetLineItemRows as any).rows) addChunk(rowToChunk(r, 0.88));
  for (const r of (budgetHistoryRows as any).rows) addChunk(rowToChunk(r, 0.90));
  for (const r of (dateRows as any).rows) addChunk(rowToChunk(r, 0.88));
  for (const r of (policyRows as any).rows) addChunk(rowToChunk(r, 0.85));
  for (const r of (nameRows as any).rows) addChunk(rowToChunk(r, 0.88));

  if (candidates.length === 0) return [];

  // ── NEIGHBOR FETCH (sequential — needs top candidates first) ──────────────
  // For each top candidate chunk, fetch the 2 chunks before and after it
  // so Claude has surrounding context without loading entire documents.
  // This stays sequential because it depends on the candidates result above.
  const topForNeighbors = [...candidates]
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 8)
    .filter(c => c.chunk_index != null);

  // Fire neighbor fetches in parallel too — they're independent of each other
  const neighborResults = await Promise.all(
    topForNeighbors.map(c =>
      db.execute(sql`
        SELECT filepath, chunk, 0.80::float8 as similarity, source_url, doc_type, school, doc_date, chunk_index
        FROM embeddings
        WHERE filepath = ${c.filepath}
          AND chunk_index BETWEEN ${(c.chunk_index ?? 0) - 2} AND ${(c.chunk_index ?? 0) + 2}
          AND chunk NOT LIKE 'SUMMARY CHUNK%'
        ORDER BY chunk_index ASC`)
    )
  );

  for (const result of neighborResults) {
    for (const r of (result as any).rows) addChunk(rowToChunk(r, 0.80));
  }

  // ── RERANK AND RETURN ─────────────────────────────────────────────────────
  const reranked = rerankChunks(candidates, query);
  return reranked.slice(0, isBudgetHistoryQuery ? 40 : limit);
}
