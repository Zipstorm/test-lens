import { Pinecone, type Index } from "@pinecone-database/pinecone";
import type { TestCase } from "./parser";

let pinecone: Pinecone | null = null;
let index: Index | null = null;
let ready = false;

export interface MatchResult {
  text: string;
  module?: string;
  score: number;
}

/**
 * Connect to Pinecone and get a reference to the configured index.
 * Must be called once at server startup before any other operations.
 */
export async function initIndex(): Promise<void> {
  const apiKey = process.env.PINECONE_API_KEY;
  const indexName = process.env.PINECONE_INDEX_NAME;

  if (!apiKey) throw new Error("PINECONE_API_KEY is not set");
  if (!indexName) throw new Error("PINECONE_INDEX_NAME is not set");

  pinecone = new Pinecone({ apiKey });
  index = pinecone.index(indexName);
  ready = true;

  console.log(`[VectorStore] Connected to Pinecone index: ${indexName}`);
}

/**
 * Upsert test case vectors into Pinecone.
 * Each vector is stored with its text and optional module as metadata.
 */
export async function buildIndex(
  vectors: number[][],
  testCases: TestCase[]
): Promise<void> {
  if (!index) throw new Error("Pinecone index not initialized. Call initIndex() first.");

  const BATCH_SIZE = 100;

  for (let i = 0; i < vectors.length; i += BATCH_SIZE) {
    const batch = vectors.slice(i, i + BATCH_SIZE).map((values, j) => {
      const tc = testCases[i + j];
      const metadata: Record<string, string> = { text: tc.text };
      if (tc.module) {
        metadata.module = tc.module;
      }
      return { id: `tc-${i + j}`, values, metadata };
    });

    await index.upsert(batch);
  }

  console.log(`[VectorStore] Upserted ${vectors.length} vectors`);
}

/**
 * Query the Pinecone index for the most similar vectors.
 * Returns matched test case texts with similarity scores and module info.
 */
export async function queryIndex(
  vector: number[],
  topK: number
): Promise<MatchResult[]> {
  if (!index) throw new Error("Pinecone index not initialized. Call initIndex() first.");

  const result = await index.query({
    vector,
    topK,
    includeMetadata: true,
  });

  return (result.matches || []).map((match) => {
    const meta = match.metadata as { text: string; module?: string } | undefined;
    return {
      text: meta?.text ?? "",
      module: meta?.module,
      score: match.score ?? 0,
    };
  });
}

/**
 * Check if the Pinecone index has been initialized and is ready for queries.
 */
export function isIndexReady(): boolean {
  return ready;
}
