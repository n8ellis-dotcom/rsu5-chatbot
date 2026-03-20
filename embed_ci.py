import os, sys, json
import psycopg2
from pathlib import Path
from openai import OpenAI

DATABASE_URL = os.environ.get('DATABASE_URL', '')
OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY', '')
DOCS_PATH = os.environ.get('DOCS_PATH', 'docs')
TRANSCRIPTS_PATH = os.environ.get('TRANSCRIPTS_PATH', 'transcripts')
START_INDEX = int(os.environ.get('START_INDEX', '0'))
END_INDEX = int(os.environ.get('END_INDEX', '9999'))

if not DATABASE_URL:
            print('ERROR: DATABASE_URL missing')
            sys.exit(1)
        if not OPENAI_API_KEY:
                    print('ERROR: OPENAI_API_KEY missing')
                    sys.exit(1)
                print('Env vars loaded, START=%d END=%d' % (START_INDEX, END_INDEX))

CHUNK_SIZE = 800
CHUNK_OVERLAP = 100

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
                            print('Skipping %s (not found)' % directory)
                            return []
                        return sorted([str(f) for f in p.rglob('*') if f.suffix.lower() in ('.txt', '.md')])

print('Connecting to Neon...')
conn = psycopg2.connect(DATABASE_URL, connect_timeout=30)
conn.autocommit = True
cur = conn.cursor()
print('Connected')

all_files = []
for d in [DOCS_PATH, TRANSCRIPTS_PATH]:
            files = get_all_files(d)
    print('%s: %d files' % (d, len(files)))
    all_files.extend(files)

print('Total files: %d' % len(all_files))
if not all_files:
            print('No files found')
    sys.exit(1)

if START_INDEX == 0:
            print('Clearing existing embeddings...')
    cur.execute('DELETE FROM embeddings')
    print('Cleared')

client = OpenAI(api_key=OPENAI_API_KEY)
files_done = 0
total_chunks = 0
errors = 0

for i, filepath in enumerate(all_files):
            if i < START_INDEX:
                            continue
                        if i >= END_INDEX:
                                        break
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
        total_chunks += len(chunks)
        files_done += 1
        if files_done % 25 == 0:
                            print('%d/%d files | %d chunks' % (i+1, min(END_INDEX, len(all_files)), total_chunks))
            sys.stdout.flush()
except Exception as e:
        errors += 1
        print('Error on %s: %s' % (filepath, e))
        files_done += 1

cur.close()
conn.close()
print('Done! %d chunks loaded. %d errors. Processed files %d to %d.' % (total_chunks, errors, START_INDEX, END_INDEX))
