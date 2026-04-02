import Anthropic from '@anthropic-ai/sdk';
import { findRelevantChunks } from '@/lib/search';

export const maxDuration = 60;

const SONNET_QUERIES = [
  'why', 'how', 'explain', 'what is', 'what are', 'tell me about',
  'budget', 'vote', 'voted', 'policy', 'increase', 'decrease', 'change',
  'compare', 'difference', 'history', 'trend', 'reason', 'because',
  'superintendent', 'board', 'meeting', 'salary', 'staff', 'hire',
  'special education', 'curriculum', 'enrollment', 'tax', 'mil rate',
  'consolidat', 'clos', 'reduc', 'cut', 'position', 'discuss',
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

  // Board meeting transcripts
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

  // Budget files — clean readable names
  if (filename.includes('budget_fy')) {
    const fyMatch = filename.match(/budget_(fy\d+)_?(.+)?\.txt/);
    if (fyMatch) {
      const fy = fyMatch[1].toUpperCase();
      const rawType = (fyMatch[2] || '').replace(/_/g, ' ').trim();
      const typeLabel = rawType
        .replace('board adopted brochure', 'Board Adopted Budget')
        .replace('board adopted', 'Board Adopted Budget (Line Item)')
        .replace('superintendent recommended', 'Superintendent Recommended Budget')
        .replace('citizens adopted', 'Citizens Adopted Budget')
        || 'Budget';
      const link = sourceUrl ? ` ([Source](${sourceUrl}))` : '';
      return `RSU5 ${fy} ${typeLabel}${link}`;
    }
  }

  // Policy docs — extract NEPN code or title from chunk
  if (sourceUrl && sourceUrl.includes('resource-manager') && chunk) {
    const nepnMatch = chunk.match(/NEPN\/NSBA Code:\s*(\S+)/);
    const titleMatch = chunk.match(/^([A-Z][A-Z\s\-&/–]{5,60})\n/m);
    if (titleMatch) {
      return `${titleMatch[1].trim()} ([Source](${sourceUrl}))`;
    }
    if (nepnMatch) {
      return `RSU5 Policy ${nepnMatch[1]} ([Source](${sourceUrl}))`;
    }
    return `RSU5 District Document ([Source](${sourceUrl}))`;
  }

  // Generic fallback — clean up filename
  if (sourceUrl) {
    const cleaned = filename.replace(/_/g, ' ').replace('.txt', '').trim();
    const label = cleaned.length > 4 ? cleaned : 'RSU5 Document';
    return `${label} ([Source](${sourceUrl}))`;
  }

  const cleaned = filename.replace(/_/g, ' ').replace('.txt', '').trim();
  return cleaned.length > 4 ? cleaned : 'RSU5 District Document';
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
- RSU5 fiscal year runs July–June. FY26=2025-2026. "this year"=FY26. "last year"=FY25. "2020 budget" could mean FY20 or FY21.
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

function getCurrentFiscalContext(): string {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const fyYear = month >= 7 ? year + 1 : year;
  const fyShort = fyYear % 100;
  return `Today is ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}. The current RSU5 fiscal year is FY${fyShort} (July ${fyYear - 1}–June ${fyYear}). When someone says "this year", "current year", or "this budget" they mean FY${fyShort}.`;
}

const RSU5_SITE_INDEX = `
━━━ RSU5 WEBSITE REFERENCE INDEX ━━━
Use these exact URLs when directing users to more information. Never invent URLs.

BUDGET PAGES:
- Budget home: https://www.rsu5.org/budget
- FY27 (2026-2027): https://www.rsu5.org/budget/fy27
- FY26 (2025-2026): https://www.rsu5.org/budget/fy26
- FY25 (2024-2025): https://www.rsu5.org/budget/fy25
- FY24 (2023-2024): https://www.rsu5.org/budget/fy24
- FY23 (2022-2023): https://www.rsu5.org/budget/budget-2022-2023
- FY22 (2021-2022): https://www.rsu5.org/budget/budget-2021-2022
- FY21 (2020-2021): https://www.rsu5.org/budget/budget-2020-2021
- FY20 (2019-2020): https://www.rsu5.org/budget/budget-2019-2020
- Financial statements: https://www.rsu5.org/budget/financial-statements
- Budget goals: https://www.rsu5.org/budget/budget-goals

BOARD OF DIRECTORS:
- Board home: https://www.rsu5.org/board-of-directors-and-policies
- Board members: https://www.rsu5.org/board-of-directors-and-policies/board-of-directors
- Board agendas: https://www.rsu5.org/board-of-directors-and-policies/board-agendas-and-minutes/agendas
- Board minutes: https://www.rsu5.org/board-of-directors-and-policies/board-agendas-and-minutes/minutes
- Board meeting videos (YouTube): https://www.youtube.com/channel/UC97VXXLhRFRjSPv1wfo1ACA/
- Board meeting video archive: https://www.rsu5.org/board-of-directors-and-policies/board-meeting-video-archived-library
- Adopted policies: https://www.rsu5.org/board-of-directors-and-policies/adopted-policies-and-procedures
- Finance Committee: https://www.rsu5.org/board-of-directors-and-policies/board-committees/standing-committees/finance-committee
- Policy Committee: https://www.rsu5.org/board-of-directors-and-policies/board-committees/standing-committees/policy-committee

SCHOOLS:
- Freeport High School: https://fhs.rsu5.org
- Freeport High School program of studies: https://fhs.rsu5.org/curriculum/program-of-studies
- Freeport Middle School: https://fms.rsu5.org
- Durham Community School: https://dcs.rsu5.org
- Mast Landing School: https://mls.rsu5.org
- Morse Street School: https://mss.rsu5.org
- Pownal Elementary School: https://pes.rsu5.org
- Athletics: https://www.rsu5freeportathletics.com

DISTRICT INFORMATION:
- Staff directory: https://www.rsu5.org/district-wide-staff-directory
- Calendar: https://www.rsu5.org/calendar
- 2025-2026 school year calendar: https://www.rsu5.org/calendar/school-year-calendar
- 2026-2027 school year calendar: https://www.rsu5.org/calendar/2026-2027-school-year-calendar
- Special education: https://www.rsu5.org/departments/special-education
- Transportation: https://www.rsu5.org/departments/transportation
- Curriculum: https://www.rsu5.org/departments/curriculum-instruction-and-assessment
- School nutrition: https://www.rsu5.org/school-nutrition
- Employment: https://www.applitrack.com/rsu5/onlineapp/
- Administration: https://www.rsu5.org/departments/administration
- Business office: https://www.rsu5.org/business-office-and-human-resources-1
- Community programs: http://rsu5cp.org/`;

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

━━━ DISTRICT FACTS ━━━
- Superintendent: Tom Gray (grayt@rsu5.org)
- District: Regional School Unit 5 — Freeport, Durham, and Pownal, Maine
- Schools: Freeport High School (FHS, grades 9–12), Freeport Middle School (FMS, grades 6–8), Mast Landing School (MLS, K–5 Freeport), Morse Street School (MSS, K–5 Freeport), Durham Community School (DCS, PreK–8 Durham), Pownal Elementary School (PES, K–5 Pownal)
- Board meetings: typically second and fourth Wednesday of each month
- RSU5 fiscal year: July 1 – June 30

// ── HARDCODED FACTS — sourced from embedded documents but stored here for reliable retrieval.
// These should be reviewed and updated each fiscal year when new budget brochures are published.
// With direct district server access, these would be pulled dynamically from source documents.
- FY26 total budget: $44,455,929 (6.83% increase over FY25) [Source: FY26 Board Adopted Budget Brochure]
- FY25 total budget: $41,612,460 (6.48% increase over FY24) [Source: FY25 Board Adopted Budget Brochure]
- FY24 total budget: $39,080,569 (4.99% increase over FY23) [Source: FY24 Board Adopted Budget Brochure]
- FY23 total budget: ~$38.1M (4.22% increase over FY22) [Source: FY23 Board Adopted Budget Brochure]
- FY22 total budget: ~$35.7M (2.09% increase over FY21) [Source: FY22 Board Adopted Budget Brochure]
- FY26 enrollment: approximately 1,950 students district-wide (declining trend from ~2,100 in FY23) [Source: FY26 Budget Brochure — approximate, update when official figures published]
- FY26 primary cost driver: negotiated salary and benefit increases (94.3% of new spending) [Source: FY26 Board Adopted Budget Brochure]
- FY26 staffing reductions: 4 Educators, 5 Educational Technicians, 1 District Mechanic (due to enrollment decline) [Source: FY26 Board Adopted Budget Brochure]
- Previous superintendent: Jean Skorapa (retired, Tom Gray appointed 2023) [Source: FY24 Budget Brochure]
// ── END HARDCODED FACTS

━━━ DOCUMENT KNOWLEDGE MAP ━━━
BUDGET:
- FY22–FY26 Board Adopted Brochures: best for totals, reasons for increases, school updates, enrollment trends
- FY26 Board Adopted line-item: detailed expenditures by function/cost center
- FY26 Citizens Adopted: community-facing summary post-vote
- FY26 Superintendent Recommended: superintendent's rationale (January 2025)
- FY27 Superintendent Proposed: preliminary FY27 budget (January 2026) — projects ~9.82% increase

BOARD MEETINGS:
- 47 transcripts (2024–2026): full discussions, public comment, superintendent reports
- Board minutes PDFs: official vote records — may be partially captured
- Individual member votes: in minutes, not always in transcripts

POLICIES (NEPN/NSBA coded):
- JIC: Student Code of Conduct
- JHB: Attendance/Truancy — 7 unexcused absences = truant, 10% absence triggers intervention
- Planned absence: max 5 days/year, must submit form to main office before absence
- GBEBB: Staff Conduct with Students
- Section J: all student policies; Section G: personnel policies

SCHOOL DOCUMENTS:
- Staff directories, newsletters, activity listings per school
- FHS program of studies: https://fhs.rsu5.org/curriculum/program-of-studies

KNOWN GAPS:
- Specific dress code rules: in building handbooks, not published online
- Individual board member vote tallies: in minutes PDFs, may not be fully captured
- Bus routes: not fully captured
- FHS bell schedule: not published online
- Superintendent salary: not publicly listed
- Teacher assignments: not available
- Lunch menus: not embedded (check school nutrition page)

━━━ RESPONSE RULES ━━━
- Lead with the answer — never open with a caveat or "I don't have..."
- Use ONLY the documents in CONTEXT plus the District Facts above
- Cite sources naturally with document name or meeting date and a link when available
- Never invent names, titles, phone numbers, or URLs — use only the Site Index below
- For budgets/policies: prefer most recent document, note the year
- Synthesize multiple chunks from same source into one cohesive answer
- Stand by correct answers when challenged — cite the source
- Stay neutral on policy debates
- When answer is not in context: one sentence, then give the exact URL from the Site Index
- Use markdown tables for multi-column numerical data
- Keep answers to 2–4 paragraphs unless detail is specifically requested
- NEVER assume an event, meeting, or vote did not occur just because it is not in your documents. Absence of a record means "I don't have information about that" — never "that didn't happen." Always say "I don't have records of that" and direct to rsu5.org or the YouTube channel.
- Never say "the documents provided to me" — say "my records" or "the available documents"

${RSU5_SITE_INDEX}

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
