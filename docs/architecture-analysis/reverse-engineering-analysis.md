# Reverse Engineering Analysis

Working backwards from four desired end states to reveal implementation gaps.

## End State 1: A Fully Processed Document

**What "done" looks like:** A file enters as a SharePoint URL and exits as N vector documents in `dealroomdocsvectors`, each containing `page_content`, `page_embeddings` (float array), and `document_meta` (with optional classification). The file record reaches `processingStatus: "completed"` with `embeddingsStored: true`.

| Step (reverse) | Required State | Current Reality | Gap |
|---|---|---|---|
| Vectors searchable | Atlas Vector Search index on `page_embeddings` | No vector index — collection is write-only | No search capability on stored vectors |
| Vectors unique | `{fileId, chunkIndex}` compound unique index | No uniqueness constraint | Duplicate vectors on semaphore expiry |
| Embeddings versioned | `embeddingModelVersion` tracked per vector | No version field | Model upgrade = full reprocess |
| Chunks validated | Empty/corrupt chunks rejected before embedding | No validation gate | Wasted embedding API calls on bad data |
| File downloaded | Streaming for large files | Full file loaded into memory (`arraybuffer`) | Memory spike on large files (>100MB) |
| Pipeline states enforced | Single state machine with defined transitions | Two overlapping status flows (legacy + new) coexist | Ambiguous intermediate states |

## End State 2: A Reliable Job Lifecycle

**What "done" looks like:** A job is enqueued, claimed by exactly one worker, processed, and either completed or moved to DLQ after max retries. Every job has a deterministic outcome.

| Step (reverse) | Required State | Current Reality | Gap |
|---|---|---|---|
| Failed job preserved | DLQ captures exhausted jobs with full error context | Jobs silently deleted after max retries | Silent data loss |
| Retried with backoff | `nextRetryAt = now + baseDelay * 2^tries` | Failed job immediately visible for re-claim | Retry storms under load |
| Claimed exclusively | Fencing token prevents stale worker writes | No fencing — ABA problem possible | Stale worker overwrites |
| Outcome idempotent | `{jobType, jobId, attempt}` idempotency key | No dedup mechanism | Duplicate processing on retry |
| Queue pausable | `CANCELLED` and `PAUSED` states operational | Enum values exist but no code paths set them | No operational pause/cancel |

## End State 3: A Production-Ready Public API

**What "done" looks like:** A consumer imports `@tutorials/etl-manager`, calls documented methods, and the library handles all internal complexity.

| Step (reverse) | Required State | Current Reality | Gap |
|---|---|---|---|
| Consumer uses typed API | All DTOs, services, types exported | `index.ts` exports only 2 symbols (`EtlManagerModule`, `EtlManagerService`) | 98% of API surface internal-only |
| Pipeline triggered cleanly | Single entry point starts full pipeline | `ETL_PROCESS_FULL` handler is a stub returning `{ success: true }` without work | Full-pipeline trigger unimplemented |
| Deprecated paths removed | One chunk generation path | `DocumentProcessingClient` (remote) and local chunking coexist | Two competing chunk paths |
| Delta re-processes | `upsertFileFromDelta` re-queues after delete | Explicit `// TODO: Start chained queue process` | Re-processing after delta delete missing |
| Classification standalone | Classification results stored independently | `DocumentClassification` schema exists but only used as embedded prop | No standalone classification storage |

## End State 4: A Truly Storage-Agnostic Queue

**What "done" looks like:** `GenericQueueModule.forRoot({ queueProvider: RedisQueueService })` swaps backends with zero consumer changes.

| Step (reverse) | Required State | Current Reality | Gap |
|---|---|---|---|
| Any backend works | `forRoot()` with no hard-coded deps | Default path imports `MongoQueueModule` (acknowledged TODO) | Hard MongoDB coupling in defaults |
| Provider contract complete | All lifecycle states reachable via interface | `CANCELLED`/`PAUSED` in enum but no provider methods | Incomplete state machine |
| Batch tracking independent | Batch API works with any provider | `IBatchProvider` only has Mongo impl (but correctly optional) | OK — no gap |

---
