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
  if (DEEPER_INDICATORS.some(p => q.includes(p))) return 'claude-sonnet-4-5';
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
  const fullName = query.match(/\b([A-Z][a-z]+)\s+([A-Z][a-z]+)\b/);
  if (fullName) return fullName[0];
  const skipWords = ['RSU5','Maine','Freeport','Durham','Pownal','Monday','Tuesday',
    'Wednesday','Thursday','Friday','January','February','March','April','May','June',
    'July','August','September','October','November','December'];
  const singleName = query.match(/\b([A-Z][a-z]{2,})\b/g);
  if (singleName) {
    const name = singleName.find(n => !skipWords.includes(n));
    if (name) return name;
  }
  return null;
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

  const model = selectModel(actualQuery);
  const chunkLimit = model === 'claude-sonnet-4-5' ? 6 : 5;

  const relevantChunks = await findRelevantChunks(actualQuery, chunkLimit);

  const allChunks = [...relevantChunks];

  const context = allChunks.length > 0
    ? allChunks.map((c) => {
        const meta = [
          c.doc_type ? `TYPE: ${c.doc_type}` : '',
          c.doc_date ? `DATE: ${c.doc_date}` : '',
          c.school   ? `SCHOOL: ${c.school}` : '',
        ].filter(Boolean).join(' | ');
        return `[Source: ${formatSource(c.filepath, c.source_url, c.chunk)}${meta ? ` | ${meta}` : ''}]\n${c.chunk}`;
      }).join('\n\n---\n\n')
    : 'No relevant documents found.';

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const systemPrompt = `You are the RSU5 Community Information Assistant — a neutral, factual resource for the Regional School Unit 5 community in Freeport, Durham, and Pownal, Maine.
You answer questions about RSU5 board meetings, budgets, policies, school calendars, and district decisions using only the official RSU5 documents provided below.

KNOWN RSU5 FACTS (always accurate, do not contradict):
- Superintendent: Tom Gray (grayt@rsu5.org)
- District: Regional School Unit 5, serving Freeport, Durham, and Pownal, Maine

Guidelines:
- Be accurate and cite your sources by mentioning the document or meeting date
- Always include the source link from the context when citing a source — format it as a clickable markdown link
- The source links already include timestamps where available — use them exactly as provided
- NEVER invent or guess names, titles, or contact information — if you cannot find it in the context, say so explicitly
- When answering questions about budgets, positions, salaries, or current policies, always prefer the most recent documents (highest DATE values). If citing older data, note the year explicitly
- When multiple chunks share the same source file, treat them as parts of the same document and synthesize them into a complete answer rather than treating each separately
- When someone pushes back on your answer or asks to go deeper, look for additional context across all provided chunks from the same source before saying you do not have enough information
- Do not second-guess a correct answer simply because someone challenges it — if your sources support the answer, stand by it and cite them
- Be neutral and factual — do not take positions on policy debates
- If the answer is not in the provided context, say so clearly rather than guessing
- Keep answers concise but complete
- When presenting numerical data with multiple columns, always use a markdown table
- Format lists and key figures clearly

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
    const debugInfo = `\n\n---\n**🔧 Admin Debug Info**\n\n**Model used:** ${model}\n**Query:** ${actualQuery}\n**Detected name:** ${detectedName || 'none'}\n**Chunks found:** ${allChunks.length}\n\n${allChunks.map((c, i) => `**${i + 1}.** Score: \`${(c.similarity as number).toFixed(3)}\` | Type: ${c.doc_type || '?'} | Date: ${c.doc_date || '?'} | School: ${c.school || 'none'}\n> Source: ${formatSource(c.filepath, c.source_url, c.chunk)}\n> ${c.chunk.slice(0, 150)}...`).join('\n\n')}`;
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
