import crypto from "crypto";
import { Pinecone, type Index } from "@pinecone-database/pinecone";
import type { TestCase } from "./parser";

let pinecone: Pinecone | null = null;
let index: Index | null = null;
let ready = false;

export interface MatchResult {
  text: string;
  module?: string;
  source?: string;
  score: number;
  issueKey?: string;
  testType?: string;
  folder?: string;
  labels?: string;
  description?: string;
  steps?: string;
  preconditions?: string;
  gherkin?: string;
  unstructured?: string;
}

/**
 * Generate a stable, deterministic ID from the test case text.
 * Same text always produces the same ID — prevents duplicates across uploads.
 */
function hashId(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
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
 * Upsert test case vectors into Pinecone (accumulate mode).
 *
 * IDs are derived from the test case text content (SHA-256 hash).
 * - Same text across files → same ID → no duplicates
 * - Different text → different ID → accumulates alongside existing vectors
 * - Re-uploading same file → same hashes → safely overwrites itself
 */
export async function buildIndex(
  vectors: number[][],
  testCases: TestCase[],
  source?: string
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
      if (source) {
        metadata.source = source;
      }
      // Spread extra metadata fields (from Xray imports, etc.)
      if (tc.metadata) {
        for (const [k, v] of Object.entries(tc.metadata)) {
          if (v) metadata[k] = v;
        }
      }
      return {
        id: hashId(tc.text),
        values,
        metadata,
      };
    });

    await index.upsert(batch);
  }

  console.log(`[VectorStore] Upserted ${vectors.length} vectors`);
}

/**
 * Query the Pinecone index for the most similar vectors.
 * Returns matched test case texts with similarity scores, module, and source.
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
    const meta = match.metadata as Record<string, string> | undefined;
    return {
      text: meta?.text ?? "",
      module: meta?.module,
      source: meta?.source,
      score: match.score ?? 0,
      issueKey: meta?.issueKey,
      testType: meta?.testType,
      folder: meta?.folder,
      labels: meta?.labels,
      description: meta?.description,
      steps: meta?.steps,
      preconditions: meta?.preconditions,
      gherkin: meta?.gherkin,
      unstructured: meta?.unstructured,
    };
  });
}

/**
 * Check if the Pinecone index has been initialized and is ready for queries.
 */
export function isIndexReady(): boolean {
  return ready;
}

/**
 * Retrieve index-level statistics from Pinecone (total vectors, dimension, etc.).
 */
export async function getIndexStats(): Promise<{
  totalVectors: number;
  dimension: number;
}> {
  if (!index) throw new Error("Pinecone index not initialized. Call initIndex() first.");

  const stats = await index.describeIndexStats();

  return {
    totalVectors: stats.totalRecordCount ?? 0,
    dimension: stats.dimension ?? 0,
  };
}

export interface CoverageBreakdown {
  name: string;
  count: number;
}

export interface CoverageData {
  totalVectors: number;
  byModule: CoverageBreakdown[];
  bySource: CoverageBreakdown[];
  byTestType: CoverageBreakdown[];
}

/**
 * Fetch all vectors from Pinecone and group them by metadata fields
 * (module, source, testType) to produce a coverage breakdown.
 *
 * Uses a zero-vector query with high topK to pull records for grouping.
 */
export async function getCoverageData(): Promise<CoverageData> {
  if (!index) throw new Error("Pinecone index not initialized. Call initIndex() first.");

  // Get dimension so we can construct a zero vector
  const stats = await index.describeIndexStats();
  const dimension = stats.dimension ?? 0;
  const totalVectors = stats.totalRecordCount ?? 0;

  if (dimension === 0 || totalVectors === 0) {
    return { totalVectors: 0, byModule: [], bySource: [], byTestType: [] };
  }

  // Query with a zero vector to fetch up to 10000 vectors with metadata
  const zeroVector = new Array(dimension).fill(0);
  const topK = Math.min(totalVectors, 10000);

  const result = await index.query({
    vector: zeroVector,
    topK,
    includeMetadata: true,
  });

  // Group by metadata fields
  const moduleCounts: Record<string, number> = {};
  const sourceCounts: Record<string, number> = {};
  const testTypeCounts: Record<string, number> = {};

  for (const match of result.matches || []) {
    const meta = match.metadata as Record<string, string> | undefined;

    const mod = meta?.module || "Uncategorized";
    moduleCounts[mod] = (moduleCounts[mod] || 0) + 1;

    const src = meta?.source || "Unknown";
    sourceCounts[src] = (sourceCounts[src] || 0) + 1;

    const tt = meta?.testType || "Untyped";
    testTypeCounts[tt] = (testTypeCounts[tt] || 0) + 1;
  }

  // Convert to sorted arrays (descending by count)
  const toSorted = (counts: Record<string, number>): CoverageBreakdown[] =>
    Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

  return {
    totalVectors,
    byModule: toSorted(moduleCounts),
    bySource: toSorted(sourceCounts),
    byTestType: toSorted(testTypeCounts),
  };
}
