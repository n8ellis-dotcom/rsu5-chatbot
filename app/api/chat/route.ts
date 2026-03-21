import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { findRelevantChunks } from '@/lib/search';

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();
  const lastUserMessage = [...messages]
    .reverse()
    .find((m: { role: string }) => m.role === 'user')?.content ?? '';

  const relevantChunks = await findRelevantChunks(lastUserMessage, 8);

  const context = relevantChunks.length > 0
    ? relevantChunks
        .map((c) => `[Source: ${c.filepath}]\n${c.chunk}`)
        .join('\n\n---\n\n')
    : 'No relevant documents found.';

  const result = streamText({
    model: openai('gpt-4o-mini'),
    system: `You are the RSU5 Community Information Assistant — a neutral, factual resource for the Regional School Unit 5 community in Freeport, Durham, and Pownal, Maine.
You answer questions about RSU5 board meetings, budgets, policies, school calendars, and district decisions using only the official RSU5 documents provided below.
Guidelines:
- Be accurate and cite your sources by mentioning the document or meeting date
- Be neutral and factual — do not take positions on policy debates
- If the answer isn't in the provided context, say so clearly rather than guessing
- Keep answers concise but complete
- Format lists and key figures clearly
CONTEXT FROM RSU5 DOCUMENTS:
${context}`,
    messages,
  });

  return result.toTextStreamResponse();
}
