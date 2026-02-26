# Test Lens — Documentation

Comprehensive documentation for the Test Lens project: an AI-powered regression test selector.

> For quick start and project overview, see the [root README](../README.md).

---

## Table of Contents

### Core Documentation

| Document | Description |
|----------|-------------|
| [System Design](system-design.md) | Full system architecture, service layer, pipelines, and design decisions |
| [API Reference](api-reference.md) | All 11 REST endpoints with request/response schemas and examples |
| [Data Model](data-model.md) | TypeScript interfaces, Pinecone metadata schema, and data transformation chains |

### Architecture Decision Records

| ADR | Title |
|-----|-------|
| [ADR-001](adr/001-embedding-model-choice.md) | Embedding Model Choice — `text-embedding-3-small` at 1536 dimensions |
| [ADR-002](adr/002-dedup-via-sha256-hash.md) | Deduplication via SHA-256 Content Hash |
| [ADR-003](adr/003-xray-vs-jira-import.md) | Supporting Both Xray and Jira Import Modes |

### Setup Guides

| Guide | Description |
|-------|-------------|
| [Environment Setup](setup/environment-setup.md) | Complete setup: env vars, Pinecone, Jira, Xray, Docker, and local dev |
| [Pinecone Setup](../backend/SETUP-PINECONE.md) | Step-by-step Pinecone index creation (in backend/) |

### Diagrams

All diagrams are in [Excalidraw](https://excalidraw.com) format — open them at [excalidraw.com](https://excalidraw.com) or in VS Code with the Excalidraw extension.

| Diagram | Description |
|---------|-------------|
| [System Architecture](diagrams/system-architecture.excalidraw) | High-level boxes & arrows: Frontend, Backend, external services, Docker Compose boundary |
| [Data Pipeline](diagrams/data-pipeline.excalidraw) | Two swim lanes: Import pipeline (CSV/Jira/Xray → embed → index) and Search pipeline (query → search → analyze) |
| [Frontend Component Tree](diagrams/frontend-component-tree.excalidraw) | React component hierarchy with state flow, props, and API call annotations |
| [Knowledge Graph](diagrams/knowledge-graph.excalidraw) | Mindmap: central "Test Lens" node with branches for Data Sources, AI/ML, Storage, Frontend, Infrastructure |

---

## How to Open Excalidraw Files

**Option 1 — Web:**
1. Go to [excalidraw.com](https://excalidraw.com)
2. Click the hamburger menu (☰) → **Open**
3. Select the `.excalidraw` file

**Option 2 — VS Code:**
1. Install the [Excalidraw extension](https://marketplace.visualstudio.com/items?itemName=pomdtr.excalidraw-editor)
2. Open any `.excalidraw` file directly in the editor

---

## Document Map

```
docs/
├── README.md                              ← You are here
├── system-design.md                       # System architecture & design
├── api-reference.md                       # API endpoint reference
├── data-model.md                          # Types, schemas & transformations
├── adr/
│   ├── 001-embedding-model-choice.md      # Why text-embedding-3-small
│   ├── 002-dedup-via-sha256-hash.md       # SHA-256 vector ID strategy
│   └── 003-xray-vs-jira-import.md         # Dual import mode rationale
├── diagrams/
│   ├── system-architecture.excalidraw     # High-level architecture
│   ├── data-pipeline.excalidraw           # Import & search pipelines
│   ├── frontend-component-tree.excalidraw # React component hierarchy
│   └── knowledge-graph.excalidraw         # Project knowledge mindmap
└── setup/
    └── environment-setup.md               # Complete environment setup
```
