import { Router, Request, Response } from "express";
import { getIndexStats, isIndexReady } from "../services/vectorStore";

const router = Router();

/**
 * GET /api/stats
 * Returns Pinecone index statistics (total vectors, dimension).
 */
router.get("/", async (_req: Request, res: Response) => {
  if (!isIndexReady()) {
    res.status(503).json({ error: "Pinecone index is not initialized" });
    return;
  }

  try {
    const stats = await getIndexStats();
    res.json(stats);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[Stats] Error fetching index stats: ${message}`);
    res.status(500).json({ error: message });
  }
});

export default router;
