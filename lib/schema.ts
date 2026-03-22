import { pgTable, serial, text, vector, index } from 'drizzle-orm/pg-core';

export const embeddings = pgTable(
  'embeddings',
  {
    id: serial('id').primaryKey(),
    filepath: text('filepath').notNull(),
    chunk: text('chunk').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }).notNull(),
    source_url: text('source_url'),
    doc_type: text('doc_type'),
    school: text('school'),
    doc_date: text('doc_date'),
  },
  (table) => ({
    embeddingIndex: index('embeddingIndex').using(
      'hnsw',
      table.embedding.op('vector_cosine_ops')
    ),
  })
);
