import { Pinecone, type Index } from "@pinecone-database/pinecone";

let pinecone: Pinecone | null = null;
let index: Index | null = null;
let ready = false;

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
 * Each vector is stored with its original text as metadata.
 */
export async function buildIndex(
  vectors: number[][],
  texts: string[]
): Promise<void> {
  if (!index) throw new Error("Pinecone index not initialized. Call initIndex() first.");

  const BATCH_SIZE = 100;

  for (let i = 0; i < vectors.length; i += BATCH_SIZE) {
    const batch = vectors.slice(i, i + BATCH_SIZE).map((values, j) => ({
      id: `tc-${i + j}`,
      values,
      metadata: { text: texts[i + j] },
    }));

    await index.upsert(batch);
  }

  console.log(`[VectorStore] Upserted ${vectors.length} vectors`);
}

/**
 * Query the Pinecone index for the most similar vectors.
 * Returns matched test case texts with similarity scores.
 */
export async function queryIndex(
  vector: number[],
  topK: number
): Promise<{ text: string; score: number }[]> {
  if (!index) throw new Error("Pinecone index not initialized. Call initIndex() first.");

  const result = await index.query({
    vector,
    topK,
    includeMetadata: true,
  });

  return (result.matches || []).map((match) => ({
    text: (match.metadata as { text: string })?.text ?? "",
    score: match.score ?? 0,
  }));
}

/**
 * Check if the Pinecone index has been initialized and is ready for queries.
 */
export function isIndexReady(): boolean {
  return ready;
}
