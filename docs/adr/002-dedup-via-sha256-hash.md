# ADR-002: Deduplication via SHA-256 Hash

## Status

Accepted

## Context

When users upload the same CSV file twice, or import from Jira/Xray multiple times, we need to prevent duplicate vectors from accumulating in Pinecone. Without deduplication, repeated imports would create redundant vectors that pollute search results and waste storage.

We need a strategy that is:

- Deterministic (same input always produces the same result)
- Fast (no extra API calls or lookups)
- Simple (minimal code for a POC)

## Decision

Use `SHA-256(text).slice(0, 16)` as the Pinecone vector ID. Because the same text content always produces the same hash, uploading identical test cases results in the same vector ID, which Pinecone treats as an upsert (overwrite).

### Implementation

```typescript
import crypto from "crypto";

function hashId(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
}
```

The `text` input is the combined test case content (summary, description, steps, etc.) that gets embedded. The resulting 16 hex character string serves as the Pinecone vector ID.

### How It Works

1. User uploads a CSV or triggers a Jira/Xray import.
2. For each test case, the combined text is hashed to produce a vector ID.
3. The vector is upserted into Pinecone using this ID.
4. If the same test case already exists (same text = same hash = same ID), Pinecone overwrites the existing vector. No duplicate is created.

## Consequences

### Positive

- **Idempotent uploads:** Re-uploading the same file is safe. Same IDs result in overwrites, not duplicates.
- **Cross-file dedup:** Different files containing overlapping test cases are automatically deduplicated since the hash is based on content, not file identity.
- **No separate dedup logic:** The deduplication is a natural side effect of the ID generation strategy. No extra database queries or comparison steps are needed.

### Trade-offs

- **No fuzzy dedup:** The same test worded differently (e.g., "Verify login works" vs "Validate login functionality") gets different IDs. Content-based hashing only catches exact textual matches.
- **Hash space:** 16 hex characters = 64 bits of hash space. The collision probability is negligible for test suites under millions of entries (birthday paradox threshold is around 2^32 ~ 4 billion entries for 50% collision probability at 64 bits).
- **Stale vectors on edits:** If test text is edited slightly, a new vector is created while the old one remains in Pinecone. This is acceptable for a POC but would need a cleanup strategy in production.
