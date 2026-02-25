import type { TestCase } from "./parser";

// Labels to exclude when deriving module from Jira labels
const GENERIC_LABELS = new Set(["qa", "automated", "manual", "regression", "smoke"]);

export interface JiraProject {
  key: string;
  name: string;
}

export interface JiraIssue {
  key: string;
  summary: string;
  description: string | null;
  labels: string[];
  issueType: string;
}

export interface JiraIssueType {
  id: string;
  name: string;
  subtask: boolean;
}

export interface JiraTicketSummary {
  key: string;
  summary: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getConfig() {
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const apiToken = process.env.JIRA_API_TOKEN;

  if (!baseUrl || !email || !apiToken) {
    throw new Error(
      "Jira is not configured. Set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN in .env"
    );
  }

  return { baseUrl: baseUrl.replace(/\/+$/, ""), email, apiToken };
}

async function jiraFetch<T = any>(path: string): Promise<T> {
  const { baseUrl, email, apiToken } = getConfig();
  const credentials = Buffer.from(`${email}:${apiToken}`).toString("base64");

  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${credentials}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Jira API error (${res.status}): ${body}`);
  }

  return res.json() as Promise<T>;
}

/**
 * Search Jira issues using the new POST /rest/api/3/search/jql endpoint.
 * The old GET /rest/api/3/search was removed (410 Gone).
 */
async function jiraSearch(
  jql: string,
  fields: string[],
  maxResults: number
): Promise<any> {
  const { baseUrl, email, apiToken } = getConfig();
  const credentials = Buffer.from(`${email}:${apiToken}`).toString("base64");

  const url = `${baseUrl}/rest/api/3/search/jql`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ jql, fields, maxResults }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Jira API error (${res.status}): ${body}`);
  }

  return res.json();
}

/**
 * Recursively extract plain text from an ADF (Atlassian Document Format) node.
 * Handles both plain-string descriptions and structured ADF JSON.
 */
function adfToPlainText(node: any): string {
  if (!node) return "";
  if (typeof node === "string") return node;

  // Text leaf node
  if (node.type === "text") {
    return node.text ?? "";
  }

  // Recurse into content array
  if (Array.isArray(node.content)) {
    const parts = node.content.map(adfToPlainText);

    // Add newlines between block-level nodes
    const blockTypes = new Set([
      "paragraph",
      "heading",
      "bulletList",
      "orderedList",
      "listItem",
      "blockquote",
      "codeBlock",
      "rule",
    ]);
    if (blockTypes.has(node.type)) {
      return parts.join("") + "\n";
    }
    return parts.join("");
  }

  return "";
}

/**
 * Parse a Jira description field — handles both plain markdown strings
 * and structured ADF objects.
 */
function parseDescription(desc: any): string {
  if (!desc) return "";
  if (typeof desc === "string") return desc;
  if (typeof desc === "object" && desc.type === "doc") {
    return adfToPlainText(desc).trim();
  }
  return String(desc);
}

/**
 * Derive a module name from Jira labels by filtering out generic labels.
 * Returns the first meaningful label or undefined.
 */
function deriveModule(labels: string[]): string | undefined {
  const meaningful = labels.filter((l) => !GENERIC_LABELS.has(l.toLowerCase()));
  return meaningful.length > 0 ? meaningful[0] : undefined;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * List all accessible Jira projects.
 */
export async function listProjects(): Promise<JiraProject[]> {
  const data = await jiraFetch<any[]>("/rest/api/3/project");
  return data.map((p) => ({ key: p.key, name: p.name }));
}

/**
 * Fetch test case issues from a Jira project.
 * Filters to issue type "Test Case" when available, otherwise fetches all.
 */
export async function fetchTestCases(
  projectKey: string,
  maxResults: number = 100
): Promise<JiraIssue[]> {
  const fields = ["summary", "description", "labels", "issuetype"];

  let data: any;
  try {
    data = await jiraSearch(
      `project = "${projectKey}" AND issuetype = "Test Case" ORDER BY created DESC`,
      fields,
      maxResults
    );
  } catch (err) {
    // If "Test Case" type doesn't exist, fall back to all non-Epic issues
    console.log(`[Jira] "Test Case" type not found, falling back to all issues`);
    data = await jiraSearch(
      `project = "${projectKey}" AND issuetype != Epic ORDER BY created DESC`,
      fields,
      maxResults
    );
  }

  return (data.issues ?? []).map((issue: any) => ({
    key: issue.key,
    summary: issue.fields.summary ?? "",
    description: parseDescription(issue.fields.description),
    labels: issue.fields.labels ?? [],
    issueType: issue.fields.issuetype?.name ?? "Unknown",
  }));
}

/**
 * Fetch a single Jira issue by key (e.g., "QA-1428" or "PROJ-123").
 */
export async function fetchIssue(issueKey: string): Promise<JiraIssue> {
  const fields = "summary,description,labels,issuetype";
  const data = await jiraFetch<any>(`/rest/api/3/issue/${issueKey}?fields=${fields}`);

  return {
    key: data.key,
    summary: data.fields.summary ?? "",
    description: parseDescription(data.fields.description),
    labels: data.fields.labels ?? [],
    issueType: data.fields.issuetype?.name ?? "Unknown",
  };
}

/**
 * Convert a Jira issue into a TestCase for the embedding pipeline.
 * Uses summary as text and derives module from labels.
 */
export function issueToTestCase(issue: JiraIssue): TestCase {
  const tc: TestCase = { text: issue.summary };
  const mod = deriveModule(issue.labels);
  if (mod) {
    tc.module = mod;
  }
  return tc;
}

/**
 * Convert a Jira issue into a combined search query string.
 * Merges summary + description for richer semantic matching.
 */
export function issueToSearchText(issue: JiraIssue): string {
  const parts = [issue.summary];
  if (issue.description) {
    parts.push(issue.description);
  }
  return parts.join(". ");
}

/**
 * Fetch non-subtask issue types for a Jira project.
 */
export async function fetchIssueTypes(
  projectKey: string
): Promise<JiraIssueType[]> {
  const data = await jiraFetch<any>(`/rest/api/3/project/${projectKey}`);
  const types = (data.issueTypes ?? []) as any[];
  return types
    .filter((t: any) => !t.subtask)
    .map((t: any) => ({
      id: t.id,
      name: t.name,
      subtask: t.subtask ?? false,
    }));
}

/**
 * Fetch tickets of a specific type from a Jira project (for dropdown).
 */
export async function fetchTicketsByType(
  projectKey: string,
  issueTypeName: string,
  maxResults: number = 50
): Promise<JiraTicketSummary[]> {
  const data = await jiraSearch(
    `project = "${projectKey}" AND issuetype = "${issueTypeName}" ORDER BY created DESC`,
    ["summary"],
    maxResults
  );

  return (data.issues ?? []).map((issue: any) => ({
    key: issue.key,
    summary: issue.fields.summary ?? "",
  }));
}

/**
 * Fetch test cases linked to a parent ticket (Epic, Test Plan, etc.).
 * Uses "Epic Link" OR parent relationship with Test Case filter.
 */
export async function fetchTestCasesUnderTicket(
  parentKey: string,
  maxResults: number = 200
): Promise<JiraIssue[]> {
  const fields = ["summary", "description", "labels", "issuetype"];

  let data: any;
  try {
    data = await jiraSearch(
      `("Epic Link" = "${parentKey}" OR parent = "${parentKey}") AND issuetype = "Test Case" ORDER BY created DESC`,
      fields,
      maxResults
    );
  } catch {
    // Fallback: all children without Test Case filter
    data = await jiraSearch(
      `("Epic Link" = "${parentKey}" OR parent = "${parentKey}") ORDER BY created DESC`,
      fields,
      maxResults
    );
  }

  return (data.issues ?? []).map((issue: any) => ({
    key: issue.key,
    summary: issue.fields.summary ?? "",
    description: parseDescription(issue.fields.description),
    labels: issue.fields.labels ?? [],
    issueType: issue.fields.issuetype?.name ?? "Unknown",
  }));
}

/**
 * Parse a Jira issue key from various input formats:
 * - "QA-123"
 * - "https://seekout.atlassian.net/browse/QA-123"
 * - "seekout.atlassian.net/browse/QA-123"
 */
export function parseIssueKey(input: string): string {
  const trimmed = input.trim();

  // Try to extract from URL
  const urlMatch = trimmed.match(/\/browse\/([A-Z][A-Z0-9]+-\d+)/i);
  if (urlMatch) {
    return urlMatch[1].toUpperCase();
  }

  // Direct key format
  const keyMatch = trimmed.match(/^([A-Z][A-Z0-9]+-\d+)$/i);
  if (keyMatch) {
    return keyMatch[1].toUpperCase();
  }

  throw new Error(
    `Invalid Jira issue key: "${trimmed}". Expected format: QA-123 or https://site.atlassian.net/browse/QA-123`
  );
}
