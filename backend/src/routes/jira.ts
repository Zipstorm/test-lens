import { Router, Request, Response } from "express";
import {
  listProjects,
  fetchTestCases,
  fetchTestCasesUnderTicket,
  fetchIssue,
  fetchIssueTypes,
  fetchTicketsByType,
  issueToTestCase,
  issueToSearchText,
  parseIssueKey,
} from "../services/jira";
import { enrichForEmbedding } from "../services/parser";
import { embedBatch } from "../services/embedder";
import { buildIndex } from "../services/vectorStore";
import { fetchXrayTests, fetchXrayTestsByJql, fetchXrayTestsForTestPlan, xrayTestToTestCase } from "../services/xray";

const router = Router();

/**
 * GET /api/jira/projects
 * List all accessible Jira projects.
 */
router.get("/projects", async (_req: Request, res: Response) => {
  try {
    const projects = await listProjects();
    res.json({ projects });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list Jira projects";
    console.error(`[Jira] Error listing projects: ${message}`);
    res.status(500).json({ error: message });
  }
});

/**
 * GET /api/jira/projects/:key/issues
 * Preview test case issues from a Jira project (does NOT index them).
 */
router.get("/projects/:key/issues", async (req: Request, res: Response) => {
  const key = String(req.params.key);
  const maxResults = Math.min(Math.max(Number(req.query.maxResults) || 50, 1), 200);

  try {
    const issues = await fetchTestCases(key, maxResults);
    const preview = issues.map((issue) => {
      const tc = issueToTestCase(issue);
      return { key: issue.key, summary: issue.summary, module: tc.module ?? null };
    });
    res.json({ projectKey: key, issues: preview, count: preview.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch Jira issues";
    console.error(`[Jira] Error fetching issues: ${message}`);
    res.status(500).json({ error: message });
  }
});

/**
 * GET /api/jira/projects/:key/issue-types
 * List non-subtask issue types for a Jira project.
 */
router.get("/projects/:key/issue-types", async (req: Request, res: Response) => {
  const key = String(req.params.key);
  try {
    const issueTypes = await fetchIssueTypes(key);
    res.json({ projectKey: key, issueTypes });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch issue types";
    console.error(`[Jira] Error fetching issue types: ${message}`);
    res.status(500).json({ error: message });
  }
});

/**
 * GET /api/jira/projects/:key/tickets
 * List tickets of a specific issue type in a project (for dropdown).
 * Query: issueType (required), maxResults (optional, default 50)
 */
router.get("/projects/:key/tickets", async (req: Request, res: Response) => {
  const key = String(req.params.key);
  const issueType = String(req.query.issueType || "");
  const maxResults = Math.min(Math.max(Number(req.query.maxResults) || 50, 1), 200);

  if (!issueType) {
    res.status(400).json({ error: "issueType query parameter is required" });
    return;
  }

  try {
    const tickets = await fetchTicketsByType(key, issueType, maxResults);
    res.json({ projectKey: key, issueType, tickets, count: tickets.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch tickets";
    console.error(`[Jira] Error fetching tickets: ${message}`);
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/jira/import
 * Import test case issues from a Jira project into Pinecone.
 * Body: { projectKey: string, maxResults?: number, parentTicketKey?: string }
 */
router.post("/import", async (req: Request, res: Response) => {
  const { projectKey, maxResults: rawMax, parentTicketKey } = req.body;

  if (!projectKey || typeof projectKey !== "string") {
    res.status(400).json({ error: "projectKey is required" });
    return;
  }

  const maxResults = Math.min(Math.max(Number(rawMax) || 100, 1), 500);

  try {
    // 1. Fetch test case issues — scoped to parent ticket if provided
    const issues = parentTicketKey
      ? await fetchTestCasesUnderTicket(parentTicketKey, maxResults)
      : await fetchTestCases(projectKey, maxResults);

    const source = parentTicketKey
      ? `jira:${projectKey}:${parentTicketKey}`
      : `jira:${projectKey}`;

    if (issues.length === 0) {
      res.json({ success: true, count: 0, source, message: "No test case issues found" });
      return;
    }
    console.log(`[Jira Import] Fetched ${issues.length} issues from ${source}`);

    // 2. Convert to TestCase objects
    const testCases = issues.map(issueToTestCase);

    // 3. Enrich and generate embeddings (reuse existing pipeline)
    const enrichedTexts = testCases.map(enrichForEmbedding);
    const vectors = await embedBatch(enrichedTexts);
    console.log(`[Jira Import] Generated ${vectors.length} embeddings`);

    // 4. Upsert into Pinecone
    await buildIndex(vectors, testCases, source);
    console.log(`[Jira Import] Indexed ${vectors.length} vectors (source: ${source})`);

    res.json({ success: true, count: testCases.length, source });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to import from Jira";
    console.error(`[Jira Import] Error: ${message}`);
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/jira/xray-import
 * Import tests from Xray Cloud (with rich step/precondition data) into Pinecone.
 * Body: { projectKey: string, maxResults?: number }
 */
router.post("/xray-import", async (req: Request, res: Response) => {
  const { projectKey, maxResults: rawMax, parentTicketKey } = req.body;

  if (!projectKey || typeof projectKey !== "string") {
    res.status(400).json({ error: "projectKey is required" });
    return;
  }

  const maxResults = Math.min(Math.max(Number(rawMax) || 100, 1), 500);

  try {
    // 1. Fetch tests — scoped to parent ticket if provided
    let xrayTests;
    if (parentTicketKey) {
      // Try Test Plan query first; if it returns nothing, fall back to
      // JQL-based search (works for Epics and other parent types)
      xrayTests = await fetchXrayTestsForTestPlan(parentTicketKey, maxResults);
      if (xrayTests.length === 0) {
        const jql = `"Epic Link" = "${parentTicketKey}" OR parent = "${parentTicketKey}"`;
        xrayTests = await fetchXrayTestsByJql(jql, maxResults);
      }
    } else {
      xrayTests = await fetchXrayTests(projectKey, maxResults);
    }

    const source = parentTicketKey
      ? `xray:${projectKey}:${parentTicketKey}`
      : `xray:${projectKey}`;

    if (xrayTests.length === 0) {
      res.json({ success: true, count: 0, source, message: "No Xray tests found" });
      return;
    }
    console.log(`[Xray Import] Fetched ${xrayTests.length} tests from ${source}`);

    // 2. Convert to TestCase objects (with rich text including steps)
    const testCases = xrayTests.map(xrayTestToTestCase);

    // 3. Enrich and generate embeddings
    const enrichedTexts = testCases.map(enrichForEmbedding);
    const vectors = await embedBatch(enrichedTexts);
    console.log(`[Xray Import] Generated ${vectors.length} embeddings`);

    // 4. Upsert into Pinecone
    await buildIndex(vectors, testCases, source);
    console.log(`[Xray Import] Indexed ${vectors.length} vectors (source: ${source})`);

    res.json({ success: true, count: testCases.length, source });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to import from Xray";
    console.error(`[Xray Import] Error: ${message}`);
    res.status(500).json({ error: message });
  }
});

/**
 * GET /api/jira/issue/:key
 * Fetch a single Jira issue for preview / search input.
 * Accepts issue key (QA-123) or full URL.
 */
router.get("/issue/:key", async (req: Request, res: Response) => {
  try {
    const issueKey = parseIssueKey(String(req.params.key));
    const issue = await fetchIssue(issueKey);
    res.json({
      key: issue.key,
      summary: issue.summary,
      description: issue.description,
      searchText: issueToSearchText(issue),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch Jira issue";
    console.error(`[Jira] Error fetching issue: ${message}`);
    res.status(500).json({ error: message });
  }
});

export default router;
