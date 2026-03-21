import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { findRelevantChunks } from '@/lib/search';

export const maxDuration = 30;

function formatSource(filepath: string): string {
  const filename = filepath.split('/').pop() || filepath;
  
  // Transcript files
  const transcriptMatch = filename.match(/transcript_(\d{4}-\d{2}-\d{2})_([^_]+)/);
  if (transcriptMatch) {
    const date = transcriptMatch[1];
    const videoId = transcriptMatch[2].replace('_part1', '').replace('_part2', '');
    return `RSU5 Board Meeting Transcript – ${date} (https://youtube.com/watch?v=${videoId})`;
  }

  // March 18 2026 transcript
  if (filename.includes('RSU5_Meeting_3_18_26')) {
    return 'RSU5 Board Meeting Transcript – 2026-03-18';
  }

  // Chunk files from compiled docs
  if (filename.startsWith('rsu5_chunk')) {
    return 'RSU5 District Documents';
  }

  return filename.replace(/_/g, ' ').replace('.txt', '');
}

export async function POST(req: Request) {
  const { messages } = await req.json();
  const lastUserMessage = [...messages]
    .reverse()
    .find((m: { role: string }) => m.role === 'user')?.content ?? '';

  const relevantChunks = await findRelevantChunks(lastUserMessage, 8);

  const context = relevantChunks.length > 0
    ? relevantChunks
        .map((c) => `[Source: ${formatSource(c.filepath)}]\n${c.chunk}`)
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
```

For the white text in the input box — that's a CSS issue in `page.tsx`. In the input element, add `text-gray-900` to the className. Here's the input line to find and replace:

Find:
```
className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B1A1A] focus:border-transparent"
```

Replace with:
```
className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#8B1A1A] focus:border-transparent"
