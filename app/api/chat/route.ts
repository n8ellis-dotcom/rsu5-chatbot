import Anthropic from '@anthropic-ai/sdk';
import { findRelevantChunks } from '@/lib/search';

export const maxDuration = 30;

const ADMIN_PASSWORD = 'rsu5admin2026';

function formatSource(filepath: string): string {
  const filename = filepath.split('/').pop() || filepath;
  const transcriptMatch = filename.match(/transcript_(\d{4}-\d{2}-\d{2})_([^_]+)/);
  if (transcriptMatch) {
    const date = transcriptMatch[1];
    const videoId = transcriptMatch[2].replace('_part1', '').replace('_part2', '').replace('.txt', '');
    return `RSU5 Board Meeting Transcript – ${date} (https://youtube.com/watch?v=${videoId})`;
  }
  if (filename.includes('RSU5_Meeting_3_18_26')) return 'RSU5 Board Meeting Transcript – 2026-03-18';
  if (filename.startsWith('rsu5_chunk')) return 'RSU5 District Documents';
  return filename.replace(/_/g, ' ').replace('.txt', '');
}

export async function POST(req: Request) {
  const { messages } = await req.json();
  const lastUserMessage = [...messages].reverse().find((m: { role: string }) => m.role === 'user')?.content ?? '';

  // Check for admin mode
  const adminMatch = lastUserMessage.match(/^admin:\s*(.+)$/i);
  const isAdmin = adminMatch !== null;
  const actualQuery = isAdmin ? adminMatch[1] : lastUserMessage;

  const relevantChunks = await findRelevantChunks(actualQuery, 8);

  const context = relevantChunks.length > 0
    ? relevantChunks.map((c) => `[Source: ${formatSource(c.filepath)}]\n${c.chunk}`).join('\n\n---\n\n')
    : 'No relevant documents found.';

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const systemPrompt = `You are the RSU5 Community Information Assistant — a neutral, factual resource for the Regional School Unit 5 community in Freeport, Durham, and Pownal, Maine.
You answer questions about RSU5 board meetings, budgets, policies, school calendars, and district decisions using only the official RSU5 documents provided below.
Guidelines:
- Be accurate and cite your sources by mentioning the document or meeting date
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

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1024,
    system: systemPrompt,
    messages: anthropicMessages,
  });

  const answerText = response.content
    .filter((block) => block.type === 'text') 
    .map((block) => block.text)
    .join('');

  if (isAdmin) {
    const debugInfo = `\n\n---\n**🔧 Admin Debug Info**\n\n**Query:** ${actualQuery}\n\n**Chunks found:** ${relevantChunks.length}\n\n${relevantChunks.map((c, i) => `**${i + 1}.** Score: \`${c.similarity.toFixed(3)}\` | Source: ${formatSource(c.filepath)}\n> ${c.chunk.slice(0, 150)}...`).join('\n\n')}`;
    return new Response(answerText + debugInfo, {
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  return new Response(answerText, {
    headers: { 'Content-Type': 'text/plain' },
  });
}
