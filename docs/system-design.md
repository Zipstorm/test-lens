# Test Lens -- System Design Document

**AI-Powered Regression Test Selector**
Hackathon Proof of Concept

---

## Table of Contents

1. [Overview & Problem Statement](#1-overview--problem-statement)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Backend Architecture](#3-backend-architecture)
4. [Data Import Pipelines](#4-data-import-pipelines)
5. [Search & Analysis Pipeline](#5-search--analysis-pipeline)
6. [Embedding Strategy](#6-embedding-strategy)
7. [Vector Store Design](#7-vector-store-design)
8. [LLM Integration](#8-llm-integration)
9. [Jira Integration](#9-jira-integration)
10. [Xray Integration](#10-xray-integration)
11. [Frontend Architecture](#11-frontend-architecture)
12. [Infrastructure](#12-infrastructure)
13. [Known Limitations & Future Work](#13-known-limitations--future-work)

---

## 1. Overview & Problem Statement

**Test Lens** is an AI-powered regression test selector that helps QA engineers answer a critical question: *given a code change described as a user story, which existing test cases are most relevant to run?*

### The Problem

Manual test triage is a bottleneck in the regression testing workflow. When a developer writes a user story or a change request comes in, QA engineers must manually sift through hundreds or thousands of test cases to decide which ones to include in the regression cycle. This process is:

- **Slow** -- experienced QA engineers spend significant time reading through test suites to identify relevant cases.
- **Error-prone** -- human triage inevitably misses edge cases, especially when test suites span multiple modules or teams.
- **Opaque** -- coverage gaps are invisible until a defect escapes to production.
- **Inconsistent** -- different engineers apply different criteria, leading to unpredictable test coverage.

### The Solution

Test Lens uses **semantic search** combined with **LLM-based analysis** to automate regression test selection. The system:

1. **Ingests test cases** from CSV/XLSX files, Jira, or Xray Cloud into a vector database.
2. **Embeds** each test case using OpenAI's `text-embedding-3-small` model, capturing semantic meaning rather than relying on keyword matching.
3. **Searches** the vector space to find test cases semantically similar to a user story.
4. **Analyzes** the matches using Anthropic Claude to produce relevance ratings, risk scores, and explanations.
5. **Identifies coverage gaps** by asking Claude to suggest new test cases that should exist but do not.

---

## 2. High-Level Architecture

Test Lens follows a **three-tier architecture**: a Next.js frontend, an Express.js backend, and a set of external services.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js :3001)                 │
│  React 19 + Tailwind CSS 4 + TypeScript                        │
│  next.config.ts rewrites /api/* → backend                      │
└──────────────────────────┬──────────────────────────────────────┘
                           │  HTTP (JSON)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Backend (Express :3000)                  │
│  TypeScript + Node.js 20                                       │
│  Routes: upload, search, jira                                  │
│  Services: parser, embedder, vectorStore, llm, jira, xray      │
└───────┬───────────┬──────────────┬──────────┬───────────────────┘
        │           │              │          │
        ▼           ▼              ▼          ▼
   ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐
   │ OpenAI  │ │ Pinecone │ │ Anthropic│ │ Jira Cloud   │
   │ Embed   │ │ Vector   │ │ Claude   │ │ REST API v3  │
   │ API     │ │ Database │ │ Haiku    │ ├──────────────┤
   └─────────┘ └──────────┘ └──────────┘ │ Xray Cloud   │
                                          │ GraphQL API  │
                                          └──────────────┘
```

### Communication Flow

The frontend never talks directly to external services. All API calls go through the Next.js rewrite proxy, which forwards requests to the Express backend:

**`frontend/next.config.ts`**:
```typescript
const backendUrl = process.env.BACKEND_URL || "http://localhost:3000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};
```

- **Local development**: Frontend at `:3001` proxies `/api/*` to `http://localhost:3000/api/*`.
- **Docker**: Frontend uses `http://backend:3000` (Docker Compose service name resolution).

### Docker Compose Orchestration

The entire system runs with `docker compose up`:

```yaml
services:
  backend:
    build: ./backend
    ports: ["3000:3000"]
    env_file: ./backend/.env

  frontend:
    build: ./frontend
    ports: ["3001:3001"]
    environment:
      - BACKEND_URL=http://backend:3000
    depends_on:
      - backend
```

---

## 3. Backend Architecture

The backend is an Express.js application written in TypeScript, organized into routes (HTTP layer) and services (business logic).

### Entry Point

**`backend/src/server.ts`** initializes the Pinecone connection at startup, then mounts three route modules:

```typescript
async function main() {
  await initIndex();           // Connect to Pinecone before accepting requests

  const app = express();
  app.use(express.json());

  app.use("/api/upload", uploadRouter);
  app.use("/api/search", searchRouter);
  app.use("/api/jira", jiraRouter);

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.listen(3000);
}
```

### Route Modules

| Route File | Endpoints | Purpose |
|---|---|---|
| `backend/src/routes/upload.ts` | `POST /api/upload` | CSV/XLSX file upload, parse, embed, index |
| `backend/src/routes/search.ts` | `POST /api/search`, `POST /api/search/suggest` | Semantic search + LLM analysis, gap analysis |
| `backend/src/routes/jira.ts` | 7 endpoints (see below) | Jira project listing, issue fetching, import, Xray import |

**Jira route endpoints:**

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/jira/projects` | List accessible Jira projects |
| `GET` | `/api/jira/projects/:key/issues` | Preview test case issues (no indexing) |
| `GET` | `/api/jira/projects/:key/issue-types` | List non-subtask issue types |
| `GET` | `/api/jira/projects/:key/tickets` | List tickets by issue type (dropdown) |
| `POST` | `/api/jira/import` | Import Jira issues into Pinecone |
| `POST` | `/api/jira/xray-import` | Import Xray tests into Pinecone |
| `GET` | `/api/jira/issue/:key` | Fetch single issue for search preview |

### Service Modules (6 total)

#### 1. Parser (`backend/src/services/parser.ts`)

Handles CSV and XLSX parsing with flexible column detection. Uses the `xlsx` library to read any spreadsheet format.

**Column detection** searches headers for known variants:
```typescript
const DESCRIPTION_HEADERS = ["description", "title", "name", "test case", "test_case", "testcase"];
const MODULE_HEADERS = ["module", "component", "area", "category", "feature"];
```

**Embedding enrichment** prepends the module name in brackets to give the embedding model more semantic context:
```typescript
export function enrichForEmbedding(tc: TestCase): string {
  return tc.module ? `[${tc.module}] ${tc.text}` : tc.text;
}
// Example: { text: "Verify login", module: "Auth" } → "[Auth] Verify login"
```

#### 2. Embedder (`backend/src/services/embedder.ts`)

Wraps the OpenAI embeddings API. Uses `text-embedding-3-small` with an explicit `dimensions: 1536` parameter.

- **`embed(text)`** -- generates a single embedding vector for search queries.
- **`embedBatch(texts)`** -- generates embeddings for multiple texts, auto-chunking into batches of 2048 (the OpenAI per-request limit).

```typescript
const EMBEDDING_MODEL = "text-embedding-3-small";
const MAX_BATCH_SIZE = 2048;

export async function embed(text: string): Promise<number[]> {
  const response = await getClient().embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    dimensions: 1536,
  });
  return response.data[0].embedding;
}
```

#### 3. Vector Store (`backend/src/services/vectorStore.ts`)

Manages the Pinecone vector database. Provides three core operations:

- **`initIndex()`** -- connects to Pinecone at server startup. Must succeed or the process exits.
- **`buildIndex(vectors, testCases, source)`** -- upserts vectors in batches of 100. Uses SHA-256 hashing for deterministic IDs.
- **`queryIndex(vector, topK)`** -- finds the nearest neighbors by cosine similarity, returning `MatchResult[]` with all metadata fields.

**Deterministic deduplication** via content hashing:
```typescript
function hashId(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
}
```

Same test case text always produces the same vector ID, which means re-uploading the same file safely overwrites itself without creating duplicates, while different files accumulate alongside each other.

#### 4. LLM (`backend/src/services/llm.ts`)

Integrates Anthropic Claude Haiku for two tasks: relevance analysis and gap analysis.

- **`explainMatches(userStory, matches)`** -- analyzes each matched test case against the user story. Returns `ExplainResult[]` with relevance (high/medium/low), riskScore (1-5), and a textual reason. Max 1024 tokens.
- **`suggestTestCases(userStory, existingTests)`** -- identifies 3-5 new test cases that should exist. Returns `SuggestedTestCase[]` with title, steps (action/expected pairs), and rationale. Max 2048 tokens.

Both functions parse JSON responses from Claude, stripping markdown code fences if present, and validating the structure before returning.

#### 5. Jira Service (`backend/src/services/jira.ts`)

Handles all Jira REST API v3 communication. Uses Basic auth (email + API token, Base64-encoded).

Key functions:
- **`listProjects()`** -- lists all accessible projects.
- **`fetchTestCases(projectKey)`** -- fetches issues of type "Test Case" (falls back to all non-Epic issues if that type does not exist).
- **`fetchTestCasesUnderTicket(parentKey)`** -- fetches child issues via Epic Link or parent relationship.
- **`fetchIssue(issueKey)`** -- fetches a single issue for search input.
- **`issueToTestCase(issue)`** -- converts a Jira issue to a `TestCase` for the embedding pipeline.
- **`issueToSearchText(issue)`** -- merges summary + description for richer semantic search queries.

Includes a recursive **ADF parser** that converts Atlassian Document Format JSON to plain text, handling paragraphs, headings, lists, blockquotes, and code blocks.

#### 6. Xray Service (`backend/src/services/xray.ts`)

Communicates with Xray Cloud's GraphQL API. Uses OAuth2 client credentials for authentication.

Key functions:
- **`fetchXrayTests(projectKey)`** -- fetches all tests for a project with full step and precondition data.
- **`fetchXrayTestsByJql(jql)`** -- fetches tests matching a custom JQL query (for Epic children, etc.).
- **`fetchXrayTestsForTestPlan(testPlanKey)`** -- fetches tests linked to a specific Test Plan.
- **`xrayTestToTestCase(test)`** -- converts an Xray test to a `TestCase` with rich metadata.
- **`xrayTestToRichText(test)`** -- builds a comprehensive text representation combining summary, description, preconditions, steps, and gherkin.

---

## 4. Data Import Pipelines

Test Lens supports three data import sources. All three converge into the same embedding and indexing pipeline.

### Pipeline 1: CSV/XLSX Upload

```
User uploads file
       │
       ▼
multer (disk storage, 10MB limit, .csv/.xlsx/.xls only)
       │
       ▼
parseFile() ─── xlsx library reads file
       │         flexible column detection (description/title/name variants)
       ▼
enrichForEmbedding() ─── prepends [Module] to text
       │
       ▼
embedBatch() ─── OpenAI text-embedding-3-small (chunks of 2048)
       │
       ▼
buildIndex() ─── Pinecone upsert (batches of 100)
       │           ID = SHA-256(text).slice(0,16)
       ▼           source = "filename.csv"
  Temp file deleted
```

**Source tag format:** `"sample-tests.csv"` (original filename)

### Pipeline 2: Jira Import

```
User selects project (+ optional parent ticket)
       │
       ▼
fetchTestCases() or fetchTestCasesUnderTicket()
       │   POST /rest/api/3/search/jql
       │   JQL: project = "KEY" AND issuetype = "Test Case"
       ▼
issueToTestCase() ─── summary → text, labels → module
       │                 (filters generic labels: qa, automated, manual, regression, smoke)
       ▼
enrichForEmbedding() → embedBatch() → buildIndex()
```

**Source tag format:** `"jira:QA"` or `"jira:QA:EPIC-123"` (with parent ticket)

### Pipeline 3: Xray Import

```
User selects project (+ optional parent ticket)
       │
       ▼
OAuth2 authenticate ─── POST xray.cloud.getxray.app/api/v2/authenticate
       │                  token cached 23hr (5min buffer)
       ▼
GraphQL getTests (paginated, 100/page)
       │   Three query modes:
       │   1. By project: jql "project = KEY"
       │   2. By JQL: custom query for Epic children
       │   3. By Test Plan: getTestPlans → tests() relationship
       ▼
xrayTestToTestCase()
       │   text = xrayTestToRichText() ─── summary + description + preconditions + steps + gherkin
       │   module = folder path ("Workspace > Login") or first meaningful label
       │   metadata = { issueKey, testType, folder, labels, description,
       │                steps (JSON), preconditions (JSON), gherkin, unstructured }
       ▼
enrichForEmbedding() → embedBatch() → buildIndex()
```

**Source tag format:** `"xray:QA"` or `"xray:QA:TEST-PLAN-456"` (with parent ticket)

### Convergence Point

All three pipelines share the same downstream steps:

```
TestCase[] → enrichForEmbedding() → embedBatch() → buildIndex()
```

This means the vector index can contain test cases from mixed sources (CSV files, Jira issues, and Xray tests all coexist in the same Pinecone namespace).

---

## 5. Search & Analysis Pipeline

The search pipeline takes a user story (as free text or a Jira issue key) and returns ranked, analyzed test case recommendations.

```
Input: user story text OR Jira issue key
       │
       ├─── If Jira key: parseIssueKey() → fetchIssue() → issueToSearchText()
       │    (merges summary + description for richer query)
       ▼
embed(searchText) ─── single vector via OpenAI
       │
       ▼
queryIndex(vector, topK) ─── Pinecone cosine similarity
       │                       returns MatchResult[] with scores and all metadata
       ▼
explainMatches(story, matches) ─── Claude Haiku analysis
       │   Prompt includes user story + matched test cases with:
       │   - cosine similarity scores
       │   - module, testType, issueKey
       │   - formatted steps (action | data | expected)
       │   - formatted preconditions
       │   - gherkin snippets (first 300 chars)
       │
       │   Returns ExplainResult[] with:
       │   - relevance: "high" | "medium" | "low"
       │   - riskScore: 1-5
       │   - reason: explanation text
       ▼
Gap analysis (on-demand):
suggestTestCases(story, existingTests) ─── Claude Haiku
       │   Analyzes user story against existing test list
       │   Returns 3-5 SuggestedTestCase[] with:
       │   - title
       │   - steps: [{action, expected}]
       │   - rationale
       ▼
Frontend renders results sorted by relevance
```

### Search Input Flexibility

The search endpoint (`POST /api/search`) accepts either:
- **`userStory`** (string) -- free-text description of a change.
- **`jiraKey`** (string) -- a Jira issue key (e.g., `"QA-123"`) or a full Jira URL. The backend fetches the issue and uses its summary + description as the search query.

---

## 6. Embedding Strategy

### Model Selection

Test Lens uses OpenAI's `text-embedding-3-small` model with an explicitly set dimension of **1536**:

```typescript
const response = await getClient().embeddings.create({
  model: "text-embedding-3-small",
  input: text,
  dimensions: 1536,
});
```

The `dimensions: 1536` parameter is explicitly specified (rather than relying on the default) to ensure consistency between embedding calls and the Pinecone index configuration.

### Text Enrichment

Raw test case descriptions alone can lack context. The enrichment strategy prepends module information in brackets:

| Input | Enriched Text |
|---|---|
| `{ text: "Verify login works", module: "Auth" }` | `[Auth] Verify login works` |
| `{ text: "Verify login works" }` | `Verify login works` |

This gives the embedding model additional semantic signal about the functional area, improving retrieval precision when user stories mention specific modules.

### Xray Rich Text

Xray tests receive particularly rich embeddings. The `xrayTestToRichText()` function combines all available structured data into a single text:

```typescript
export function xrayTestToRichText(test: XrayTest): string {
  const parts: string[] = [];
  parts.push(test.summary);
  if (test.description) parts.push(test.description);
  for (const pc of test.preconditions) {
    if (pc.definition) parts.push(`Precondition: ${pc.definition}`);
  }
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
  if (test.gherkin) parts.push(test.gherkin);
  if (test.unstructured) parts.push(test.unstructured);
  return parts.join(". ");
}
```

This means an Xray embedding captures not just "what" a test checks but "how" it checks it (the specific steps, expected results, and preconditions), leading to much more precise semantic matching.

### Batching

The embedder chunks inputs into batches of 2048 texts per OpenAI API call, handling large imports efficiently:

```typescript
for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
  const batch = texts.slice(i, i + MAX_BATCH_SIZE);
  const response = await getClient().embeddings.create({ ... });
  // Results sorted by index to maintain order
}
```

---

## 7. Vector Store Design

### Pinecone Configuration

| Property | Value |
|---|---|
| Index name | `testlens` |
| Dimensions | 1536 |
| Similarity metric | Cosine |

### ID Generation

Vector IDs are generated deterministically from the test case text content:

```typescript
function hashId(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
}
```

This design has three important properties:
1. **Deterministic** -- same text always produces the same ID.
2. **Deduplication** -- re-uploading the same file overwrites existing vectors (same IDs).
3. **Accumulation** -- different test cases from different sources get different IDs and coexist.

### Batch Upsert

Vectors are upserted in batches of 100 per Pinecone API call:

```typescript
const BATCH_SIZE = 100;
for (let i = 0; i < vectors.length; i += BATCH_SIZE) {
  const batch = vectors.slice(i, i + BATCH_SIZE).map((values, j) => ({
    id: hashId(tc.text),
    values,
    metadata,
  }));
  await index.upsert(batch);
}
```

### Metadata Schema

Each vector carries up to 12 metadata fields:

| Field | Type | Source | Description |
|---|---|---|---|
| `text` | string | All | The test case text (enriched for Xray) |
| `module` | string | All | Functional area (from headers, labels, or folders) |
| `source` | string | All | Origin identifier (filename, `jira:KEY`, `xray:KEY`) |
| `issueKey` | string | Jira/Xray | Jira issue key (e.g., `QA-1428`) |
| `testType` | string | Xray | Test type: Manual, Cucumber, Generic |
| `folder` | string | Xray | Xray folder path |
| `labels` | string | Xray | Comma-separated Jira labels |
| `description` | string | Xray | Full issue description text |
| `steps` | string (JSON) | Xray | `[{action, data, result}]` |
| `preconditions` | string (JSON) | Xray | `[{key, definition}]` |
| `gherkin` | string | Xray | Gherkin/Cucumber scenario text |
| `unstructured` | string | Xray | Generic/unstructured test definition |

---

## 8. LLM Integration

### Model

Test Lens uses **Anthropic Claude Haiku** (`claude-haiku-4-5-20251001`) for all LLM tasks. Claude Haiku was chosen for its balance of speed, cost, and reasoning quality -- ideal for a hackathon POC where fast iteration matters.

### Relevance Analysis (`explainMatches`)

**Prompt structure:**

```
You are a QA engineer analyzing which regression test cases are relevant to a user story.

User Story:
"{userStory}"

Matched Test Cases (with similarity scores and structured details):
1. [score: 0.872, module: Auth, type: Manual, key: QA-1428]
   Summary: Verify user can log in with valid credentials
   Steps:
   Step 1: Navigate to login page | Data: https://app.example.com | Expected: Login form displayed
   Step 2: Enter valid credentials | Data: user@test.com / Password123 | Expected: Fields populated
   Preconditions: [QA-1400] User account exists with valid credentials

For each test case, determine:
- relevance: "high", "medium", or "low"
- riskScore: 1-5 (5 = highest risk if this test is skipped)
- reason: A brief explanation

Respond ONLY with a valid JSON array.
```

**Response parsing:** Strips ```` ```json ```` fences, parses JSON, validates:
- `relevance` is one of `"high"`, `"medium"`, `"low"`
- `riskScore` is a number between 1 and 5
- `testCase` and `reason` are strings

After validation, the parsed results are enriched with metadata from the original Pinecone matches (source, issueKey, testType, folder, steps, preconditions).

**Token limit:** 1024 max tokens.

### Gap Analysis (`suggestTestCases`)

**Prompt structure:**

```
You are an experienced QA engineer. A developer has written the following user story
and the test suite already has these existing test cases.

User Story: "{userStory}"

Existing Test Cases:
1. Verify login with valid credentials
2. Verify login with invalid password
...

Analyze the user story and identify 3-5 NEW test cases that should be written.
Focus on:
- Edge cases and error scenarios
- Security and permission boundaries
- Negative testing (invalid inputs, unauthorized access)
- Integration points and data validation
- Accessibility and UX edge cases
```

**Response format:** JSON array of `[{title, steps: [{action, expected}], rationale}]`.

**Token limit:** 2048 max tokens.

---

## 9. Jira Integration

### Authentication

Jira Cloud uses **Basic authentication** with an email address and API token:

```typescript
const credentials = Buffer.from(`${email}:${apiToken}`).toString("base64");
// Header: Authorization: Basic <credentials>
```

Configuration is read from environment variables: `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`.

### Search API

Test Lens uses the **POST** endpoint for JQL searches:

```
POST /rest/api/3/search/jql
Content-Type: application/json

{ "jql": "project = \"QA\" AND issuetype = \"Test Case\"", "fields": [...], "maxResults": 100 }
```

The old `GET /rest/api/3/search` endpoint was removed by Atlassian (returns 410 Gone), which is why the POST variant is used exclusively.

### ADF Parser

Jira Cloud stores rich-text descriptions in Atlassian Document Format (ADF), a JSON tree structure. The `adfToPlainText()` function recursively traverses this tree:

```typescript
function adfToPlainText(node: any): string {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (node.type === "text") return node.text ?? "";

  if (Array.isArray(node.content)) {
    const parts = node.content.map(adfToPlainText);
    const blockTypes = new Set([
      "paragraph", "heading", "bulletList", "orderedList",
      "listItem", "blockquote", "codeBlock", "rule",
    ]);
    if (blockTypes.has(node.type)) return parts.join("") + "\n";
    return parts.join("");
  }
  return "";
}
```

### Issue Key Parsing

The `parseIssueKey()` function accepts multiple input formats:
- Direct key: `"QA-123"`
- Full URL: `"https://yoursite.atlassian.net/browse/QA-123"`
- Partial URL: `"yoursite.atlassian.net/browse/QA-123"`

It uses regex extraction (`/\/browse\/([A-Z][A-Z0-9]+-\d+)/i`) and normalizes to uppercase.

### Module Derivation

Modules are derived from Jira labels by filtering out generic ones:

```typescript
const GENERIC_LABELS = new Set(["qa", "automated", "manual", "regression", "smoke"]);

function deriveModule(labels: string[]): string | undefined {
  const meaningful = labels.filter((l) => !GENERIC_LABELS.has(l.toLowerCase()));
  return meaningful.length > 0 ? meaningful[0] : undefined;
}
```

---

## 10. Xray Integration

### Authentication

Xray Cloud uses **OAuth2 client credentials** flow:

```typescript
const res = await fetch("https://xray.cloud.getxray.app/api/v2/authenticate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
});

const token = await res.json(); // Response is a JSON string (quoted token)
cachedToken = token;
tokenExpiry = Date.now() + 23 * 60 * 60 * 1000; // ~23 hours
```

The token is **cached for 23 hours** with a 5-minute safety buffer before expiry. Xray tokens expire after 24 hours; the 23-hour cache ensures tokens are refreshed before they become invalid.

### GraphQL API

All Xray data is fetched via GraphQL at `https://xray.cloud.getxray.app/api/v2/graphql`.

### Three Query Modes

**1. By Project:**
```graphql
{
  getTests(jql: "project = 'QA' ORDER BY key ASC", limit: 100, start: 0) {
    total, start, limit
    results { issueId, testType { name kind }, steps { action data result },
              gherkin, unstructured, preconditions(limit: 10) { results { definition, jira(fields: ["key","summary"]) } },
              folder { name path }, jira(fields: ["key","summary","description","labels"]) }
  }
}
```

**2. By JQL (for Epic children):**
```graphql
getTests(jql: "\"Epic Link\" = \"EPIC-123\" OR parent = \"EPIC-123\"", ...)
```

**3. By Test Plan:**
```graphql
{
  getTestPlans(jql: "key = 'TP-456'", limit: 1) {
    results {
      issueId
      tests(limit: 100, start: 0) {
        total, start, limit
        results { ... same fields as above ... }
      }
    }
  }
}
```

If the Test Plan query returns no results, the system falls back to the JQL-based approach.

### Pagination

All GraphQL queries paginate automatically at 100 results per page:

```typescript
while (all.length < maxResults) {
  const batchLimit = Math.min(limit, maxResults - all.length);
  // ... execute query with start offset ...
  all.push(...results.map(parseResult));
  if (all.length >= total || results.length < batchLimit) break;
  start += batchLimit;
}
```

### Data Model

The `XrayTest` interface captures the full richness of Xray test data:

```typescript
export interface XrayTest {
  issueKey: string;         // e.g., "QA-1428"
  summary: string;          // Issue summary
  description: string;      // Full description
  testType: string;         // "Manual" | "Cucumber" | "Generic"
  folder: string | null;    // e.g., "/Workspace/Search"
  labels: string[];         // Jira labels
  steps: { action: string; data: string; result: string }[];
  preconditions: { key: string; definition: string }[];
  gherkin: string | null;   // Cucumber scenario
  unstructured: string | null; // Generic test definition
}
```

### Module Derivation

For Xray tests, modules are derived with folder paths taking priority:

```typescript
if (test.folder) {
  // "/Workspace/Search" → "Workspace > Search"
  const folderName = test.folder.replace(/^\/+/, "").replace(/\//g, " > ");
  if (folderName) tc.module = folderName;
} else {
  // Fall back to first meaningful label
  const meaningful = test.labels.filter((l) => !generic.has(l.toLowerCase()));
  if (meaningful.length > 0) tc.module = meaningful[0];
}
```

---

## 11. Frontend Architecture

### Technology Stack

- **Next.js 16** -- React framework with file-system routing and API rewrites.
- **React 19** -- UI rendering with hooks-based state management.
- **Tailwind CSS 4** -- Utility-first CSS framework.
- **TypeScript** -- End-to-end type safety.

### Component Architecture

All components are client components (`"use client"`) since the application is interactive and state-driven.

```
layout.tsx
  └── page.tsx (state owner)
        ├── Header (title + dark mode toggle)
        ├── TabNav (Upload | Jira Import | Search)
        │
        ├── [Upload tab]
        │   └── UploadSection
        │       └── FileDropZone (drag-and-drop + click-to-upload)
        │
        ├── [Jira Import tab]
        │   └── JiraImportSection
        │       ├── Project picker (dropdown)
        │       ├── Import source radio (Jira / Xray)
        │       ├── Issue type filter (Epic, Test Plan, Test Set)
        │       └── Ticket picker (dropdown, scoped to selected type)
        │
        └── [Search tab]
            ├── SearchSection (free text + Jira key input)
            ├── ResultsSection
            │   └── ResultCard (per test case)
            │       ├── RelevanceBadge (high/medium/low with color coding)
            │       └── RiskScore (1-5 visual indicator)
            └── SuggestionsSection (gap analysis results)
                └── "Append to TMS" button (placeholder)
```

### State Management

The root `page.tsx` component holds all application state and passes callback functions down to children:

```typescript
export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("upload");
  const [isUploaded, setIsUploaded] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchStatus, setSearchStatus] = useState<"idle" | "searching" | "done" | "error">("idle");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [lastQuery, setLastQuery] = useState("");
  // ...
}
```

This "state lives at the root" pattern is simple and appropriate for a single-page POC. There is no Redux, Zustand, or other state management library -- React's built-in `useState` is sufficient.

### Dark Mode

Dark mode is implemented with Tailwind's class-based strategy:

1. **`layout.tsx`** includes an inline script that runs before React hydration to set the `dark` class on `<html>`, preventing a flash of incorrect theme.
2. **`Header`** component provides a toggle button that adds/removes the `dark` class and persists the preference in `localStorage`.
3. All components use Tailwind's `dark:` variant classes (e.g., `dark:bg-slate-900`, `dark:text-white`).

```typescript
// layout.tsx -- inline script prevents flash of wrong theme
<script dangerouslySetInnerHTML={{ __html: `
  try {
    if (localStorage.getItem('theme') === 'dark' ||
        (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    }
  } catch (e) {}
` }} />
```

### API Client

The `frontend/src/lib/api.ts` module provides typed wrapper functions for all backend endpoints:

| Function | Backend Endpoint | Purpose |
|---|---|---|
| `uploadFile(file)` | `POST /api/upload` | Upload CSV/XLSX |
| `searchTestCases(userStory, topK)` | `POST /api/search` | Free-text search |
| `searchByJiraKey(jiraKey, topK)` | `POST /api/search` | Jira-key search |
| `fetchJiraProjects()` | `GET /api/jira/projects` | Project dropdown |
| `fetchIssueTypes(projectKey)` | `GET /api/jira/projects/:key/issue-types` | Issue type dropdown |
| `fetchTicketsByType(projectKey, issueType)` | `GET /api/jira/projects/:key/tickets` | Ticket dropdown |
| `importFromJira(projectKey, maxResults, parentTicketKey?)` | `POST /api/jira/import` | Jira import |
| `importFromXray(projectKey, maxResults, parentTicketKey?)` | `POST /api/jira/xray-import` | Xray import |
| `fetchJiraIssue(issueKey)` | `GET /api/jira/issue/:key` | Issue preview |
| `suggestTestCases(userStory, existingTests)` | `POST /api/search/suggest` | Gap analysis |
| `checkHealth()` | `GET /api/health` | Health check |

### Type Definitions

Shared types are defined in `frontend/src/types/index.ts`:

```typescript
export interface SearchResult {
  testCase: string;
  relevance: "high" | "medium" | "low";
  riskScore: number;
  reason: string;
  issueKey?: string;
  testType?: string;
  folder?: string;
  steps?: string;
  preconditions?: string;
}

export interface SuggestedTestCase {
  title: string;
  steps: { action: string; expected: string }[];
  rationale: string;
}
```

---

## 12. Infrastructure

### Docker Compose

The application is fully containerized with two services:

```yaml
services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    env_file:
      - ./backend/.env
    environment:
      - PORT=3000
    restart: unless-stopped

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "3001:3001"
    environment:
      - BACKEND_URL=http://backend:3000
    depends_on:
      - backend
    restart: unless-stopped
```

Key design decisions:
- **`depends_on`** ensures the backend starts before the frontend.
- **`env_file`** keeps secrets (API keys) in a `.env` file that is not committed to git.
- **`BACKEND_URL=http://backend:3000`** uses Docker's internal DNS for service-to-service communication.

### Local Development

For development without Docker:

```bash
# Terminal 1: Backend
cd backend && npm run dev    # ts-node-dev watches for changes, port 3000

# Terminal 2: Frontend
cd frontend && npm run dev   # Next.js dev server, port 3001
```

### CLI Tool

The backend includes an interactive CLI (`backend/src/cli.ts`) for testing and debugging without the frontend. It provides a menu-driven interface with color-coded output:

```
╔══════════════════════════════════════╗
║          TEST LENS CLI               ║
║   AI-Powered Regression Test Selector║
╚══════════════════════════════════════╝

Choose an action:
  1) upload       -- Index test cases from a CSV/XLSX file
  2) jira-import  -- Import test cases from a Jira project
  3) xray-import  -- Import from Xray (with steps & preconditions)
  4) search       -- Find relevant tests for a user story
  5) jira-search  -- Find relevant tests from a Jira issue key
  6) exit         -- Quit
```

The CLI uses ANSI color codes for relevance highlighting (red for high, yellow for medium, green for low) and block-character risk bars.

### Environment Variables

| Variable | Service | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | Backend | OpenAI embeddings |
| `PINECONE_API_KEY` | Backend | Pinecone vector database |
| `PINECONE_INDEX_NAME` | Backend | Pinecone index name (`testlens`) |
| `ANTHROPIC_API_KEY` | Backend | Claude Haiku LLM |
| `JIRA_BASE_URL` | Backend | Jira Cloud instance URL |
| `JIRA_EMAIL` | Backend | Jira account email |
| `JIRA_API_TOKEN` | Backend | Jira API token |
| `XRAY_CLIENT_ID` | Backend | Xray Cloud OAuth2 client ID |
| `XRAY_CLIENT_SECRET` | Backend | Xray Cloud OAuth2 client secret |
| `PORT` | Backend | Server port (default: 3000) |
| `BACKEND_URL` | Frontend | Backend URL for API proxy |

---

## 13. Known Limitations & Future Work

### Current Limitations

| Limitation | Description |
|---|---|
| **No authentication** | The backend API has no auth middleware. Anyone with network access can call any endpoint. |
| **No persistent storage** | Test case data lives only in Pinecone vectors. There is no relational database for users, projects, or import history. |
| **Single-user model** | No multi-tenancy. All users share the same Pinecone index with no namespace separation. |
| **No test result tracking** | The system recommends tests but does not track execution results or pass/fail history. |
| **"Append to TMS" placeholder** | The button to push suggested test cases back to Xray/Jira is a UI placeholder (not yet implemented). |
| **Issue type filter** | The frontend limits the Jira issue type filter dropdown to Epic, Test Plan, and Test Set. Other issue types are not shown. |
| **No incremental sync** | Each import is a full fetch. There is no delta-sync or webhook-based update mechanism. |
| **Single Pinecone namespace** | All vectors share one namespace; there is no per-project or per-team isolation. |

### Future Work

- **TMS write-back** -- implement the "Append to TMS" flow to create Xray test cases directly from suggested tests.
- **Authentication and RBAC** -- add user authentication and role-based access control for team use.
- **Persistent metadata store** -- add a database (PostgreSQL) to track import history, user preferences, and analytics.
- **Incremental sync** -- use Jira/Xray webhooks to keep the vector index up-to-date as test cases are added or modified.
- **Multi-tenancy** -- use Pinecone namespaces or separate indexes per team/project.
- **Test execution integration** -- connect to CI/CD pipelines to track which recommended tests were run and their outcomes.
- **Confidence calibration** -- use historical pass/fail data to calibrate the LLM's risk scores over time.
- **Bulk search** -- allow uploading a batch of user stories and generating test recommendations for an entire sprint.

---

## Appendix: File Structure

```
test-lens/
├── docker-compose.yml
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env                          # API keys (not committed)
│   ├── .env.example
│   ├── src/
│   │   ├── server.ts                 # Express entry point
│   │   ├── cli.ts                    # Interactive CLI tool
│   │   ├── routes/
│   │   │   ├── upload.ts             # POST /api/upload
│   │   │   ├── search.ts            # POST /api/search, POST /api/search/suggest
│   │   │   └── jira.ts              # 7 Jira/Xray endpoints
│   │   └── services/
│   │       ├── parser.ts            # CSV/XLSX parsing + enrichment
│   │       ├── embedder.ts          # OpenAI embedding generation
│   │       ├── vectorStore.ts       # Pinecone CRUD operations
│   │       ├── llm.ts              # Claude Haiku integration
│   │       ├── jira.ts             # Jira REST API v3 client
│   │       └── xray.ts            # Xray Cloud GraphQL client
│   ├── test-data/
│   │   ├── sample-tests.csv
│   │   └── sample-user-stories.json
│   └── uploads/                     # Temporary upload directory
└── frontend/
    ├── Dockerfile
    ├── package.json
    ├── next.config.ts               # API proxy rewrites
    ├── tsconfig.json
    └── src/
        ├── app/
        │   ├── layout.tsx           # Root layout + dark mode script
        │   ├── page.tsx             # Main page (state owner)
        │   └── globals.css          # Tailwind CSS imports
        ├── components/
        │   ├── Header.tsx           # Title + dark mode toggle
        │   ├── UploadSection.tsx    # File upload tab
        │   ├── FileDropZone.tsx     # Drag-and-drop file input
        │   ├── JiraImportSection.tsx # Jira/Xray import tab
        │   ├── SearchSection.tsx    # Search input tab
        │   ├── ResultsSection.tsx   # Search results display
        │   ├── ResultCard.tsx       # Individual result card
        │   ├── RelevanceBadge.tsx   # High/Medium/Low badge
        │   ├── RiskScore.tsx        # 1-5 risk indicator
        │   └── SuggestionsSection.tsx # Gap analysis results
        ├── lib/
        │   └── api.ts              # Typed API client functions
        └── types/
            └── index.ts            # Shared TypeScript interfaces
```
