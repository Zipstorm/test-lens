# ADR-001: Embedding Model Choice

## Status

Accepted

## Context

We need to choose an embedding model for converting test case text into vectors for semantic search in the Test Lens application. The vectors are stored in Pinecone and used to find similar or duplicate test cases across projects.

Options considered:

- **text-embedding-3-small** -- OpenAI's compact embedding model (1536 native dimensions)
- **text-embedding-3-large** -- OpenAI's high-fidelity embedding model (3072 native dimensions)
- **text-embedding-ada-002** -- OpenAI's legacy embedding model (1536 dimensions)

Key evaluation criteria for a hackathon POC: cost, speed, quality for test case similarity matching, and compatibility with Pinecone free tier.

## Decision

Use OpenAI `text-embedding-3-small` with explicit `dimensions: 1536`.

### Reasons

- **Cost:** Approximately 5x cheaper than text-embedding-3-large ($0.02 vs $0.13 per million tokens). For a POC that may re-embed frequently during development, this matters.
- **Speed:** Faster inference latency, which keeps the upload and search workflows responsive.
- **Quality:** Sufficient for test case similarity matching. Test cases tend to use domain-specific but relatively straightforward language where subtle semantic distinctions are less critical.
- **Dimension size:** 1536 dimensions provides a good balance of embedding quality vs storage and compute cost. This is the model's native output size, so no dimension truncation is needed.
- **Pinecone compatibility:** The Pinecone free tier (Starter plan) handles 1536-dimensional vectors without issue.

## Consequences

### Positive

- Fast and cheap for rapid iteration during a hackathon POC.
- Good embedding quality for test case deduplication and similarity search.
- Can upgrade to `text-embedding-3-large` for production without changing the Pinecone index configuration -- just re-embed existing vectors.

### Trade-offs

- Slightly lower quality than the large model for nuanced semantic distinctions between closely worded test cases.

### Mitigation

- The Claude LLM analysis layer that runs after vector search compensates for embedding limitations. Claude re-ranks and interprets results with full language understanding, catching cases where embeddings alone might miss subtle differences.
