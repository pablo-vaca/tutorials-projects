# Consolidated Action Items

Deduplicated from ADRs, First Principles, War Room, Pre-mortem, Expert Panel, Reverse Engineering, and Lessons Learned analyses.

## P0 — Critical (do first)

| # | Action | Sources |
|---|--------|---------|
| 1 | **Add observability:** queue depth per job type, processing latency, worker health, stale job detection | War Room, Pre-mortem S1, S5 |
| 2 | **Document ETL pipeline flow** as diagram + state machine (see [technology-stack.md](technology-stack.md)) | War Room, First Principles |
| 3 | **Dead letter queue** for jobs exceeding max retries, with alerting | Pre-mortem S1, ADR-2 |

## P1 — High (do soon)

| # | Action | Sources |
|---|--------|---------|
| 4 | **Circuit breakers on external API clients** (SharePoint, embeddings, document processing) | War Room, Pre-mortem S2 |
| 5 | **Heartbeat-based lock renewal** in long-running handlers (PDF processing) | War Room, Pre-mortem S3, ADR-7 |
| 6 | **File status rollback** on job failure — revert to previous state, not stuck forever | Pre-mortem S1 |
| 7 | **Compound unique index `{fileId, chunkIndex}`** on vectors collection | Pre-mortem S3 |
| 8 | **Create root README** with architecture overview | War Room |
| 9 | **Configure `HttpModule.register({ timeout: 30000 })`** — prevent indefinite worker hangs on external API calls | Expert Panel (Okonkwo, Ramirez) |
| 10 | **Add `nextRetryAt` with exponential backoff** to queue schema — prevent immediate retry amplifying failures | Expert Panel (Ramirez) |

## P2 — Medium (plan for next sprint)

| # | Action | Sources |
|---|--------|---------|
| 11 | **Single-flight token refresh** + staggered project sync | Pre-mortem S2, War Room |
| 12 | **Validate job payloads at queue boundary** (fail fast, not deep in handlers) | War Room |
| 13 | **Extract job type config** from god module (`etl.module.ts`) to declarative config | War Room, First Principles |
| 14 | **Size MongoDB connection pool** to total worker concurrency + headroom | Pre-mortem S5 |
| 15 | **Add idempotency key `{jobType, jobId, attempt}`** to prevent duplicate processing on retry | Expert Panel (Ramirez) |
| 16 | **Add fencing tokens to semaphore** — prevent ABA problem under contention | Expert Panel (Ramirez) |
| 17 | **Split `EtlService`** into focused services (FileOps, Embeddings, Config, Orchestration) | Expert Panel (Okonkwo) |
| 18 | **Add `embeddingModelVersion` to vector schema** + reindex job for model upgrades | Expert Panel (Park) |
| 19 | **Add per-project cost tracking** for LLM/embedding API calls | Expert Panel (Park) |

## P3 — Low (backlog)

| # | Action | Sources |
|---|--------|---------|
| 20 | **Document "no-Redis" constraint** explicitly — if not real, evaluate BullMQ | First Principles, ADR-1 |
| 21 | **Reduce 23 job types** to ~8 generic steps + source discriminator | First Principles, ADR-4 |
| 22 | **Extract pipeline flow** into declarative state machine config | First Principles |
| 23 | **Clarify vector storage strategy** (staging vs final store, Atlas Vector Search?) | First Principles, Reverse Eng. ES1 |
| 24 | **Startup validation** for Mongoose discriminator registration | Pre-mortem S4 |
| 25 | **Deprecate one classification backend** (Mastra or LangChain) | ADR-6 |
| 26 | **Consider publishing queue-manager** as independent npm package | First Principles |
| 27 | **Cap history arrays** with `$push` + `$slice` (max 100 entries) on EtlConfig and File | Expert Panel (Chen) |
| 28 | **Remove `chunks: ObjectId[]`** from File schema — query by `fileId` instead | Expert Panel (Chen) |
| 29 | **Add FIFO tiebreaker `createdAt`** to queue sort index | Expert Panel (Ramirez) |
| 30 | **Replace recursive polling** with while-loop in `GenericQueueService.runWorker()` | Expert Panel (Okonkwo) |
| 31 | **Wrap `onModuleInit`** in try-catch for degraded mode startup | Expert Panel (Okonkwo) |
| 32 | **Dynamic embedding batch size** based on token estimation per chunk | Expert Panel (Park) |
| 33 | **Use write concern `"majority"`** for semaphore operations on replica sets | Expert Panel (Chen, Ramirez) |
| 34 | **Expand `index.ts` exports** in etl-manager — only 2 symbols exported, 98% of API internal-only | Reverse Eng. ES3 |
| 35 | **Implement `ETL_PROCESS_FULL` handler** — currently a stub that returns success without work | Reverse Eng. ES3 |
| 36 | **Complete `upsertFileFromDelta` TODO** — re-processing after delta delete is missing | Reverse Eng. ES3 |
| 37 | **Remove deprecated `DocumentProcessingClient`** — two competing chunk generation paths | Reverse Eng. ES3 |
| 38 | **Implement `CANCELLED`/`PAUSED` queue state transitions** — enum values exist but no code paths | Reverse Eng. ES4 |
| 39 | **Remove `MongoQueueModule` hard-dep** from `GenericQueueModule.forRoot()` default | Reverse Eng. ES4 |
| 40 | **Unify file processing status flows** — legacy and new status enums overlap with no enforced transitions | Reverse Eng. ES1 |

---
