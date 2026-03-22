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
  const wantsDeeperDive = DEEPER_INDICATORS.some(phrase =>
    query.toLowerCase().includes(phrase)
  );
  return wantsDeeperDive ? 'claude-sonnet-4-5' : 'claude-haiku-4-5-20251001';
}

function formatSource(filepath: string, sourceUrl?: string | null): string {
  const filename = filepath.split('/').pop() || filepath;
  const transcriptMatch = filename.match(/transcript_(\d{4}-\d{2}-\d{2})_([^_]+)/);
  if (transcriptMatch) {
    const date = transcriptMatch[1];
    const videoId = transcriptMatch[2].replace('_part1', '').replace('_part2', '').replace('.txt', '');
    const ytUrl = sourceUrl || `https://youtube.com/watch?v=${videoId}`;
    return `RSU5 Board Meeting Transcript – ${date} ([Watch video](${ytUrl}))`;
  }
  const boardMatch = filename.match(/(\d{4}-\d{2}-\d{2})_RSU5_Board_Meeting/);
  if (boardMatch) {
    const date = boardMatch[1];
    const url = sourceUrl || `https://www.youtube.com/@rsu5livestream524`;
    return `RSU5 Board Meeting Transcript – ${date} ([Watch video](${url}))`;
  }
  if (filename.includes('RSU5_Meeting_3_18_26')) {
    return `RSU5 Board Meeting Transcript – 2026-03-18 ([Watch video](https://youtube.com/watch?v=5vc4AdOr5oM))`;
  }
  if (filename.startsWith('rsu5_chunk')) {
    return sourceUrl ? `RSU5 District Documents ([Source](${sourceUrl}))` : 'RSU5 District Documents';
  }
  if (sourceUrl) {
    return `${filename.replace(/_/g, ' ').replace('.txt', '')} ([Source](${sourceUrl}))`;
  }
  return filename.replace(/_/g, ' ').replace('.txt', '');
}

export async function POST(req: Request) {
  const { messages } = await req.json();
  const lastUserMessage = [...messages].reverse().find((m: { role: string }) => m.role === 'user')?.content ?? '';

  const adminMatch = lastUserMessage.match(/^admin:\s*(.+)$/i);
  const isAdmin = adminMatch !== null;
  const actualQuery = isAdmin ? adminMatch[1] : lastUserMessage;

  const model = selectModel(actualQuery);
  const chunkLimit = model === 'claude-sonnet-4-5' ? 6 : 5;

  const relevantChunks = await findRelevantChunks(actualQuery, chunkLimit);

  const context = relevantChunks.length > 0
    ? relevantChunks.map((c) => `[Source: ${formatSource(c.filepath, c.source_url)}]\n${c.chunk}`).join('\n\n---\n\n')
    : 'No relevant documents found.';

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const systemPrompt = `You are the RSU5 Community Information Assistant — a neutral, factual resource for the Regional School Unit 5 community in Freeport, Durham, and Pownal, Maine.
You answer questions about RSU5 board meetings, budgets, policies, school calendars, and district decisions using only the official RSU5 documents provided below.
Guidelines:
- Be accurate and cite your sources by mentioning the document or meeting date
- Always include the source link from the context when citing a source — format it as a clickable markdown link
- When citing a board meeting transcript, look for a timestamp like [8:24] or [1:12:34] near the relevant content and append it to the YouTube link as ?t=X where X is the time converted to total seconds — for example [8:24] becomes ?t=504 and [1:12:34] becomes ?t=4354 — so viewers can jump directly to that moment
- Be neutral and factual — do not take positions on policy debates
- If the answer isn't in the provided context, say so clearly rather than guessing
- Keep answers concise but complete
- When presenting numerical data with multiple columns, always use a markdown table
- Format lists and key figures clearly
CONTEXT FROM RSU5 DOCUMENTS:
${context}`;

  const anthropicMessages = messages.map((m: { role: string; content: string }) => ({
    role: m.role as 'user' | 'assistant',
    content: m.role === 'user' && adminMatch ? actualQuery : m.content,
  }));

  // Admin mode — no streaming, need full response for debug info
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
    const debugInfo = `\n\n---\n**🔧 Admin Debug Info**\n\n**Model used:** ${model}\n**Query:** ${actualQuery}\n**Chunks found:** ${relevantChunks.length}\n\n${relevantChunks.map((c, i) => `**${i + 1}.** Score: \`${c.similarity.toFixed(3)}\` | Source: ${formatSource(c.filepath, c.source_url)}\n> ${c.chunk.slice(0, 150)}...`).join('\n\n')}`;
    return new Response(answerText + debugInfo, { headers: { 'Content-Type': 'text/plain' } });
  }

  // Public mode — stream the response
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
