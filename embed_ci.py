import os, sys, json
import psycopg2
from pathlib import Path
from openai import OpenAI

DATABASE_URL = os.environ.get('DATABASE_URL', '')
OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY', '')
DOCS_PATH = os.environ.get('DOCS_PATH', 'docs')
TRANSCRIPTS_PATH = os.environ.get('TRANSCRIPTS_PATH', 'transcripts')

if not DATABASE_URL:
    print('❌ DATABASE_URL missing'); sys.exit(1)
if not OPENAI_API_KEY:
    print('❌ OPENAI_API_KEY missing'); sys.exit(1)
print('✅ Env vars loaded')

CHUNK_SIZE = 800
CHUNK_OVERLAP = 100
DIRS = [DOCS_PATH, TRANSCRIPTS_PATH]

def chunk_text(text):
    chunks, start = [], 0
    while start < len(text):
        end = min(start + CHUNK_SIZE, len(text))
        chunk = text[start:end].strip()
        if len(chunk) > 40:
            chunks.append(chunk)
        start = end - CHUNK_OVERLAP
        if start >= len(text) - 40:
            break
    return chunks

def get_all_files(directory):
    p = Path(directory)
    if not p.exists():
        print(f'  Skipping {directory}')
        return []
    return [str(f) for f in p.rglob('*') if f.suffix.lower() in ('.txt', '.md')]

print('Connecting to Neon...')
conn = psycopg2.connect(DATABASE_URL)
conn.autocommit = False
cur = conn.cursor()
print('Connected')

all_files = []
for d in DIRS:
    files = get_all_files(d)
    print(f'  {d}: {len(files)} files')
    all_files.extend(files)

print(f'Total files: {len(all_files)}')
if not all_files:
    print('No files found')
    sys.exit(1)

print('Clearing existing embeddings...')
cur.execute('DELETE FROM embeddings')
conn.commit()
print('Cleared')

client = OpenAI(api_key=OPENAI_API_KEY)
files_done, total_chunks, errors = 0, 0, 0

for filepath in all_files:
    try:
        text = Path(filepath).read_text(encoding='utf-8', errors='ignore')
        chunks = chunk_text(text)
        if not chunks:
            files_done += 1
            continue
        response = client.embeddings.create(model='text-embedding-3-small', input=chunks)
        vectors = [item.embedding for item in response.data]
        for chunk, vector in zip(chunks, vectors):
            cur.execute(
                'INSERT INTO embeddings (filepath, chunk, embedding) VALUES (%s, %s, %s::vector)',
                (filepath, chunk, json.dumps(vector))
            )
        conn.commit()
        total_chunks += len(chunks)
        files_done += 1
        if files_done % 50 == 0 or files_done == len(all_files):
            pct = round(files_done / len(all_files) * 100)
            print(f'{files_done}/{len(all_files)} files ({pct}%) | {total_chunks} chunks')
    except Exception as e:
        errors += 1
        print(f'Error on {filepath}: {e}')
        conn.rollback()
        files_done += 1

cur.close()
conn.close()
print(f'Done! {total_chunks} chunks loaded. {errors} errors.')
