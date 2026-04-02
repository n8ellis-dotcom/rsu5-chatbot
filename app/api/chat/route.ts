import Anthropic from '@anthropic-ai/sdk';
import { findRelevantChunks } from '@/lib/search';

export const maxDuration = 60;

// Use Sonnet for any substantive question, Haiku only for truly simple lookups
const SONNET_QUERIES = [
  'why', 'how', 'explain', 'what is', 'what are', 'tell me about',
  'budget', 'vote', 'voted', 'policy', 'increase', 'decrease', 'change',
  'compare', 'difference', 'history', 'trend', 'reason', 'because',
  'superintendent', 'board', 'meeting', 'salary', 'staff', 'hire',
  'special education', 'curriculum', 'enrollment', 'tax', 'mil rate',
];

const DEEPER_INDICATORS = [
  'tell me more', 'elaborate', 'explain more', 'dig deeper', 'more detail',
  'expand on', 'go deeper', 'more about', 'further', 'in depth', 'deeper dive',
  'try harder', 'more thorough', 'be more specific', 'give me more',
  'not enough', 'too vague', 'more complete', 'full answer', 'complete answer',
  'more comprehensive', 'flesh out', 'more context', 'more information',
];

function selectModel(query: string): string {
  const q = query.toLowerCase();
  if (DEEPER_INDICATORS.some(p => q.includes(p))) return 'claude-sonnet-4-6';
  if (SONNET_QUERIES.some(p => q.includes(p))) return 'claude-sonnet-4-6';
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

  // Clean up budget filenames
  if (filename.includes('budget_fy')) {
    const fyMatch = filename.match(/budget_(fy\d+)_?(.+)?\.txt/);
    if (fyMatch) {
      const fy = fyMatch[1].toUpperCase();
      const type = fyMatch[2]
        ? fyMatch[2].replace(/_/g, ' ').replace('board adopted brochure', 'Board Adopted Budget')
            .replace('board adopted', 'Board Adopted Budget (Line Item)')
            .replace('superintendent recommended', 'Superintendent Recommended Budget')
            .replace('citizens adopted', 'Citizens Adopted Budget')
        : 'Budget';
      const link = sourceUrl ? ` ([Source](${sourceUrl}))` : '';
      return `RSU5 ${fy} ${type}${link}`;
    }
  }

  // Clean up policy filenames — show NEPN code if available
  if (sourceUrl && sourceUrl.includes('resource-manager')) {
    const nepnMatch = chunk?.match(/NEPN\/NSBA Code:\s*(\w+)/);
    const titleMatch = chunk?.match(/^([A-Z][A-Z\s&/–-]{5,60})\n/m);
    if (nepnMatch || titleMatch) {
      const label = titleMatch ? titleMatch[1].trim() : `Policy ${nepnMatch![1]}`;
      return `${label} ([Source](${sourceUrl}))`;
    }
    return `RSU5 District Document ([Source](${sourceUrl}))`;
  }

  if (sourceUrl) {
    return `${filename.replace(/_/g, ' ').replace('.txt', '')} ([Source](${sourceUrl}))`;
  }
  return filename.replace(/_/g, ' ').replace('.txt', '');
}

function extractNameFromQuery(query: string): string | null {
  const skipWords = new Set([
    'What', 'When', 'Where', 'Which', 'Who', 'Why', 'How', 'Does', 'Did',
    'Can', 'Could', 'Would', 'Should', 'Has', 'Have', 'Had', 'Are', 'Was',
    'Were', 'Will', 'The', 'This', 'That', 'These', 'Those',
    'RSU5', 'Maine', 'Freeport', 'Durham', 'Pownal', 'Monday', 'Tuesday',
    'Wednesday', 'Thursday', 'Friday', 'January', 'February', 'March', 'April',
    'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December',
  ]);
  const fullName = query.match(/\b([A-Z][a-z]+)\s+([A-Z][a-z]+)\b/);
  if (fullName && !skipWords.has(fullName[1]) && !skipWords.has(fullName[2])) {
    return fullName[0];
  }
  return null;
}

async function rewriteQuery(client: Anthropic, query: string): Promise<string> {
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 80,
      system: `You optimize search queries for RSU5 school district documents in Freeport, Maine.
Rewrite the user's question as a concise keyword-rich search query. Output ONLY the rewritten query.
Rules:
- Expand: FY=fiscal year, FHS=Freeport High School, FMS=Freeport Middle School, DCS=Durham Community School, MLS=Mast Landing School, MSS=Morse Street School, PES=Pownal Elementary School
- RSU5 fiscal year runs July–June. FY26=2025-2026. "this year"=FY26. "last year"=FY25. "2020 budget" could mean FY20 or FY21 — include both.
- For policy/rule questions add: policy procedure handbook
- For meeting questions add: board meeting transcript
- For budget narrative questions add: budget increase decrease reason why
- Keep names and dates exact. Max 12 words.`,
      messages: [{ role: 'user', content: query }],
    });
    return response.content.filter(b => b.type === 'text').map(b => b.text).join('').trim() || query;
  } catch {
    return query;
  }
}

// Current date for fiscal year awareness
function getCurrentFiscalContext(): string {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-12
  const year = now.getFullYear();
  // RSU5 FY runs July-June, so July 2025 = start of FY26
  const fyYear = month >= 7 ? year + 1 : year;
  const fyShort = fyYear % 100;
  return `Today is ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}. The current RSU5 fiscal year is FY${fyShort} (July ${fyYear - 1}–June ${fyYear}). When someone says "this year", "current year", or "this budget" they mean FY${fyShort}.`;
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
  const searchQuery = await rewriteQuery(client, actualQuery);
  const relevantChunks = await findRelevantChunks(searchQuery, 40, detectedName ?? undefined);

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

  const systemPrompt = `You are the RSU5 Community Information Assistant — a free, neutral resource for the Regional School Unit 5 community in Freeport, Durham, and Pownal, Maine.

${getCurrentFiscalContext()}

━━━ DISTRICT FACTS (always accurate) ━━━
- Superintendent: Tom Gray (grayt@rsu5.org)
- District: Regional School Unit 5 — Freeport, Durham, and Pownal, Maine
- Schools: Freeport High School (FHS, 9–12), Freeport Middle School (FMS, 6–8), Mast Landing School (MLS, K–5 Freeport), Morse Street School (MSS, K–5 Freeport), Durham Community School (DCS, PreK–8 Durham), Pownal Elementary School (PES, K–5 Pownal)
- Board meetings: typically second and fourth Wednesday of each month
- RSU5 fiscal year: July 1 – June 30. FY26 = July 2025–June 2026.

━━━ DOCUMENT KNOWLEDGE MAP ━━━
Use this to understand what sources exist and where answers live:

BUDGET:
- FY22–FY26 Board Adopted Brochures: best source for budget totals, reasons for increases, school updates, enrollment, staffing changes. Written for the public.
- FY26 Board Adopted (line-item): detailed expenditures by function/cost center. Use for "how much does RSU5 spend on X".
- FY26 Citizens Adopted Budget: community-facing summary post-vote
- FY26 Superintendent Recommended: superintendent's rationale and proposed budget (January 2025)
- FY27 Superintendent Proposed: preliminary FY27 budget (January 2026)
- Budget history: FY22 total ~$36.5M, FY23 ~$38M (+4.22%), FY24 ~$39M (+4.99%), FY25 ~$41.6M (+6.48%), FY26 ~$44.5M (+6.83%)

BOARD MEETINGS:
- Transcripts (47 videos, 2024–2026): full spoken discussions, public comment, presentations, superintendent reports, Q&A. Best for "what did the board discuss about X".
- Board minutes PDFs: official vote records, motions, attendance. May be partially captured — if vote details not found in transcripts, they are in minutes.
- NOTE: Individual board member votes are recorded in minutes, not always clearly stated in transcripts.

POLICIES:
- NEPN/NSBA coded policy documents — Section J = students, Section G = personnel, Section D = fiscal
- Student Code of Conduct (JIC): references dress standards but specific rules are in each school's building handbook
- Attendance/Truancy (JHB): excused vs unexcused absences, truancy thresholds
- Planned Absence Form: 5-day annual limit, 10% attendance threshold
- Staff Conduct with Students (GBEBB): staff-student relationship policies

SCHOOL DOCUMENTS:
- Each school has: staff directory, about page, activities/clubs, health info, calendar
- Newsletters: Tiger Tales (DCS), and others — contain event announcements and school news
- FHS: course catalog, athletics info, club listings

KNOWN GAPS (be honest about these — do not guess):
- Specific dress code rules: referenced in conduct policy but details are in school building handbooks not published online
- Individual board member vote tallies: in board minutes PDFs, may not be fully captured
- Bus route details: not fully captured
- FHS bell schedule: not published on school website
- Superintendent salary: not publicly listed
- Teacher assignments: not available

━━━ RESPONSE RULES ━━━
- Answer directly — lead with the answer, not a caveat
- Use ONLY the documents in CONTEXT below — never invent facts
- Cite sources naturally: mention the document name or meeting date, include the link when available
- Never invent names, titles, phone numbers, or contact information
- For budgets/policies: prefer the most recent document and note the year
- When multiple chunks are from the same source: synthesize into one cohesive answer
- If challenged on a correct answer: stand by it and cite the source
- Stay neutral — do not take positions on policy debates or budget decisions
- If the answer is not in the context: say so in ONE sentence, suggest rsu5.org — do not pad with lists of contacts
- Use markdown tables for multi-column numerical data
- Keep answers concise — two to four paragraphs maximum unless detail is specifically requested

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
    const debugInfo = `\n\n---\n**🔧 Admin Debug Info**\n\n**Model:** ${model}\n**Original query:** ${actualQuery}\n**Search query:** ${searchQuery}\n**Detected name:** ${detectedName || 'none'}\n**Chunks found:** ${relevantChunks.length}\n\n${relevantChunks.map((c, i) => `**${i + 1}.** Score: \`${Number(c.similarity).toFixed(3)}\` | Type: ${c.doc_type || '?'} | Date: ${c.doc_date || '?'} | School: ${c.school || 'none'}\n> Source: ${formatSource(c.filepath, c.source_url, c.chunk)}\n> ${c.chunk.slice(0, 150)}...`).join('\n\n')}`;
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
