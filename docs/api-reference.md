# Test Lens API Reference

Base URL: `http://localhost:3001`

All request and response bodies use `application/json` unless otherwise noted.

---

## Table of Contents

1. [POST /api/upload](#post-apiupload)
2. [POST /api/search](#post-apisearch)
3. [POST /api/search/suggest](#post-apisearchsuggest)
4. [GET /api/jira/projects](#get-apijiraprojects)
5. [GET /api/jira/projects/:key/issue-types](#get-apijiraprojectskeyissue-types)
6. [GET /api/jira/projects/:key/tickets](#get-apijiraprojectskeytickets)
7. [GET /api/jira/projects/:key/issues](#get-apijiraprojectskeyissues)
8. [GET /api/jira/issue/:key](#get-apijiraissuekey)
9. [POST /api/jira/import](#post-apijiraimport)
10. [POST /api/jira/xray-import](#post-apijiraxray-import)
11. [GET /api/health](#get-apihealth)

---

## POST /api/upload

Upload a CSV or XLSX file containing test cases. The file is parsed, embedded via OpenAI, and indexed into Pinecone.

### Request

**Content-Type:** `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | File | Yes | CSV or XLSX file, max 10 MB |

**File requirements:**

- Must contain a **Description** column (case-insensitive). Accepted variants: `title`, `name`, `test case`, `test_case`, `testcase`.
- May optionally contain a **Module** column. Accepted variants: `component`, `area`, `category`, `feature`.

### Response

**Status:** `200 OK`

```json
{
  "success": true,
  "count": 42,
  "source": "upload:test-cases.csv"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `success` | `boolean` | Always `true` on success |
| `count` | `number` | Number of test cases indexed |
| `source` | `string` | Source tag in the format `upload:<filename>` |

### Errors

| Status | Condition | Example Message |
|--------|-----------|-----------------|
| 400 | No file attached | `"No file uploaded"` |
| 400 | Invalid file format | `"Only CSV and XLSX files are supported"` |
| 400 | Missing Description column | `"CSV must contain a 'Description' column"` |
| 500 | Embedding or indexing failure | `"Failed to index test cases"` |

### Example

```bash
curl -X POST http://localhost:3001/api/upload \
  -F "file=@test-cases.csv"
```

---

## POST /api/search

Search for test cases relevant to a user story or Jira ticket. Results are ranked by relevance and enriched with risk scores and explanations via an LLM.

### Request

**Content-Type:** `application/json`

```json
{
  "userStory": "As a user, I want to reset my password via email",
  "jiraKey": "QA-123",
  "topK": 10
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `userStory` | `string` | Conditional | — | Free-text user story. Required if `jiraKey` is not provided. |
| `jiraKey` | `string` | Conditional | — | Jira issue key (e.g., `QA-123`) or full Jira URL. Required if `userStory` is not provided. |
| `topK` | `number` | No | `5` | Number of results to return. Maximum `20`. |

When `jiraKey` is provided, the server fetches the issue summary and description from Jira to use as search context.

### Response

**Status:** `200 OK`

```json
{
  "userStory": "As a user, I want to reset my password via email",
  "jiraKey": "QA-123",
  "jiraSummary": "Password reset via email link",
  "results": [
    {
      "testCase": "Verify password reset email is sent within 30 seconds",
      "relevance": "high",
      "riskScore": 4,
      "reason": "Directly tests the core password reset flow described in the story.",
      "module": "Authentication",
      "source": "upload:test-cases.csv",
      "issueKey": null,
      "testType": null,
      "folder": null,
      "steps": null,
      "preconditions": null
    }
  ]
}
```

**Top-level fields:**

| Field | Type | Description |
|-------|------|-------------|
| `userStory` | `string` | The search text used |
| `jiraKey` | `string` | Jira key, if provided |
| `jiraSummary` | `string` | Summary fetched from Jira, if applicable |
| `results` | `ExplainResult[]` | Ranked array of matching test cases |

**ExplainResult fields:**

| Field | Type | Description |
|-------|------|-------------|
| `testCase` | `string` | Test case description text |
| `relevance` | `"high" \| "medium" \| "low"` | Relevance tier |
| `riskScore` | `number` | Risk score from 1 (low risk) to 5 (critical) |
| `reason` | `string` | LLM-generated explanation of relevance |
| `module` | `string?` | Module or component grouping |
| `source` | `string?` | Source tag (e.g., `upload:file.csv`, `jira:QA`) |
| `issueKey` | `string?` | Jira issue key, if imported from Jira/Xray |
| `testType` | `string?` | Xray test type (Manual, Cucumber, Generic) |
| `folder` | `string?` | Xray folder path |
| `steps` | `string?` | JSON string of test steps |
| `preconditions` | `string?` | JSON string of preconditions |

### Errors

| Status | Condition |
|--------|-----------|
| 400 | Neither `userStory` nor `jiraKey` provided |
| 500 | Embedding, Pinecone query, or LLM failure |

### Example

```bash
curl -X POST http://localhost:3001/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "userStory": "As a user, I want to reset my password via email",
    "topK": 10
  }'
```

Using a Jira key:

```bash
curl -X POST http://localhost:3001/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "jiraKey": "QA-123"
  }'
```

Using a full Jira URL:

```bash
curl -X POST http://localhost:3001/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "jiraKey": "https://myorg.atlassian.net/browse/QA-123"
  }'
```

---

## POST /api/search/suggest

Perform gap analysis on existing test coverage and suggest new test cases that are missing. Uses an LLM to identify untested scenarios.

### Request

**Content-Type:** `application/json`

```json
{
  "userStory": "As a user, I want to reset my password via email",
  "existingTests": [
    "Verify password reset email is sent within 30 seconds",
    "Verify reset link expires after 24 hours"
  ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userStory` | `string` | Yes | The user story to analyze coverage for |
| `existingTests` | `string[]` | Yes | Array of existing test case descriptions |

### Response

**Status:** `200 OK`

```json
{
  "suggestions": [
    {
      "title": "Verify error message when reset is requested for non-existent email",
      "steps": [
        {
          "action": "Navigate to the password reset page",
          "expected": "Password reset form is displayed"
        },
        {
          "action": "Enter an unregistered email address and submit",
          "expected": "A generic message is shown without revealing whether the account exists"
        }
      ],
      "rationale": "The existing tests do not cover the negative path where a user enters an email not associated with any account."
    }
  ]
}
```

**SuggestedTestCase fields:**

| Field | Type | Description |
|-------|------|-------------|
| `title` | `string` | Suggested test case title |
| `steps` | `{ action: string, expected: string }[]` | Ordered list of test steps |
| `rationale` | `string` | Explanation of why this test is needed |

### Errors

| Status | Condition |
|--------|-----------|
| 400 | Missing `userStory` or `existingTests` |
| 500 | LLM failure |

### Example

```bash
curl -X POST http://localhost:3001/api/search/suggest \
  -H "Content-Type: application/json" \
  -d '{
    "userStory": "As a user, I want to reset my password via email",
    "existingTests": [
      "Verify password reset email is sent within 30 seconds",
      "Verify reset link expires after 24 hours"
    ]
  }'
```

---

## GET /api/jira/projects

List all Jira projects accessible to the configured Jira credentials.

### Request

No parameters required.

### Response

**Status:** `200 OK`

```json
{
  "projects": [
    { "key": "QA", "name": "Quality Assurance" },
    { "key": "DEV", "name": "Development" }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `projects` | `JiraProject[]` | Array of projects |
| `projects[].key` | `string` | Project key (e.g., `QA`) |
| `projects[].name` | `string` | Project display name |

### Errors

| Status | Condition |
|--------|-----------|
| 500 | Jira connection or authentication failure |

### Example

```bash
curl http://localhost:3001/api/jira/projects
```

---

## GET /api/jira/projects/:key/issue-types

List the non-subtask issue types available in a specific Jira project.

### Request

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `key` | `string` | Jira project key (e.g., `QA`) |

### Response

**Status:** `200 OK`

```json
{
  "projectKey": "QA",
  "issueTypes": [
    { "id": "10001", "name": "Bug", "subtask": false },
    { "id": "10002", "name": "Story", "subtask": false },
    { "id": "10003", "name": "Test", "subtask": false }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `projectKey` | `string` | The requested project key |
| `issueTypes` | `JiraIssueType[]` | Non-subtask issue types |
| `issueTypes[].id` | `string` | Issue type ID |
| `issueTypes[].name` | `string` | Issue type display name |
| `issueTypes[].subtask` | `boolean` | Always `false` (subtasks are filtered out) |

### Errors

| Status | Condition |
|--------|-----------|
| 500 | Invalid project key or Jira connection failure |

### Example

```bash
curl http://localhost:3001/api/jira/projects/QA/issue-types
```

---

## GET /api/jira/projects/:key/tickets

List tickets of a specific issue type within a Jira project. Used to browse issues before importing.

### Request

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `key` | `string` | Jira project key |

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `issueType` | `string` | Yes | — | Issue type name to filter by (e.g., `Story`, `Bug`) |
| `maxResults` | `number` | No | `50` | Maximum number of tickets to return |

### Response

**Status:** `200 OK`

```json
{
  "projectKey": "QA",
  "issueType": "Story",
  "tickets": [
    { "key": "QA-101", "summary": "User login with SSO" },
    { "key": "QA-102", "summary": "Password reset flow" }
  ],
  "count": 2
}
```

| Field | Type | Description |
|-------|------|-------------|
| `projectKey` | `string` | The requested project key |
| `issueType` | `string` | The issue type filter applied |
| `tickets` | `JiraTicketSummary[]` | Array of matching tickets |
| `tickets[].key` | `string` | Issue key |
| `tickets[].summary` | `string` | Issue summary |
| `count` | `number` | Total number of tickets returned |

### Errors

| Status | Condition |
|--------|-----------|
| 400 | Missing `issueType` query parameter |
| 500 | Jira query failure |

### Example

```bash
curl "http://localhost:3001/api/jira/projects/QA/tickets?issueType=Story&maxResults=20"
```

---

## GET /api/jira/projects/:key/issues

Preview test case issues from a Jira project. Returns issues suitable for import.

### Request

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `key` | `string` | Jira project key |

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `maxResults` | `number` | No | `50` | Maximum number of issues to return |

### Response

**Status:** `200 OK`

```json
{
  "projectKey": "QA",
  "issues": [
    {
      "key": "QA-200",
      "summary": "Verify login page loads correctly",
      "description": "Check that all form fields render...",
      "labels": ["regression", "login"],
      "issueType": "Test"
    }
  ],
  "count": 1
}
```

| Field | Type | Description |
|-------|------|-------------|
| `projectKey` | `string` | The requested project key |
| `issues` | `JiraIssue[]` | Array of issue previews |
| `count` | `number` | Total number of issues returned |

### Errors

| Status | Condition |
|--------|-----------|
| 500 | Jira query failure |

### Example

```bash
curl "http://localhost:3001/api/jira/projects/QA/issues?maxResults=25"
```

---

## GET /api/jira/issue/:key

Fetch a single Jira issue by its key or full URL. Returns the issue summary, description, and a combined search text string.

### Request

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `key` | `string` | Jira issue key (e.g., `QA-123`) or a full Jira URL |

### Response

**Status:** `200 OK`

```json
{
  "key": "QA-123",
  "summary": "Password reset via email link",
  "description": "As a user, I want to reset my password by receiving an email with a secure link...",
  "searchText": "Password reset via email link\n\nAs a user, I want to reset my password by receiving an email with a secure link..."
}
```

| Field | Type | Description |
|-------|------|-------------|
| `key` | `string` | Normalized Jira issue key |
| `summary` | `string` | Issue summary |
| `description` | `string \| null` | Issue description (may be null) |
| `searchText` | `string` | Combined summary and description for search use |

### Errors

| Status | Condition |
|--------|-----------|
| 404 | Issue not found |
| 500 | Jira connection failure |

### Example

```bash
curl http://localhost:3001/api/jira/issue/QA-123
```

Using a full URL (URL-encoded):

```bash
curl "http://localhost:3001/api/jira/issue/https%3A%2F%2Fmyorg.atlassian.net%2Fbrowse%2FQA-123"
```

---

## POST /api/jira/import

Import test cases from a Jira project. Fetches issues from Jira, generates embeddings, and indexes them in Pinecone. Optionally scope to children of a parent ticket (e.g., an Epic).

### Request

**Content-Type:** `application/json`

```json
{
  "projectKey": "QA",
  "maxResults": 100,
  "parentTicketKey": "QA-50"
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `projectKey` | `string` | Yes | — | Jira project key |
| `maxResults` | `number` | No | `50` | Maximum issues to import |
| `parentTicketKey` | `string` | No | — | Parent issue key to scope import (e.g., Epic key) |

### Response

**Status:** `200 OK`

```json
{
  "success": true,
  "count": 34,
  "source": "jira:QA"
}
```

When a parent ticket is specified:

```json
{
  "success": true,
  "count": 12,
  "source": "jira:QA:EPIC-123"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `success` | `boolean` | Always `true` on success |
| `count` | `number` | Number of test cases imported and indexed |
| `source` | `string` | Source tag: `jira:<project>` or `jira:<project>:<parent>` |

### Errors

| Status | Condition |
|--------|-----------|
| 400 | Missing `projectKey` |
| 500 | Jira fetch, embedding, or Pinecone indexing failure |

### Example

```bash
curl -X POST http://localhost:3001/api/jira/import \
  -H "Content-Type: application/json" \
  -d '{
    "projectKey": "QA",
    "maxResults": 100
  }'
```

With parent ticket scoping:

```bash
curl -X POST http://localhost:3001/api/jira/import \
  -H "Content-Type: application/json" \
  -d '{
    "projectKey": "QA",
    "parentTicketKey": "QA-50"
  }'
```

---

## POST /api/jira/xray-import

Import test cases from Xray Cloud (Jira Xray plugin). Fetches tests via the Xray GraphQL API, generates embeddings with enriched metadata (steps, preconditions, gherkin), and indexes them in Pinecone.

### Request

**Content-Type:** `application/json`

```json
{
  "projectKey": "QA",
  "maxResults": 100,
  "parentTicketKey": "TEST-PLAN-456"
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `projectKey` | `string` | Yes | — | Jira project key |
| `maxResults` | `number` | No | `50` | Maximum tests to import |
| `parentTicketKey` | `string` | No | — | Test Plan issue key to scope import |

### Response

**Status:** `200 OK`

```json
{
  "success": true,
  "count": 28,
  "source": "xray:QA"
}
```

When a parent ticket is specified:

```json
{
  "success": true,
  "count": 15,
  "source": "xray:QA:TEST-PLAN-456"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `success` | `boolean` | Always `true` on success |
| `count` | `number` | Number of Xray tests imported and indexed |
| `source` | `string` | Source tag: `xray:<project>` or `xray:<project>:<parent>` |

### Errors

| Status | Condition |
|--------|-----------|
| 400 | Missing `projectKey` |
| 500 | Xray GraphQL failure, embedding failure, or Pinecone indexing failure |

### Example

```bash
curl -X POST http://localhost:3001/api/jira/xray-import \
  -H "Content-Type: application/json" \
  -d '{
    "projectKey": "QA",
    "maxResults": 100
  }'
```

With Test Plan scoping:

```bash
curl -X POST http://localhost:3001/api/jira/xray-import \
  -H "Content-Type: application/json" \
  -d '{
    "projectKey": "QA",
    "parentTicketKey": "TEST-PLAN-456"
  }'
```

---

## GET /api/health

Health check endpoint. Returns the server status and Pinecone connectivity.

### Request

No parameters required.

### Response

**Status:** `200 OK`

```json
{
  "status": "ok",
  "timestamp": "2026-02-26T12:00:00.000Z",
  "pinecone": true
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | `string` | Always `"ok"` when the server is running |
| `timestamp` | `string` | ISO 8601 timestamp of the response |
| `pinecone` | `boolean` | `true` if Pinecone is reachable, `false` otherwise |

### Errors

| Status | Condition |
|--------|-----------|
| 500 | Server-level failure (unlikely if endpoint is reachable) |

### Example

```bash
curl http://localhost:3001/api/health
```
