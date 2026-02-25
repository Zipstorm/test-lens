import { Router, Request, Response } from "express";
import { embed } from "../services/embedder";
import { queryIndex, isIndexReady } from "../services/vectorStore";
import { explainMatches } from "../services/llm";

const DEFAULT_TOP_K = 5;
const MAX_TOP_K = 20;

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  const { userStory, topK: rawTopK } = req.body;

  if (!userStory || typeof userStory !== "string" || userStory.trim().length === 0) {
    res.status(400).json({ error: "userStory is required and must be a non-empty string" });
    return;
  }

  if (!isIndexReady()) {
    res.status(400).json({ error: "Index is not ready. Please upload a test case file first." });
    return;
  }

  const topK = Math.min(Math.max(Number(rawTopK) || DEFAULT_TOP_K, 1), MAX_TOP_K);

  try {
    // 1. Embed the user story
    const queryVector = await embed(userStory.trim());

    // 2. Find nearest test cases in Pinecone
    const matches = await queryIndex(queryVector, topK);

    if (matches.length === 0) {
      res.json({ userStory, results: [] });
      return;
    }

    // 3. Get Claude's analysis of relevance
    const results = await explainMatches(userStory.trim(), matches);

    res.json({ userStory, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error during search";
    console.error(`[Search] Error: ${message}`);
    res.status(500).json({ error: message });
  }
});

export default router;
