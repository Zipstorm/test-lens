# Test Lens

AI-powered regression test selector. Upload your test cases, describe a user story, and get back the most relevant tests with risk scores and explanations.

## How It Works

Upload a spreadsheet of test cases. Type a user story. Get back the tests that matter most — ranked by relevance with AI-generated explanations.

```mermaid
flowchart LR
    A[CSV/XLSX File] -->|Upload| B[Parse Test Cases]
    B --> C[Generate Embeddings]
    C --> D[Store in Pinecone]
    E[User Story] -->|Search| F[Embed Story]
    F --> G[Vector Search]
    D --> G
    G --> H[Claude Analyzes Matches]
    H --> I[Ranked Results + Explanations]
```

## Architecture

```
test-lens/
├── frontend/          # UI (separate development)
├── backend/
│   ├── src/
│   │   ├── server.ts          # Express app entry point
│   │   ├── routes/
│   │   │   ├── upload.ts      # POST /api/upload
│   │   │   └── search.ts      # POST /api/search
│   │   └── services/
│   │       ├── parser.ts      # CSV/XLSX file parsing
│   │       ├── embedder.ts    # OpenAI embeddings
│   │       ├── vectorStore.ts # Pinecone vector DB
│   │       └── llm.ts         # Claude analysis
│   ├── test-data/             # Sample test fixtures
│   └── uploads/               # Temp file storage
└── README.md
```

## Upload Flow

User uploads a CSV/XLSX file. The backend parses it, generates embeddings, and stores them in Pinecone.

```mermaid
sequenceDiagram
    participant User
    participant API as Express API
    participant Parser
    participant OpenAI
    participant Pinecone

    User->>API: POST /api/upload (file)
    API->>Parser: parseFile(filePath)
    Parser-->>API: string[] (test cases)
    API->>OpenAI: embedBatch(testCases)
    OpenAI-->>API: number[][] (vectors)
    API->>Pinecone: buildIndex(vectors, texts)
    Pinecone-->>API: success
    API-->>User: { success: true, count: 30 }
```

## Search Flow

User types a user story. The backend embeds it, finds similar test cases, and asks Claude to explain the relevance.

```mermaid
sequenceDiagram
    participant User
    participant API as Express API
    participant OpenAI
    participant Pinecone
    participant Claude

    User->>API: POST /api/search { userStory }
    API->>OpenAI: embed(userStory)
    OpenAI-->>API: number[] (query vector)
    API->>Pinecone: queryIndex(vector, topK)
    Pinecone-->>API: matched test cases + scores
    API->>Claude: explainMatches(story, matches)
    Claude-->>API: relevance + risk + reasons
    API-->>User: { results: ExplainResult[] }
```

## Service Layer

```mermaid
flowchart TB
    subgraph Services
        P[parser.ts<br>File Parsing]
        E[embedder.ts<br>OpenAI Embeddings]
        V[vectorStore.ts<br>Pinecone DB]
        L[llm.ts<br>Claude Analysis]
    end

    subgraph Routes
        U[upload.ts<br>POST /api/upload]
        S[search.ts<br>POST /api/search]
    end

    U --> P
    U --> E
    U --> V
    S --> E
    S --> V
    S --> L
```

## Quick Start

### Prerequisites

- Node.js 18+
- A [Pinecone](https://www.pinecone.io/) account (free tier works)
- An [OpenAI](https://platform.openai.com/) API key
- An [Anthropic](https://console.anthropic.com/) API key

### Pinecone Setup

Create an index in the Pinecone console:
- **Name:** `testlens`
- **Dimensions:** `1536` (matches text-embedding-3-small)
- **Metric:** `cosine`

### Run the Backend

```bash
cd backend
cp .env.example .env
# Fill in your API keys in .env

npm install
npm run dev
```

Server starts at `http://localhost:3000`

## API Reference

### `POST /api/upload`

Upload a CSV or XLSX file containing test cases.

| Field | Type | Description |
|-------|------|-------------|
| file  | File | CSV or XLSX with a "Description" column |

**Response:**
```json
{ "success": true, "count": 30 }
```

### `POST /api/search`

Find relevant test cases for a user story.

| Field     | Type   | Required | Description |
|-----------|--------|----------|-------------|
| userStory | string | yes      | The user story to match against |
| topK      | number | no       | Number of results (default: 5, max: 20) |

**Response:**
```json
{
  "userStory": "As a user, I want to reset my password",
  "results": [
    {
      "testCase": "Verify password reset email is sent",
      "relevance": "high",
      "riskScore": 5,
      "reason": "Directly tests the core password reset functionality"
    }
  ]
}
```

### `GET /api/health`

Health check endpoint.

## Tech Stack

| Component   | Technology |
|-------------|-----------|
| Runtime     | Node.js + TypeScript |
| Server      | Express.js |
| Embeddings  | OpenAI text-embedding-3-small |
| Vector DB   | Pinecone |
| LLM         | Anthropic Claude (claude-haiku-4-5) |
| File Parse  | xlsx library |

## Test Data

Sample files are in `backend/test-data/`:
- `sample-tests.csv` — 30 e-commerce regression test cases
- `sample-user-stories.json` — 5 sample user stories for testing search
