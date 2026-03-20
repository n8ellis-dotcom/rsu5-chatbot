#!/usr/bin/env npx ts-node --esm
/**
 * embed.ts — Run once to load all docs/transcripts into Neon pgvector.
 * Usage: npx tsx scripts/embed.ts
 *
 * Requires: DATABASE_URL and OPENAI_API_KEY in .env.local
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { embeddings } from '../lib/schema';
import { generateEmbeddings } from '../lib/embeddings';

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema: { embeddings } });

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 100;
const BATCH_SIZE = 50; // OpenAI embedMany limit
const DIRS = ['docs', 'transcripts'];

function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 40) chunks.push(chunk);
    start = end - CHUNK_OVERLAP;
    if (start >= text.length - 40) break;
  }
  return chunks;
}

function getAllFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllFiles(full));
    } else if (entry.isFile() && /\.(txt|md|json)$/i.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

async function main() {
  console.log('🔍 Scanning docs and transcripts...');

  // Collect all chunks
  const allChunks: { filepath: string; chunk: string }[] = [];

  for (const dir of DIRS) {
    const files = getAllFiles(dir);
    console.log(`  📁 ${dir}: ${files.length} files`);
    for (const filepath of files) {
      const text = fs.readFileSync(filepath, 'utf-8');
      const chunks = chunkText(text);
      for (const chunk of chunks) {
        allChunks.push({ filepath, chunk });
      }
    }
  }

  console.log(`\n📊 Total chunks to embed: ${allChunks.length}`);
  console.log(`💰 Estimated cost: $${((allChunks.length * CHUNK_SIZE) / 1_000_000 * 0.02).toFixed(4)}\n`);

  // Clear existing embeddings
  console.log('🗑  Clearing existing embeddings...');
  await db.delete(embeddings);

  // Process in batches
  let inserted = 0;
  for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
    const batch = allChunks.slice(i, i + BATCH_SIZE);
    const texts = batch.map((c) => c.chunk);

    const embeddingVectors = await generateEmbeddings(texts);

    const rows = batch.map((c, idx) => ({
      filepath: c.filepath,
      chunk: c.chunk,
      embedding: embeddingVectors[idx],
    }));

    await db.insert(embeddings).values(rows);
    inserted += rows.length;

    const pct = Math.round((inserted / allChunks.length) * 100);
    process.stdout.write(`\r  ✅ ${inserted}/${allChunks.length} chunks (${pct}%)`);
  }

  console.log('\n\n🎉 Done! Neon is loaded and ready.');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
