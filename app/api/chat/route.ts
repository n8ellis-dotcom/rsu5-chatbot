import Anthropic from '@anthropic-ai/sdk';
import { findRelevantChunks } from '@/lib/search';

export const maxDuration = 60;

const DEEPER_INDICATORS = [
  'tell me more', 'elaborate', 'explain more', 'dig deeper', 'more detail',
  'expand on', 'can you explain', 'what do you mean', 'go deeper',
  'more about', 'further', 'in depth', 'deeper dive', 'try harder',
  'more thorough', 'be more specific', 'give me more', 'not enough',
  'too vague', 'more complete', 'full answer', 'complete answer',
  'more comprehensive', 'flesh out', 'more context', 'more information'
];

function selectModel(query: string): string {
  const q = query.toLowerCase();
  if (DEEPER_INDICATORS.some(p => q.includes(p))) return 'claude-sonnet-4-6';
  return 'claude-haiku-4-5-20251001';
}

function extractTimestamp(chunk: string): number | null {
  const match = chunk.match(/\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/);
  if (!match) return null;
  const h = match[3] ? parseInt(match[1]) : 0;
  const m = match[3] ? parseInt(match[2]) : parseInt(match[1]);
  const s = match[3] ? parseInt(match[3]) : parseInt(match[2]);
  return match[3] ? h * 3600 + m * 60 + s : m * 60 + s;
}

function formatTime(seconds: number | null): string {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatSource(filepath: string, sourceUrl?: string | null, chunk?: string): string {
  const filename = filepath.split('/').pop() || filepath;
  const transcriptMatch = filename.match(/transcript_(\d{4}-\d{2}-\d{2})_([^_]+)/);
  if (transcriptMatch) {
    const date = transcriptMatch[1];
    const videoId = transcriptMatch[2].replace('_part1', '').replace('_part2', '').replace('.txt', '');
    const baseUrl = sourceUrl || `https://youtube.com/watch?v=${videoId}`;
    const seconds = chunk ? extractTimestamp(chunk) : null;
    const url = seconds ? `${baseUrl}&t=${seconds}` : baseUrl;
    const timeLabel = seconds ? ` ~${formatTime(seconds)}` : '';
    return `RSU5 Board Meeting Transcript – ${date} ([Watch video${timeLabel}](${url}))`;
  }
  const boardMatch = filename.match(/(\d{4}-\d{2}-\d{2})_RSU5_Board_Meeting/);
  if (boardMatch) {
    const date = boardMatch[1];
    const baseUrl = sourceUrl || `https://www.youtube.com/@rsu5livestream524`;
    const seconds = chunk ? extractTimestamp(chunk) : null;
    const url = seconds ? `${baseUrl}&t=${seconds}` : baseUrl;
    const timeLabel = seconds ? ` ~${formatTime(seconds)}` : '';
    return `RSU5 Board Meeting Transcript – ${date} ([Watch video${timeLabel}](${url}))`;
  }
  if (filename.includes('RSU5_Meeting_3_18_26')) {
    const seconds = chunk ? extractTimestamp(chunk) : null;
    const baseUrl = `https://youtube.com/watch?v=5vc4AdOr5oM`;
    const url = seconds ? `${baseUrl}&t=${seconds}` : baseUrl;
    const timeLabel = seconds ? ` ~${formatTime(seconds)}` : '';
    return `RSU5 Board Meeting Transcript – 2026-03-18 ([Watch video${timeLabel}](${url}))`;
  }
  if (sourceUrl) {
    return `${filename.replace(/_/g, ' ').replace('.txt', '')} ([Source](${sourceUrl}))`;
  }
  return filename.replace(/_/g, ' ').replace('.txt', '');
}

function extractNameFromQuery(query: string): string | null {
  const skipWords = [
    'What', 'When', 'Where', 'Which', 'Who', 'Why', 'How', 'Does', 'Did',
    'Can', 'Could', 'Would', 'Should', 'Has', 'Have', 'Had', 'Are', 'Was',
    'Were', 'Will', 'The', 'This', 'That', 'These', 'Those',
    'RSU5', 'Maine', 'Freeport', 'Durham', 'Pownal', 'Monday', 'Tuesday',
    'Wednesday', 'Thursday', 'Friday', 'January', 'February', 'March', 'April',
    'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const fullName = query.match(/\b([A-Z][a-z]+)\s+([A-Z][a-z]+)\b/);
  if (fullName && !skipWords.includes(fullName[1]) && !skipWords.includes(fullName[2])) {
    return fullName[0];
  }
  return null;
}

// Rewrites the user's question into an optimized search query.
// This significantly improves vector retrieval for conversational or vague questions.
async function rewriteQuery(client: Anthropic, query: string): Promise<string> {
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      system: `You are a search query optimizer for RSU5 school district documents in Freeport, Maine.
Rewrite the user's question as a concise, keyword-rich search query that will best match relevant document chunks.
Rules:
- Output ONLY the rewritten query — no explanation, no punctuation at the end
- Expand abbreviations (FY = fiscal year, FHS = Freeport High School, FMS = Freeport Middle School)
- Map fiscal years correctly: RSU5 fiscal year runs July–June. FY21 = school year 2020-2021. "2020 budget" likely means FY21 or FY20.
- Keep names, dates, and dollar amounts exactly as given
- For policy questions, include "policy", "procedure", or "handbook" as appropriate
- For meeting questions, include "board meeting" and the date if given
- Maximum 15 words`,
      messages: [{ role: 'user', content: query }],
    });
    const rewritten = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim();
    return rewritten || query;
  } catch {
    return query; // Fall back to original query on any error
  }
}

export async function POST(req: Request) {
  const { messages } = await req.json();
  const lastUserMessage = [...messages].reverse().find((m: { role: string }) => m.role === 'user')?.content ?? '';

  const adminMatch = lastUserMessage.match(/^admin:\s*(.+)$/i);
  const isAdmin = adminMatch !== null;
  const actualQuery = isAdmin ? adminMatch[1] : lastUserMessage;

  if (actualQuery === 'ping') {
    await findRelevantChunks('RSU5', 1);
    return new Response('ok', { headers: { 'Content-Type': 'text/plain' } });
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = selectModel(actualQuery);
  const detectedName = extractNameFromQuery(actualQuery);

  // Rewrite query for better retrieval, then search
  const searchQuery = await rewriteQuery(client, actualQuery);
  const chunkLimit = 40;
  const relevantChunks = await findRelevantChunks(searchQuery, chunkLimit, detectedName ?? undefined);

  const context = relevantChunks.length > 0
    ? relevantChunks.map((c) => {
        const meta = [
          c.doc_type ? `TYPE: ${c.doc_type}` : '',
          c.doc_date ? `DATE: ${c.doc_date}` : '',
          c.school   ? `SCHOOL: ${c.school}` : '',
        ].filter(Boolean).join(' | ');
        return `[Source: ${formatSource(c.filepath, c.source_url, c.chunk)}${meta ? ` | ${meta}` : ''}]\n${c.chunk}`;
      }).join('\n\n---\n\n')
    : 'No relevant documents found.';

  const systemPrompt = `You are the RSU5 Community Information Assistant — a neutral, factual resource for Regional School Unit 5 in Freeport, Durham, and Pownal, Maine.

DISTRICT FACTS (always accurate — never contradict these):
- Superintendent: Tom Gray (grayt@rsu5.org)
- District serves: Freeport, Durham, and Pownal, Maine
- Schools: Freeport High School (FHS, grades 9–12), Freeport Middle School (FMS, grades 6–8), Mast Landing School (MLS, K–5 Freeport), Morse Street School (MSS, K–5 Freeport), Durham Community School (DCS, K–8 Durham), Pownal Elementary School (PES, K–5 Pownal)
- RSU5 fiscal year runs July 1 – June 30. FY26 = July 2025–June 2026. FY25 = July 2024–June 2025. FY21 = July 2020–June 2021. When someone asks about "the 2025 budget" they likely mean FY25 or FY26 — check context and clarify if ambiguous.
- Board meetings are typically held on the second and fourth Wednesday of each month

KNOWN DATA GAPS (do not guess or fabricate answers for these):
- Dress codes and student handbooks: may not be in documents — if not found, say so and direct to rsu5.org
- Bell schedules: FHS bell schedule not published online; others may be available
- Bus routes: route details not fully captured
- Superintendent salary: not publicly listed
- Teacher assignments: not available

RESPONSE RULES:
- Answer using ONLY the documents provided in CONTEXT below
- Always cite your source by mentioning the document name or meeting date
- Include the source link when available — format as a clickable markdown link
- Never invent names, titles, phone numbers, or contact information
- When answering about budgets, positions, or policies, prefer the most recent document (highest DATE value) and note the year explicitly
- When multiple chunks are from the same source, synthesize them into one cohesive answer
- If pushed back on a correct answer, stand by it and cite the source
- Be neutral — do not take positions on policy debates or budget decisions
- If the answer is not in the context: say so in one clear sentence, then suggest visiting rsu5.org — do not pad with generic lists of phone numbers or department contacts
- Keep answers concise but complete
- Use markdown tables for multi-column numerical data
- Never say "the documents provided to me" — just say "my documents" or "the available records"

CONTEXT FROM RSU5 DOCUMENTS:
${context}`;

  const anthropicMessages = messages.map((m: { role: string; content: string }) => ({
    role: m.role as 'user' | 'assistant',
    content: m.role === 'user' && adminMatch ? actualQuery : m.content,
  }));

  if (isAdmin) {
    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: anthropicMessages,
    });
    const answerText = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('');
    const debugInfo = `\n\n---\n**🔧 Admin Debug Info**\n\n**Model used:** ${model}\n**Original query:** ${actualQuery}\n**Search query (rewritten):** ${searchQuery}\n**Detected name:** ${detectedName || 'none'}\n**Chunks found:** ${relevantChunks.length}\n\n${relevantChunks.map((c, i) => `**${i + 1}.** > Score: \`${Number(c.similarity).toFixed(3)}\` | Type: ${c.doc_type || '?'} | Date: ${c.doc_date || '?'} | School: ${c.school || 'none'}\n> Source: ${formatSource(c.filepath, c.source_url, c.chunk)}\n> ${c.chunk.slice(0, 150)}...`).join('\n\n')}`;
    return new Response(answerText + debugInfo, { headers: { 'Content-Type': 'text/plain' } });
  }

  const stream = await client.messages.stream({
    model,
    max_tokens: 1024,
    system: systemPrompt,
    messages: anthropicMessages,
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          controller.enqueue(encoder.encode(chunk.delta.text));
        }
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
