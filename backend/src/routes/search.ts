import { Router, Request, Response } from "express";
import { embed } from "../services/embedder";
import { queryIndex, isIndexReady } from "../services/vectorStore";
import { explainMatches, suggestTestCases } from "../services/llm";
import { fetchIssue, issueToSearchText, parseIssueKey } from "../services/jira";

const DEFAULT_TOP_K = 5;
const MAX_TOP_K = 20;

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  const { userStory, jiraKey: rawJiraKey, topK: rawTopK } = req.body;

  // Resolve search text — either from userStory or by fetching a Jira issue
  let searchText: string;
  let jiraKey: string | undefined;
  let jiraSummary: string | undefined;

  if (rawJiraKey && typeof rawJiraKey === "string" && rawJiraKey.trim().length > 0) {
    // Jira-based search: fetch issue and use its content as the query
    try {
      jiraKey = parseIssueKey(rawJiraKey.trim());
      const issue = await fetchIssue(jiraKey);
      searchText = issueToSearchText(issue);
      jiraSummary = issue.summary;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch Jira issue";
      res.status(400).json({ error: message });
      return;
    }
  } else if (userStory && typeof userStory === "string" && userStory.trim().length > 0) {
    // Direct user story search
    searchText = userStory.trim();
  } else {
    res.status(400).json({
      error: "Provide either userStory (text) or jiraKey (e.g., QA-123 or a Jira URL)",
    });
    return;
  }

  if (!isIndexReady()) {
    res.status(400).json({ error: "Index is not ready. Please upload a test case file first." });
    return;
  }

  const topK = Math.min(Math.max(Number(rawTopK) || DEFAULT_TOP_K, 1), MAX_TOP_K);

  try {
    // 1. Embed the search text
    const queryVector = await embed(searchText);

    // 2. Find nearest test cases in Pinecone
    const matches = await queryIndex(queryVector, topK);

    if (matches.length === 0) {
      res.json({ userStory: searchText, jiraKey, jiraSummary, results: [] });
      return;
    }

    // 3. Get Claude's analysis of relevance
    const results = await explainMatches(searchText, matches);

    res.json({ userStory: searchText, jiraKey, jiraSummary, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error during search";
    console.error(`[Search] Error: ${message}`);
    res.status(500).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// Suggest new test cases (gap analysis)
// ---------------------------------------------------------------------------

router.post("/suggest", async (req: Request, res: Response) => {
  const { userStory, existingTests } = req.body;

  if (!userStory || typeof userStory !== "string" || userStory.trim().length === 0) {
    res.status(400).json({ error: "userStory is required" });
    return;
  }

  const tests: string[] = Array.isArray(existingTests) ? existingTests : [];

  try {
    const suggestions = await suggestTestCases(userStory.trim(), tests);
    res.json({ suggestions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error during suggestion";
    console.error(`[Suggest] Error: ${message}`);
    res.status(500).json({ error: message });
  }
});

export default router;
