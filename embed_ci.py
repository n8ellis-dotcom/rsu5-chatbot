import os, sys, json, re, time
sys.stdout.reconfigure(line_buffering=True)
import psycopg2
from pathlib import Path
from openai import OpenAI

DATABASE_URL     = os.environ.get('DATABASE_URL', '')
OPENAI_API_KEY   = os.environ.get('OPENAI_API_KEY', '')
DOCS_PATH        = os.environ.get('DOCS_PATH', 'docs')
TRANSCRIPTS_PATH = os.environ.get('TRANSCRIPTS_PATH', 'transcripts')
FRESH            = '--fresh' in sys.argv

if not DATABASE_URL:   print('ERROR: DATABASE_URL missing', flush=True); sys.exit(1)
if not OPENAI_API_KEY: print('ERROR: OPENAI_API_KEY missing', flush=True); sys.exit(1)

CHUNK_SIZE    = 1200
OVERLAP       = 200
MAX_CHARS     = 6000
BATCH_SIZE    = 100
PROGRESS_FILE = Path(os.path.expanduser('~/embed_progress.json'))

SCHOOL_PATTERNS = [
    (r'freeport.high.school|[^a-z]fhs[^a-z]|fhs\.rsu5',  'Freeport High School'),
    (r'freeport.middle.school|[^a-z]fms[^a-z]|fms\.rsu5', 'Freeport Middle School'),
    (r'mast.landing|[^a-z]mls[^a-z]|mls\.rsu5',           'Mast Landing School'),
    (r'morse.street|[^a-z]mss[^a-z]|mss\.rsu5',           'Morse Street School'),
    (r'durham.community|[^a-z]dcs[^a-z]|dcs\.rsu5',       'Durham Community School'),
    (r'pownal.elementary|[^a-z]pes[^a-z]|pes\.rsu5',      'Pownal Elementary School'),
    (r'central.office|district.wide|rsu.?5',               'District'),
]

TYPE_PATTERNS = [
    (r'transcript_\d{4}|RSU5_Meeting|board.meeting.transcript', 'board_meeting_transcript'),
    (r'budget|fy2[0-9]|financial.statement',                    'budget_document'),
    (r'policy|NEPN|NSBA|procedure|regulation',                  'policy'),
    (r'agenda|minutes',                                          'board_minutes'),
    (r'staff.directory|constituent',                             'staff_directory'),
    (r'employment|job.posting|opening',                          'employment'),
    (r'calendar|event',                                          'calendar'),
    (r'nutrition|lunch.menu|school.meal',                        'nutrition'),
    (r'handbook|student.guide|family.guide',                     'handbook'),
    (r'newsletter|tiger.tales|hawk.happenings',                  'newsletter'),
]

def extract_date(filepath, text):
    fname = Path(filepath).name
    m = re.search(r'(\d{4}-\d{2}-\d{2})', fname)
    if m: return m.group(1)
    m = re.search(r'^DATE:\s*(\d{4}-\d{2}-\d{2})', text[:2000], re.MULTILINE)
    if m: return m.group(1)
    m = re.search(r'\b(20\d{2}-\d{2}-\d{2})\b', text[:2000])
    if m: return m.group(1)
    months = {'january':'01','february':'02','march':'03','april':'04',
              'may':'05','june':'06','july':'07','august':'08',
              'september':'09','october':'10','november':'11','december':'12'}
    m = re.search(
        r'\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s+(20\d{2})\b',
        text[:2000], re.IGNORECASE)
    if m:
        return f'{m.group(3)}-{months[m.group(1).lower()]}-{m.group(2).zfill(2)}'
    m = re.search(r'\b(\d{1,2})/(\d{1,2})/(20\d{2}|\d{2})\b', text[:2000])
    if m:
        year = m.group(3) if len(m.group(3)) == 4 else '20' + m.group(3)
        return f'{year}-{m.group(1).zfill(2)}-{m.group(2).zfill(2)}'
    return None

def detect_type(filepath, text):
    fname = Path(filepath).name.lower()
    combined = fname + ' ' + text[:500].lower()
    for pattern, doc_type in TYPE_PATTERNS:
        if re.search(pattern, combined, re.IGNORECASE):
            return doc_type
    return 'general'

def detect_school(filepath, text):
    fname = Path(filepath).name.lower()
    combined = fname + ' ' + text[:3000].lower()
    for pattern, school in SCHOOL_PATTERNS:
        if re.search(pattern, combined, re.IGNORECASE):
            return school
    return None

def extract_source_url(text):
    for line in text.split('\n')[:10]:
        m = re.match(r'^(?:SOURCE_URL|SOURCE|YOUTUBE_LINK):\s*(https?://\S+)', line)
        if m: return m.group(1)
    return None

def is_transcript(filepath):
    return bool(re.search(r'transcript|rsu5_meeting|board_meeting', Path(filepath).name.lower()))

def make_chunk_header(doc_type, school, doc_date, source_url):
    """Build a metadata header to prepend to each chunk.
    Baking this into the chunk text improves embedding quality — the vector
    includes context about what the chunk is, not just what it says."""
    parts = []
    if doc_type and doc_type != 'general': parts.append(f'Type: {doc_type}')
    if school:    parts.append(f'School: {school}')
    if doc_date:  parts.append(f'Date: {doc_date}')
    if not parts: return ''
    return '[' + ' | '.join(parts) + ']\n'

def safe_chunk(text):
    if len(text) <= MAX_CHARS:
        return [text]
    parts = []
    while len(text) > MAX_CHARS:
        split_at = text.rfind(' ', 0, MAX_CHARS)
        if split_at == -1:
            split_at = MAX_CHARS
        parts.append(text[:split_at].strip())
        text = text[split_at:].strip()
    if text:
        parts.append(text)
    return parts

def chunk_text(text):
    chunks = []
    sentences = re.split(r'(?<=[.!?])\s+', text)
    current = []
    current_len = 0
    for sentence in sentences:
        if current_len + len(sentence) > CHUNK_SIZE and current:
            chunk = ' '.join(current).strip()
            for part in safe_chunk(chunk):
                if len(part) > 40:
                    chunks.append(part)
            overlap_text = chunk[-OVERLAP:] if len(chunk) > OVERLAP else chunk
            current = [overlap_text, sentence]
            current_len = len(overlap_text) + len(sentence)
        else:
            current.append(sentence)
            current_len += len(sentence) + 1
    if current:
        chunk = ' '.join(current).strip()
        for part in safe_chunk(chunk):
            if len(part) > 40:
                chunks.append(part)
    return chunks

def chunk_transcript(text):
    segments = re.split(r'(\[\d{1,2}:\d{2}(?::\d{2})?\])', text)
    turns = []
    current_ts = None
    for seg in segments:
        if re.match(r'\[\d{1,2}:\d{2}(?::\d{2})?\]', seg):
            current_ts = seg
        else:
            if current_ts:
                turns.append(current_ts + ' ' + seg.strip())
                current_ts = None
            elif seg.strip():
                turns.append(seg.strip())
    chunks = []
    current = []
    current_len = 0
    overlap_carry = ''
    for turn in turns:
        if current_len + len(turn) > CHUNK_SIZE and current:
            chunk = overlap_carry + ' '.join(current)
            for part in safe_chunk(chunk.strip()):
                if len(part) > 40:
                    chunks.append(part)
            overlap_carry = chunk[-OVERLAP:] + ' ' if len(chunk) > OVERLAP else ''
            current = []
            current_len = 0
        current.append(turn)
        current_len += len(turn) + 1
    if current:
        chunk = (overlap_carry + ' '.join(current)).strip()
        for part in safe_chunk(chunk):
            if len(part) > 40:
                chunks.append(part)
    return chunks

def generate_transcript_summary(filepath, text, doc_date, source_url):
    fname = Path(filepath).name
    lines = text.split('\n')
    fields = {}
    for line in lines[:15]:
        m = re.match(r'^(\w+(?:_\w+)*):\s*(.+)', line)
        if m:
            fields[m.group(1).upper()] = m.group(2).strip()
    title       = fields.get('TITLE', fname)
    description = fields.get('DESCRIPTION', '')
    school_year = fields.get('SCHOOL_YEAR', '')
    speakers = set()
    for line in lines[20:]:
        m = re.match(r'^\[[\d:]+\]\s+([A-Z][a-z]+(?: [A-Z][a-z]+)?)\s*[:–]', line)
        if m:
            speakers.add(m.group(1))
    vote_lines = [l.strip() for l in lines if re.search(r'\bvoted\b|\bmotion\b|\bapproved\b|\bseconded\b', l, re.IGNORECASE)][:10]
    summary_parts = [
        'SUMMARY CHUNK — Board Meeting Transcript',
        f'Date: {doc_date or "unknown"}',
        f'Title: {title}',
    ]
    if school_year:  summary_parts.append(f'School Year: {school_year}')
    if description:  summary_parts.append(f'Description: {description[:200]}')
    if speakers:     summary_parts.append(f'Speakers detected: {", ".join(sorted(speakers)[:10])}')
    if vote_lines:   summary_parts.append('Vote/motion references:\n' + '\n'.join(vote_lines))
    if source_url:   summary_parts.append(f'Video: {source_url}')
    return '\n'.join(summary_parts)[:MAX_CHARS]

def embed_single(client, text):
    text = text[:MAX_CHARS]
    resp = client.embeddings.create(model='text-embedding-3-small', input=[text])
    return resp.data[0].embedding

def get_conn():
    return psycopg2.connect(DATABASE_URL, connect_timeout=60,
        keepalives=1, keepalives_idle=30, keepalives_interval=10, keepalives_count=5)

def get_all_files(directory):
    p = Path(directory)
    if not p.exists(): print('Skipping %s' % directory, flush=True); return []
    return sorted([str(f) for f in p.rglob('*') if f.suffix.lower() in ('.txt', '.md')])

def load_progress():
    if PROGRESS_FILE.exists() and not FRESH:
        data = json.loads(PROGRESS_FILE.read_text())
        print('Resuming — %d files already done' % len(data['completed']), flush=True)
        return set(data['completed']), data['chunks_total']
    return set(), 0

def save_progress(completed, chunks_total):
    PROGRESS_FILE.write_text(json.dumps({
        'completed': list(completed),
        'chunks_total': chunks_total
    }, indent=2))

# ── Main ──────────────────────────────────────────────────────────────────────

all_files = []
for d in [DOCS_PATH, TRANSCRIPTS_PATH]:
    files = get_all_files(d)
    print('%s: %d files' % (d, len(files)), flush=True)
    all_files.extend(files)
print('Total: %d files' % len(all_files), flush=True)
if not all_files: print('No files found', flush=True); sys.exit(1)

completed, chunks_total = load_progress()

if FRESH or not completed:
    print('Clearing embeddings...', flush=True)
    conn = get_conn()
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute('DELETE FROM embeddings')
    cur.close()
    conn.close()
    print('Cleared', flush=True)
    completed = set()
    chunks_total = 0
else:
    print('Skipping DB wipe — resuming', flush=True)

client = OpenAI(api_key=OPENAI_API_KEY)
errors = 0

for i, fp in enumerate(all_files):
    if fp in completed:
        print('File %d/%d: SKIP %s' % (i+1, len(all_files), fp), flush=True)
        continue

    print('File %d/%d: %s' % (i+1, len(all_files), fp), flush=True)
    try:
        text = Path(fp).read_text(encoding='utf-8', errors='ignore').replace('\x00', '')
        source_url = extract_source_url(text)
        doc_type   = detect_type(fp, text)
        school     = detect_school(fp, text)
        date       = extract_date(fp, text)

        # Build metadata header — prepended to every chunk so the embedding
        # includes context about what the chunk is, improving retrieval accuracy
        header = make_chunk_header(doc_type, school, date, source_url)

        if is_transcript(fp):
            summary_chunk = generate_transcript_summary(fp, text, date, source_url)
            body_chunks   = chunk_transcript(text)
            # Prepend header to body chunks only (summary already has metadata)
            chunks = [summary_chunk] + [header + c for c in body_chunks]
            print('  [transcript] 1 summary + %d body chunks' % len(body_chunks), flush=True)
        else:
            raw_chunks = chunk_text(text)
            chunks = [header + c for c in raw_chunks]
            print('  [doc] %d chunks' % len(raw_chunks), flush=True)

        if not chunks:
            completed.add(fp)
            save_progress(completed, chunks_total)
            continue

        file_ok = True

        for b in range(0, len(chunks), BATCH_SIZE):
            batch       = chunks[b:b+BATCH_SIZE]
            batch_start = b
            try:
                resp = client.embeddings.create(model='text-embedding-3-small', input=batch)
                vecs = [x.embedding for x in resp.data]
                conn = get_conn()
                conn.autocommit = True
                cur = conn.cursor()
                for idx, (chunk, vec) in enumerate(zip(batch, vecs)):
                    cur.execute(
                        'INSERT INTO embeddings (filepath, chunk, embedding, source_url, doc_type, school, doc_date, chunk_index) VALUES (%s, %s, %s::vector, %s, %s, %s, %s, %s)',
                        (fp, chunk, json.dumps(vec), source_url, doc_type, school, date, batch_start + idx))
                cur.close()
                conn.close()
                chunks_total += len(batch)
                print('  batch %d-%d done (%d total)' % (b, b+len(batch), chunks_total), flush=True)
            except Exception as e:
                print('  batch %d-%d FAILED: %s — retrying individually' % (b, b+len(batch), e), flush=True)
                for idx, chunk in enumerate(batch):
                    try:
                        vec = embed_single(client, chunk)
                        conn = get_conn()
                        conn.autocommit = True
                        cur = conn.cursor()
                        cur.execute(
                            'INSERT INTO embeddings (filepath, chunk, embedding, source_url, doc_type, school, doc_date, chunk_index) VALUES (%s, %s, %s::vector, %s, %s, %s, %s, %s)',
                            (fp, chunk[:MAX_CHARS], json.dumps(vec), source_url, doc_type, school, date, batch_start + idx))
                        cur.close()
                        conn.close()
                        chunks_total += 1
                    except Exception as e2:
                        errors += 1
                        print('  chunk %d FAILED permanently: %s' % (batch_start + idx, e2), flush=True)
                        file_ok = False

        if file_ok:
            completed.add(fp)
            save_progress(completed, chunks_total)

    except Exception as e:
        errors += 1
        print('  ERROR: %s' % e, flush=True)

if errors == 0:
    PROGRESS_FILE.unlink(missing_ok=True)
    print('Progress file cleared (clean run)', flush=True)

print('DONE. %d chunks, %d errors' % (chunks_total, errors), flush=True)
