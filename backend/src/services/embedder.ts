import OpenAI from "openai";

const EMBEDDING_MODEL = "text-embedding-3-small";
const MAX_BATCH_SIZE = 2048; // OpenAI limit per request

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

/**
 * Generate an embedding vector for a single text string.
 */
export async function embed(text: string): Promise<number[]> {
  const response = await getClient().embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    dimensions: 1536,
  });
  return response.data[0].embedding;
}

/**
 * Generate embedding vectors for multiple texts in a single API call.
 * Handles batching if texts exceed the per-request limit.
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
    const batch = texts.slice(i, i + MAX_BATCH_SIZE);
    const response = await getClient().embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
      dimensions: 1536,
    });

    const sorted = response.data.sort((a, b) => a.index - b.index);
    for (const item of sorted) {
      allEmbeddings.push(item.embedding);
    }
  }

  return allEmbeddings;
}
