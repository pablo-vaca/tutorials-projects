# First Principles Analysis

## Fundamental Requirements (Irreducible)

**etl-manager must:**
1. Accept documents from external sources (SharePoint, S3, local)
2. Transform documents through a pipeline: download -> chunk -> embed -> store vectors
3. Handle failures at any pipeline step without losing work
4. Track state of each document through the pipeline
5. Support incremental sync (not re-process everything)
6. Classify documents using LLM
7. Process PDF files (split pages, convert to images/markdown)
8. Prevent concurrent processing of the same resource

**queue-manager must:**
1. Accept jobs and process them asynchronously
2. Guarantee at-least-once delivery (no lost jobs)
3. Support configurable concurrency per job type
4. Handle job failure with retry
5. Optionally track batch progress
6. Optionally schedule recurring jobs

## Assumptions Identified

| # | Assumption | Validity |
|---|-----------|----------|
| A1 | MongoDB needed for everything (queue, vectors, semaphores, configs) | Valid only if "no-Redis" is a real constraint — **not documented** |
| A2 | 23 job types must be statically defined at module init | Over-decomposition — many are source-specific variants of ~8 generic steps |
| A3 | Pipeline step chaining belongs in handler code | Incorrect — pipeline flow is a configuration concern, not a handler concern |
| A4 | Custom queue implementation needed (vs BullMQ/Agenda) | Valid only under no-Redis constraint; BullMQ would eliminate ~80% of queue-manager |
| A5 | Polling is the right consumption model | Pragmatic given MongoDB-only, but Change Streams would eliminate empty polls |
| A6 | Two classification backends provide resilience | Doubles testing surface for marginal benefit |
| A7 | Vectors belong in MongoDB | Valid if this is a write-only staging area; unclear if vector search also happens here |
| A8 | queue-manager should be a separate library | **Strongly justified** — zero domain coupling, genuinely reusable |
| A9 | Cron jobs belong in queue-manager | Pragmatically acceptable — shared infra, independent `.forRoot()` usage |

## Key Findings

**1. The "no-Redis" constraint should be explicitly documented**

Both libraries' entire architecture flows from the decision to use MongoDB exclusively. If Redis were ever adopted (for queue, semaphore, or caching), BullMQ would replace the custom queue implementation, Redlock would replace the semaphore, and ~2000 LOC in queue-manager could be eliminated. This constraint drives everything and is currently implicit.

**2. Job types could be reduced from 23 to ~8 generic pipeline steps**

The fundamental ETL pipeline is: `Source -> Download -> Transform -> Chunk -> Embed -> Store` (5-6 steps). The 23 types exist because each source type (SharePoint direct, SharePoint delta, S3) gets its own types, PDF has a parallel sub-pipeline, and there are legacy paths alongside new ones. A `{source_type, pipeline_step}` composite key would simplify module registration and make the pipeline visible.

**3. Pipeline flow should be declarative, not scattered in handlers**

Currently, handler A knows to queue job type B on success. This makes the full ETL flow invisible without reading every handler. A declarative pipeline definition would centralize the flow:

```typescript
// Example: Declarative pipeline (not current implementation)
const ETL_PIPELINE = {
  'download': { next: 'analyze', onError: 'mark_failed' },
  'analyze':  { next: 'split_or_chunk', onError: 'mark_failed' },
  'chunk':    { next: 'embed', onError: 'retry_chunk' },
  'embed':    { next: 'vectorize', onError: 'retry_embed' },
  'vectorize': { next: null, onError: 'mark_failed' },
};
```

**4. Vector storage strategy needs clarification**

Vectors are written to `dealroomdocsvectors` collection with `page_embeddings: number[]`. No vector similarity search exists in this library — it's a write path only. The collection name suggests a legacy direct-query pattern. It should be clarified whether vector search happens against MongoDB (Atlas Vector Search) or if vectors move to a dedicated store downstream.

**5. queue-manager is a genuinely reusable library**

The clean `IQueueProvider` interface, zero ETL domain knowledge, and independent module patterns confirm this is not an artificial split. It could be published as an independent npm package.

---
