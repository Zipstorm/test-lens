# ADR-003: Xray vs Jira Import Strategy

## Status

Accepted

## Context

Users store test cases in different systems. The two primary sources for Test Lens are:

- **Jira Cloud** -- Standard Jira issues with summary, description, and labels. Available to any Jira user.
- **Xray Cloud** -- A Jira plugin that stores structured test data including steps, preconditions, Gherkin definitions, folder hierarchy, and test type classification.

We need to decide how to handle both sources and whether to favor one over the other.

## Decision

Support both import modes, with Xray as the recommended default for users who have it available.

### Feature Comparison

| Feature | Jira Import | Xray Import |
|---|---|---|
| Auth mechanism | Basic Auth (email + API token) | OAuth2 (client ID + secret) |
| API style | REST v3 | GraphQL |
| Data richness | Summary + description + labels | + steps, preconditions, Gherkin, folder, test type |
| Embedding quality | Basic (summary only) | Rich (combined text from all fields) |
| Setup complexity | Simple (email + token) | Moderate (need Xray Cloud subscription) |
| Module derivation | From labels (filtered) | From folder path (preferred) or labels |

### How They Converge

Despite the different data sources and APIs, both import paths converge into the same downstream pipeline:

1. Both paths produce `TestCase[]` objects with a normalized structure.
2. Both feed into the same `embedBatch()` function for vector generation.
3. Both go through the same `buildIndex()` pipeline to upsert into Pinecone.
4. The source is tagged differently in Pinecone metadata: `"jira:QA"` vs `"xray:QA"`.

This means the search, analysis, and gap detection features work identically regardless of import source.

## Consequences

### Positive

- **Low barrier to entry:** Users can start with Jira import even without an Xray subscription. This makes the tool accessible to teams that only have standard Jira.
- **Better results with Xray:** Xray import produces significantly better search results due to richer embeddings. The additional fields (steps, preconditions, Gherkin) give the embedding model much more semantic signal to work with.
- **Easy switching:** The frontend toggle makes switching between import modes trivial. Users can try Jira import first and upgrade to Xray later without any data migration.

### Trade-offs

- **Dual auth configuration:** Two separate authentication mechanisms need to be maintained and documented. Users may find it confusing to configure both.
- **Xray cost:** Xray requires a paid subscription. Jira import is sufficient for basic usage, but users miss out on the richer data without Xray.
