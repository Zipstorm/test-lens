# Test Lens Data Model

This document describes all TypeScript interfaces, the Pinecone metadata schema, and the data transformation chains used throughout Test Lens.

---

## Table of Contents

1. [Backend Interfaces](#backend-interfaces)
2. [Frontend Interfaces](#frontend-interfaces)
3. [Pinecone Metadata Schema](#pinecone-metadata-schema)
4. [Data Transformation Chains](#data-transformation-chains)

---

## Backend Interfaces

### TestCase (parser.ts)

Represents a single test case as parsed from a CSV/XLSX file.

```typescript
interface TestCase {
  text: string;           // Test case description (from the "Description" column)
  module?: string;        // Optional module grouping (from the "Module" column)
  metadata?: Record<string, string>; // Any additional columns as key-value pairs
}
```

**Column mapping rules:**

| Accepted Column Names | Maps To |
|-----------------------|---------|
| `Description`, `title`, `name`, `test case`, `test_case`, `testcase` | `text` |
| `Module`, `component`, `area`, `category`, `feature` | `module` |
| All other columns | `metadata[columnName]` |

---

### MatchResult (vectorStore.ts)

Represents a raw match returned from a Pinecone vector similarity query, before LLM enrichment.

```typescript
interface MatchResult {
  text: string;            // Original test case text
  module?: string;         // Module grouping
  source?: string;         // Source tag (e.g., "upload:file.csv", "jira:QA", "xray:QA")
  score: number;           // Cosine similarity score from Pinecone (0.0 - 1.0)
  issueKey?: string;       // Jira issue key (Jira/Xray imports only)
  testType?: string;       // Xray test type: "Manual", "Cucumber", or "Generic"
  folder?: string;         // Xray folder path (e.g., "/Workspace/Login")
  labels?: string;         // Comma-separated label string
  description?: string;    // Jira/Xray issue description
  steps?: string;          // JSON-serialized array of test steps
  preconditions?: string;  // JSON-serialized array of preconditions
  gherkin?: string;        // Gherkin feature text (Cucumber tests)
  unstructured?: string;   // Unstructured test definition (Generic tests)
}
```

---

### ExplainResult (llm.ts)

Represents a test case match after LLM analysis. The LLM assigns relevance, risk scoring, and a human-readable explanation.

```typescript
interface ExplainResult {
  testCase: string;                        // Test case description
  module?: string;                         // Module grouping
  source?: string;                         // Source tag
  issueKey?: string;                       // Jira issue key
  testType?: string;                       // Xray test type
  folder?: string;                         // Xray folder path
  steps?: string;                          // JSON string of test steps
  preconditions?: string;                  // JSON string of preconditions
  relevance: "high" | "medium" | "low";    // LLM-assigned relevance tier
  riskScore: number;                       // Risk score from 1 (low) to 5 (critical)
  reason: string;                          // LLM-generated explanation
}
```

**Relevance tiers:**

| Tier | Meaning |
|------|---------|
| `high` | Directly tests functionality described in the user story |
| `medium` | Related to the user story but tests adjacent or supporting functionality |
| `low` | Tangentially relevant; may be useful for regression context |

**Risk score scale:**

| Score | Level | Description |
|-------|-------|-------------|
| 1 | Minimal | Low-impact, cosmetic, or edge-case scenario |
| 2 | Low | Minor functionality, unlikely to affect core flows |
| 3 | Moderate | Noticeable impact on user experience or secondary flows |
| 4 | High | Core functionality at risk, significant user impact |
| 5 | Critical | Security, data loss, or complete feature failure |

---

### SuggestedTestCase (llm.ts)

Represents a test case suggested by the LLM during gap analysis.

```typescript
interface SuggestedTestCase {
  title: string;                                    // Suggested test case title
  steps: { action: string; expected: string }[];    // Ordered test steps
  rationale: string;                                // Why this test is needed
}
```

---

### JiraIssue (jira.ts)

Represents a Jira issue fetched from the Jira REST API.

```typescript
interface JiraIssue {
  key: string;                  // Issue key (e.g., "QA-123")
  summary: string;              // Issue summary/title
  description: string | null;   // Issue description body (may be null)
  labels: string[];             // Array of label strings
  issueType: string;            // Issue type name (e.g., "Bug", "Story", "Test")
}
```

---

### JiraProject (jira.ts)

Represents a Jira project from the projects listing.

```typescript
interface JiraProject {
  key: string;    // Project key (e.g., "QA")
  name: string;   // Project display name
}
```

---

### JiraIssueType (jira.ts)

Represents a Jira issue type within a project.

```typescript
interface JiraIssueType {
  id: string;         // Issue type ID
  name: string;       // Issue type name (e.g., "Bug", "Story")
  subtask: boolean;   // Whether this is a subtask type
}
```

---

### JiraTicketSummary (jira.ts)

Lightweight representation of a Jira ticket used in listings.

```typescript
interface JiraTicketSummary {
  key: string;       // Issue key
  summary: string;   // Issue summary
}
```

---

### XrayTest (xray.ts)

Represents a test fetched from the Xray Cloud GraphQL API with full structured metadata.

```typescript
interface XrayTest {
  issueKey: string;          // Jira issue key for the test (e.g., "QA-500")
  summary: string;           // Test summary/title
  description: string;       // Test description
  testType: string;          // One of: "Manual", "Cucumber", "Generic"
  folder: string | null;     // Xray folder path (e.g., "/Workspace/Login") or null
  labels: string[];          // Array of label strings
  steps: {                   // Manual test steps (empty array for non-Manual types)
    action: string;          //   Step action description
    data: string;            //   Test data for the step
    result: string;          //   Expected result
  }[];
  preconditions: {           // Preconditions linked to this test
    key: string;             //   Precondition issue key
    definition: string;      //   Precondition definition text
  }[];
  gherkin: string | null;    // Gherkin feature text (Cucumber tests only)
  unstructured: string | null; // Unstructured definition (Generic tests only)
}
```

**Test type breakdown:**

| testType | steps | gherkin | unstructured |
|----------|-------|---------|--------------|
| `Manual` | Populated | `null` | `null` |
| `Cucumber` | Empty `[]` | Populated | `null` |
| `Generic` | Empty `[]` | `null` | Populated |

---

## Frontend Interfaces

All frontend interfaces are defined in `frontend/src/types/index.ts`.

### SearchResult

Frontend representation of a search result displayed in the UI.

```typescript
interface SearchResult {
  testCase: string;                        // Test case description
  relevance: "high" | "medium" | "low";    // Relevance tier
  riskScore: number;                       // Risk score (1-5)
  reason: string;                          // Explanation of relevance
  issueKey?: string;                       // Jira issue key
  testType?: string;                       // Xray test type
  folder?: string;                         // Xray folder path
  steps?: string;                          // JSON string of test steps
  preconditions?: string;                  // JSON string of preconditions
}
```

---

### UploadResponse

Response from the file upload endpoint.

```typescript
interface UploadResponse {
  success: boolean;
  count: number;
}
```

---

### SearchResponse

Response from the search endpoint.

```typescript
interface SearchResponse {
  userStory: string;
  jiraKey?: string;
  jiraSummary?: string;
  results: SearchResult[];
}
```

---

### JiraImportResponse

Response from Jira or Xray import endpoints.

```typescript
interface JiraImportResponse {
  success: boolean;
  count: number;
  source: string;
}
```

---

### JiraIssuePreview

Represents a Jira issue fetched for preview in the frontend.

```typescript
interface JiraIssuePreview {
  key: string;
  summary: string;
  description: string | null;
  searchText: string;
}
```

---

### SuggestedTestCase (frontend)

Frontend representation of a suggested test case from gap analysis.

```typescript
interface SuggestedTestCase {
  title: string;
  steps: { action: string; expected: string }[];
  rationale: string;
}
```

---

## Pinecone Metadata Schema

Each vector stored in Pinecone includes the following metadata fields. Not all fields are populated by every import source.

| Field | Type | CSV Upload | Jira Import | Xray Import | Description |
|-------|------|:----------:|:-----------:|:-----------:|-------------|
| `text` | `string` | Yes | Yes | Yes | Original test case description text |
| `module` | `string` | Yes | Yes | Yes | Module grouping. CSV: from column. Jira: from first label. Xray: from folder path. |
| `source` | `string` | Yes | Yes | Yes | Source tag. Format: `upload:<filename>`, `jira:<project>`, `xray:<project>` |
| `issueKey` | `string` | No | Yes | Yes | Jira issue key (e.g., `QA-123`) |
| `testType` | `string` | No | No | Yes | Xray test type: `Manual`, `Cucumber`, or `Generic` |
| `folder` | `string` | No | No | Yes | Xray folder path (e.g., `/Workspace/Login`) |
| `labels` | `string` | No | Yes | Yes | Comma-separated list of Jira labels |
| `description` | `string` | No | Yes | Yes | Jira/Xray issue description body |
| `steps` | `string` (JSON) | No | No | Yes | JSON-serialized array of `{ action, data, result }` |
| `preconditions` | `string` (JSON) | No | No | Yes | JSON-serialized array of `{ key, definition }` |
| `gherkin` | `string` | No | No | Yes | Gherkin feature text (Cucumber tests only) |
| `unstructured` | `string` | No | No | Yes | Unstructured test definition (Generic tests only) |

**Source tag formats:**

| Import Method | Source Tag Format | Example |
|---------------|-------------------|---------|
| CSV/XLSX upload | `upload:<filename>` | `upload:regression-tests.csv` |
| Jira import (project-wide) | `jira:<projectKey>` | `jira:QA` |
| Jira import (scoped to parent) | `jira:<projectKey>:<parentKey>` | `jira:QA:EPIC-123` |
| Xray import (project-wide) | `xray:<projectKey>` | `xray:QA` |
| Xray import (scoped to parent) | `xray:<projectKey>:<parentKey>` | `xray:QA:TEST-PLAN-456` |

---

## Data Transformation Chains

### Ingestion Chain (Import to Pinecone)

The ingestion chain describes how raw data from each source is transformed into vectors stored in Pinecone.

```
Raw Input
  |
  v
TestCase[] (parsed)
  |
  v
Enriched Text (embedding input)
  |
  v
Vector (OpenAI embedding)
  |
  v
Pinecone (vector + metadata)
```

**Step-by-step breakdown:**

#### Step 1: Raw Input to TestCase[]

| Source | Process |
|--------|---------|
| **CSV/XLSX** | File is parsed row-by-row. The `Description` column becomes `text`. The `Module` column becomes `module`. All other columns go into `metadata`. |
| **Jira** | Issues are fetched via Jira REST API. `summary + description` becomes `text`. First label becomes `module`. Labels, description, and issueKey are preserved as metadata. |
| **Xray** | Tests are fetched via Xray GraphQL API. `summary + description` becomes `text`. Folder path becomes `module`. All structured fields (steps, preconditions, gherkin, unstructured, labels, testType, folder) are preserved as metadata. |

#### Step 2: TestCase to Enriched Text

The `text` field is used as the primary embedding input. For Xray imports, the enriched text may include appended structured content:

- **Manual tests:** Steps are appended as a numbered list of actions and expected results.
- **Cucumber tests:** The gherkin feature text is appended.
- **Generic tests:** The unstructured definition is appended.

This enrichment ensures that semantic search captures the full context of each test case.

#### Step 3: Enriched Text to Vector

The enriched text string is sent to the OpenAI Embeddings API (`text-embedding-ada-002` or configured model) to produce a dense vector.

#### Step 4: Vector to Pinecone

The vector is upserted into Pinecone along with the full metadata object (all 12 fields from the metadata schema above). Fields that do not apply to a given source are omitted from the metadata.

---

### Query Chain (Search to Frontend)

The query chain describes how a search request flows from the API through Pinecone and the LLM back to the frontend.

```
Pinecone Match
  |
  v
MatchResult (raw similarity result)
  |
  v
ExplainResult (LLM-enriched)
  |
  v
SearchResult (frontend display)
```

**Step-by-step breakdown:**

#### Step 1: Pinecone Match to MatchResult

The user story text is embedded using the same OpenAI model used during ingestion. The resulting vector is used to query Pinecone with `topK` results. Each match is deserialized into a `MatchResult`, which includes:

- The `text` and all metadata fields stored alongside the vector.
- The cosine similarity `score` from Pinecone (0.0 to 1.0).

#### Step 2: MatchResult to ExplainResult

The array of `MatchResult` objects is sent to the LLM (GPT-4 or configured model) along with the original user story. The LLM evaluates each match and produces:

- `relevance`: A tier of `"high"`, `"medium"`, or `"low"` based on how directly the test case covers the user story.
- `riskScore`: A 1-5 integer indicating the risk if this test case fails.
- `reason`: A natural-language explanation of why the test case is relevant.

All metadata fields (`module`, `source`, `issueKey`, `testType`, `folder`, `steps`, `preconditions`) are passed through from the `MatchResult` to the `ExplainResult` without modification.

Results are sorted by relevance tier (high first, then medium, then low).

#### Step 3: ExplainResult to SearchResult

The `ExplainResult` is sent to the frontend as part of the `SearchResponse`. The frontend `SearchResult` interface is a subset of `ExplainResult`, dropping the `source` and `module` fields that are used only for display logic. The frontend parses `steps` and `preconditions` from their JSON string form for rendering in the UI.

---

### Gap Analysis Chain (Suggest)

```
User Story + Existing Tests
  |
  v
LLM Analysis (gap identification)
  |
  v
SuggestedTestCase[] (new test cases)
```

The user story and the list of existing test case descriptions are sent to the LLM. The LLM identifies gaps in coverage and generates new test cases with:

- A descriptive `title` for each suggested test.
- Ordered `steps` with `action` and `expected` outcome pairs.
- A `rationale` explaining why this test is needed and what gap it fills.
