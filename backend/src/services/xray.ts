import type { TestCase } from "./parser";

export interface XrayTest {
  issueKey: string;
  summary: string;
  description: string;
  testType: string; // "Manual" | "Cucumber" | "Generic"
  folder: string | null;
  labels: string[];
  steps: { action: string; data: string; result: string }[];
  preconditions: { key: string; definition: string }[];
  gherkin: string | null;
  unstructured: string | null;
}

// ---------------------------------------------------------------------------
// Auth — client_id + client_secret → bearer token (expires 24h)
// ---------------------------------------------------------------------------

let cachedToken: string | null = null;
let tokenExpiry = 0;

function getConfig() {
  const clientId = process.env.XRAY_CLIENT_ID;
  const clientSecret = process.env.XRAY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Xray is not configured. Set XRAY_CLIENT_ID and XRAY_CLIENT_SECRET in .env"
    );
  }

  return { clientId, clientSecret };
}

async function getToken(): Promise<string> {
  // Reuse token if still valid (with 5-min buffer)
  if (cachedToken && Date.now() < tokenExpiry - 5 * 60 * 1000) {
    return cachedToken;
  }

  const { clientId, clientSecret } = getConfig();

  const res = await fetch("https://xray.cloud.getxray.app/api/v2/authenticate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Xray auth failed (${res.status}): ${body}`);
  }

  // Response is a JSON string (quoted token)
  const token = (await res.json()) as string;
  cachedToken = token;
  tokenExpiry = Date.now() + 23 * 60 * 60 * 1000; // ~23 hours
  return token;
}

// ---------------------------------------------------------------------------
// GraphQL helper
// ---------------------------------------------------------------------------

async function gql<T = any>(query: string): Promise<T> {
  const token = await getToken();

  const res = await fetch("https://xray.cloud.getxray.app/api/v2/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Xray GraphQL error (${res.status}): ${body}`);
  }

  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) {
    throw new Error(`Xray GraphQL: ${json.errors[0].message}`);
  }
  return json.data as T;
}

// ---------------------------------------------------------------------------
// Fetch tests with rich data
// ---------------------------------------------------------------------------

const TESTS_QUERY = `
query GetTests($jql: String!, $limit: Int!, $start: Int!) {
  getTests(jql: $jql, limit: $limit, start: $start) {
    total
    start
    limit
    results {
      issueId
      testType { name kind }
      steps {
        action
        data
        result
      }
      gherkin
      unstructured
      preconditions(limit: 10) {
        results {
          definition
          jira(fields: ["key", "summary"])
        }
      }
      folder { name path }
      jira(fields: ["key", "summary", "description", "labels"])
    }
  }
}
`;

function parseResult(raw: any): XrayTest {
  const jira = raw.jira ?? {};
  return {
    issueKey: jira.key ?? "",
    summary: jira.summary ?? "",
    description: jira.description ?? "",
    testType: raw.testType?.name ?? "Unknown",
    folder: raw.folder?.path ?? null,
    labels: jira.labels ?? [],
    steps: (raw.steps ?? []).map((s: any) => ({
      action: s.action ?? "",
      data: s.data ?? "",
      result: s.result ?? "",
    })),
    preconditions: (raw.preconditions?.results ?? []).map((p: any) => ({
      key: p.jira?.key ?? "",
      definition: p.definition ?? "",
    })),
    gherkin: raw.gherkin ?? null,
    unstructured: raw.unstructured ?? null,
  };
}

/**
 * Fetch all Xray tests for a Jira project with full step/precondition data.
 * Paginates automatically (100 per page).
 */
export async function fetchXrayTests(
  projectKey: string,
  maxResults: number = 200
): Promise<XrayTest[]> {
  const all: XrayTest[] = [];
  let start = 0;
  const limit = Math.min(maxResults, 100);

  while (all.length < maxResults) {
    const batchLimit = Math.min(limit, maxResults - all.length);
    // GraphQL variables aren't supported in the simple query format,
    // so we inline the values safely (project key is validated)
    const safeKey = projectKey.replace(/[^A-Za-z0-9_-]/g, "");
    const query = `{
      getTests(jql: "project = '${safeKey}' ORDER BY key ASC", limit: ${batchLimit}, start: ${start}) {
        total
        start
        limit
        results {
          issueId
          testType { name kind }
          steps {
            action
            data
            result
          }
          gherkin
          unstructured
          preconditions(limit: 10) {
            results {
              definition
              jira(fields: ["key", "summary"])
            }
          }
          folder { name path }
          jira(fields: ["key", "summary", "description", "labels"])
        }
      }
    }`;

    const data = await gql<any>(query);
    const results = data.getTests?.results ?? [];
    const total = data.getTests?.total ?? 0;

    all.push(...results.map(parseResult));
    console.log(`[Xray] Fetched ${all.length}/${Math.min(total, maxResults)} tests`);

    if (all.length >= total || results.length < batchLimit) break;
    start += batchLimit;
  }

  return all;
}

/**
 * Fetch Xray tests matching a custom JQL query.
 * Useful for getting tests under an Epic or other parent ticket.
 */
export async function fetchXrayTestsByJql(
  jql: string,
  maxResults: number = 200
): Promise<XrayTest[]> {
  const all: XrayTest[] = [];
  let start = 0;
  const limit = Math.min(maxResults, 100);

  while (all.length < maxResults) {
    const batchLimit = Math.min(limit, maxResults - all.length);
    const escapedJql = jql.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const query = `{
      getTests(jql: "${escapedJql}", limit: ${batchLimit}, start: ${start}) {
        total
        start
        limit
        results {
          issueId
          testType { name kind }
          steps {
            action
            data
            result
          }
          gherkin
          unstructured
          preconditions(limit: 10) {
            results {
              definition
              jira(fields: ["key", "summary"])
            }
          }
          folder { name path }
          jira(fields: ["key", "summary", "description", "labels"])
        }
      }
    }`;

    const data = await gql<any>(query);
    const results = data.getTests?.results ?? [];
    const total = data.getTests?.total ?? 0;

    all.push(...results.map(parseResult));
    console.log(`[Xray] Fetched ${all.length}/${Math.min(total, maxResults)} tests (custom JQL)`);

    if (all.length >= total || results.length < batchLimit) break;
    start += batchLimit;
  }

  return all;
}

/**
 * Fetch Xray tests linked to a specific Test Plan.
 * Uses the getTestPlans GraphQL query with the test plan's issue key.
 */
export async function fetchXrayTestsForTestPlan(
  testPlanKey: string,
  maxResults: number = 200
): Promise<XrayTest[]> {
  const safeKey = testPlanKey.replace(/[^A-Za-z0-9_-]/g, "");
  const all: XrayTest[] = [];
  let start = 0;
  const limit = Math.min(maxResults, 100);

  while (all.length < maxResults) {
    const batchLimit = Math.min(limit, maxResults - all.length);
    const query = `{
      getTestPlans(jql: "key = '${safeKey}'", limit: 1) {
        results {
          issueId
          tests(limit: ${batchLimit}, start: ${start}) {
            total
            start
            limit
            results {
              issueId
              testType { name kind }
              steps {
                action
                data
                result
              }
              gherkin
              unstructured
              preconditions(limit: 10) {
                results {
                  definition
                  jira(fields: ["key", "summary"])
                }
              }
              folder { name path }
              jira(fields: ["key", "summary", "description", "labels"])
            }
          }
        }
      }
    }`;

    const data = await gql<any>(query);
    const testPlan = data.getTestPlans?.results?.[0];
    if (!testPlan) break;

    const results = testPlan.tests?.results ?? [];
    const total = testPlan.tests?.total ?? 0;

    all.push(...results.map(parseResult));
    console.log(`[Xray] Fetched ${all.length}/${Math.min(total, maxResults)} tests for plan ${testPlanKey}`);

    if (all.length >= total || results.length < batchLimit) break;
    start += batchLimit;
  }

  return all;
}

// ---------------------------------------------------------------------------
// Convert to TestCase for the embedding pipeline
// ---------------------------------------------------------------------------

/**
 * Build a rich text representation of an Xray test for embedding.
 * Includes steps, preconditions, gherkin — much richer than Jira summary alone.
 */
export function xrayTestToRichText(test: XrayTest): string {
  const parts: string[] = [];

  // Summary
  parts.push(test.summary);

  // Description (if present)
  if (test.description) {
    parts.push(test.description);
  }

  // Preconditions
  for (const pc of test.preconditions) {
    if (pc.definition) {
      parts.push(`Precondition: ${pc.definition}`);
    }
  }

  // Manual test steps
  if (test.steps.length > 0) {
    const stepTexts = test.steps.map((s, i) => {
      const stepParts = [`Step ${i + 1}:`];
      if (s.action) stepParts.push(s.action);
      if (s.data) stepParts.push(`Data: ${s.data}`);
      if (s.result) stepParts.push(`Expected: ${s.result}`);
      return stepParts.join(" ");
    });
    parts.push(stepTexts.join(". "));
  }

  // Gherkin (Cucumber tests)
  if (test.gherkin) {
    parts.push(test.gherkin);
  }

  // Unstructured / Generic tests
  if (test.unstructured) {
    parts.push(test.unstructured);
  }

  return parts.join(". ");
}

/**
 * Convert an Xray test to a TestCase for the embedding pipeline.
 * Uses folder path as module if available, otherwise first meaningful label.
 */
export function xrayTestToTestCase(test: XrayTest): TestCase {
  const tc: TestCase = { text: xrayTestToRichText(test) };

  // Module: prefer folder path, then labels
  if (test.folder) {
    // e.g., "/Workspace/Search" → "Workspace > Search"
    const folderName = test.folder
      .replace(/^\/+/, "")
      .replace(/\//g, " > ");
    if (folderName) tc.module = folderName;
  } else {
    const generic = new Set(["qa", "automated", "manual", "regression", "smoke"]);
    const meaningful = test.labels.filter((l) => !generic.has(l.toLowerCase()));
    if (meaningful.length > 0) tc.module = meaningful[0];
  }

  return tc;
}
