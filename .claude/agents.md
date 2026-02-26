# agents.md — Claude Memory for Test Lens

> This file is a persistent context store for Claude Code sessions working on this project. Read this first to understand the full picture before making changes.

---

## Project Summary

**Test Lens** is an AI-powered regression test selector built as a hackathon POC at SeekOut. Users upload test cases (CSV/XLSX) or import from Jira/Xray, then describe a user story to find the most relevant tests — ranked by relevance with AI-generated explanations and risk scores.

**Owner:** Sambhav Dave (`sambhavdave`)
**Repo:** `Zipstorm/test-lens` on GitHub
**Branch:** `main` (single branch workflow, push directly)

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | Next.js 16, React 19, TypeScript | Port 3001, proxies API to backend |
| Styling | Tailwind CSS 4 | Dark mode via `@custom-variant dark (&:where(.dark, .dark *))` |
| Backend | Express.js, TypeScript | Port 3000 |
| Embeddings | OpenAI `text-embedding-3-small` | 1536 dimensions, batch size 2048 |
| Vector DB | Pinecone | Index name `testlens`, cosine metric |
| LLM | Anthropic Claude `claude-haiku-4-5-20251001` | 1024 tokens for explain, 2048 for suggest |
| File Parsing | `xlsx` library | Supports CSV and XLSX |
| Jira | REST API v3 | Basic Auth (email + API token) |
| Xray | GraphQL + OAuth2 | Client credentials, 23hr token cache |
| Infra | Docker Compose | Optional, both services have Dockerfiles |

---

## Architecture at a Glance

```
Browser → Next.js Frontend (:3001) → Express Backend (:3000) → OpenAI / Pinecone / Claude / Jira / Xray
```

Three import pipelines converge on one embed→index pipeline:
- **CSV/XLSX** → `parser.ts` → `embedder.ts` → `vectorStore.ts` → Pinecone
- **Jira** → `jira.ts` → same embed/index path
- **Xray** → `xray.ts` (GraphQL + OAuth2) → same embed/index path

Search pipeline:
- User story → `embedder.ts` (embed query) → `vectorStore.ts` (vector search) → `llm.ts` (Claude explains matches) → results
- Gap analysis: `llm.ts` → `suggestTestCases()` → missing test suggestions

---

## File Map

### Backend (`backend/src/`)

| File | Purpose |
|------|---------|
| `server.ts` | Express entry point. Mounts 3 routers + health check. Inits Pinecone on startup. |
| `cli.ts` | Interactive CLI for testing without the frontend |
| `routes/upload.ts` | `POST /api/upload` — file upload, parse, embed, index |
| `routes/search.ts` | `POST /api/search` + `POST /api/search/suggest` |
| `routes/jira.ts` | 7 Jira/Xray endpoints (projects, issue-types, tickets, import, xray-import, etc.) |
| `services/parser.ts` | CSV/XLSX parsing → `TestCase[]`. Has `enrichForEmbedding()` that prepends `[Module]` to text. |
| `services/embedder.ts` | `embed()` single + `embedBatch()` multi. Model: `text-embedding-3-small`, dims: 1536. |
| `services/vectorStore.ts` | Pinecone CRUD. SHA-256 content hash for vector IDs (dedup). `buildIndex()`, `queryIndex()`. Batch upsert 100. |
| `services/llm.ts` | Claude integration. `explainMatches()` (1024 tokens) + `suggestTestCases()` (2048 tokens). JSON response parsing. |
| `services/jira.ts` | Jira REST API client. Basic Auth. ADF→plaintext parser. Module derivation from labels. |
| `services/xray.ts` | Xray GraphQL client. OAuth2 token with 23hr cache. 3 query modes. Rich text conversion. |

### Frontend (`frontend/src/`)

| File | Purpose |
|------|---------|
| `app/layout.tsx` | Root layout with Geist fonts, dark mode class on `<html>` |
| `app/page.tsx` | **Main state container.** 3 tabs (Upload, Jira Import, Search). All search state lives here. |
| `app/globals.css` | Tailwind config + CSS custom properties for theming |
| `components/Header.tsx` | App title and tagline |
| `components/UploadSection.tsx` | CSV/XLSX upload with status handling |
| `components/FileDropZone.tsx` | Drag-and-drop file input |
| `components/JiraImportSection.tsx` | Jira project picker, issue type filter (Epic/Test Plan/Test Set), ticket picker, Xray vs Jira toggle |
| `components/SearchSection.tsx` | User story textarea + Jira key input + topK slider + search button |
| `components/ResultsSection.tsx` | Results container with relevance filter pills + "Append to TMS" disabled button |
| `components/ResultCard.tsx` | Individual result with expandable reason, metadata (issueKey, folder, steps) |
| `components/RelevanceBadge.tsx` | Color-coded pill (green/yellow/red for high/medium/low) |
| `components/RiskScore.tsx` | 5-dot visual risk indicator |
| `components/SuggestionsSection.tsx` | "Suggest Missing Tests" button → shows gap analysis cards |
| `lib/api.ts` | API client — all `fetch()` calls to backend |
| `types/index.ts` | All frontend TypeScript interfaces |

### Docs (`docs/`)

| File | What |
|------|------|
| `system-design.md` | Full 13-section system design document |
| `api-reference.md` | All 11 API endpoints with schemas and curl examples |
| `data-model.md` | All TypeScript interfaces + Pinecone metadata schema + transformation chains |
| `adr/001-embedding-model-choice.md` | Why `text-embedding-3-small` at 1536 dims |
| `adr/002-dedup-via-sha256-hash.md` | SHA-256 vector IDs for dedup |
| `adr/003-xray-vs-jira-import.md` | Dual import mode rationale |
| `setup/environment-setup.md` | Complete env setup (all 11 env vars, Pinecone, Jira, Xray, Docker) |
| `diagrams/*.excalidraw` | 4 Excalidraw diagrams (system architecture, data pipeline, component tree, knowledge graph) |

---

## Key Design Decisions

1. **Embedding dims = 1536** — explicitly set in `embedder.ts` and Pinecone index. The model default changed to 384 in newer SDK versions; we force 1536 for richer representation. Changing this requires recreating the Pinecone index.

2. **SHA-256 content hash as vector ID** — `crypto.createHash("sha256").update(text).digest("hex").slice(0, 16)`. Same text = same ID = safe upsert. Different text = different ID = accumulates. Re-uploading same file = no-op.

3. **Accumulate mode** — uploads don't clear the index. Vectors accumulate across uploads. Dedup handled by content hash.

4. **`[Module] Text` enrichment** — `parser.ts` prepends module name to test case text before embedding for better semantic matching.

5. **Xray vs Jira import** — Xray gives richer data (steps, preconditions, folders) via GraphQL + OAuth2. Jira gives simpler summaries via REST API. Both converge on same embed→index pipeline.

6. **Claude Haiku for analysis** — fast + cheap for hackathon. `explainMatches()` returns `{testCase, relevance, riskScore, reason}[]`. `suggestTestCases()` returns `{title, steps[], rationale}[]`.

7. **Frontend state in page.tsx** — all search state (results, status, error, lastQuery) lives in the page component and flows down via props. No global state library.

8. **Dark mode** — Tailwind `dark:` classes throughout. Every component has dark mode variants. Uses `@custom-variant dark (&:where(.dark, .dark *))` in globals.css.

9. **Issue type filter** — JiraImportSection filters to only Epic, Test Plan, Test Set types. This is hardcoded in the `useEffect` that calls `fetchIssueTypes()`.

---

## Environment Variables

```env
# Required
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
PINECONE_API_KEY=pcsk_...
PINECONE_INDEX_NAME=testlens
PORT=3000

# Optional — Jira
JIRA_BASE_URL=https://yoursite.atlassian.net
JIRA_EMAIL=you@example.com
JIRA_API_TOKEN=your_token

# Optional — Xray
XRAY_CLIENT_ID=...
XRAY_CLIENT_SECRET=...
```

---

## API Endpoints (Quick Reference)

| Method | Path | Handler |
|--------|------|---------|
| `POST` | `/api/upload` | `routes/upload.ts` |
| `POST` | `/api/search` | `routes/search.ts` |
| `POST` | `/api/search/suggest` | `routes/search.ts` |
| `GET` | `/api/jira/projects` | `routes/jira.ts` |
| `GET` | `/api/jira/projects/:key/issue-types` | `routes/jira.ts` |
| `GET` | `/api/jira/projects/:key/tickets` | `routes/jira.ts` |
| `GET` | `/api/jira/issues/:projectKey` | `routes/jira.ts` |
| `GET` | `/api/jira/issue/:issueKey` | `routes/jira.ts` |
| `POST` | `/api/jira/import` | `routes/jira.ts` |
| `POST` | `/api/jira/xray-import` | `routes/jira.ts` |
| `GET` | `/api/health` | `server.ts` |

---

## Commit History (Feature Evolution)

```
c4e8dbb docs: consolidate into single root README with links to detailed docs
1019250 docs: add comprehensive docs folder with system design, diagrams, and ADRs
ad2034d feat: add searchable dropdown for ticket picker
4e96c23 feat: show Missing Test Cases heading only after Suggest button click
525d74b feat: add dark mode, limit issue type filter, and Append to TMS button
2af160a feat: add test case gap analysis with suggest new tests button
01631c9 feat: store structured Xray metadata in Pinecone vectors
67aacc2 feat: sort results by relevance (high, medium, low)
22d59ab feat: add Jira/Xray integration with parent ticket filtering
56b2781 feat: enrich embeddings with module context for better matching
b844999 feat: switch to accumulate mode with content-hash vector IDs
9aa01bc feat: add relevance filter pills to search results
0e81ee0 feat: add module column support across the full pipeline
49ea4d7 fix: remove COPY of non-existent public dir in frontend Dockerfile
576b656 feat: add Docker setup to run full stack with one command
```

---

## Known Limitations / Future Work

- **"Append to TMS" button** — disabled with tooltip "Coming soon". Located in `ResultsSection.tsx`. Planned to push selected tests to an external test management system.
- **No authentication** — no login, no user sessions. Single-tenant hackathon POC.
- **No persistent storage** — all state is in-memory (frontend) or Pinecone (vectors). No SQL database.
- **Pinecone index is shared** — all users share one index. No namespace isolation.
- **No tests** — no unit tests, no integration tests. Hackathon speed.
- **Xray OAuth2 token** — cached for 23 hours in memory. Server restart = re-auth. No refresh token.
- **Max 20 results** — `topK` capped at 20 in search endpoint.
- **No pagination** — Jira import fetches up to maxResults in one call.

---

## Conventions

- **Commit style:** `feat:`, `fix:`, `docs:` prefixes. Co-authored with Claude.
- **Push directly to main** — no PR workflow for this hackathon project.
- **TypeScript strict** — both frontend and backend.
- **Tailwind classes** — always include `dark:` variants for any UI change.
- **Component pattern** — functional components with hooks. State lifted to `page.tsx`.
- **API client** — all fetch calls go through `frontend/src/lib/api.ts`, never direct fetch in components.
- **Error handling** — backend returns `{ error: string }` on failures. Frontend catches and displays.

---

## Running the Project

```bash
# Option 1: Docker
docker compose up --build

# Option 2: Local dev (two terminals)
cd backend && npm install && npm run dev    # :3000
cd frontend && npm install && npm run dev   # :3001

# Option 3: CLI only (no frontend)
cd backend && npm run cli
```
