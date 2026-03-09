# Expert Panel Review

Four domain specialists reviewed the architecture independently.

## Dr. Chen — MongoDB & Data Architecture

- **Unbounded history arrays** on EtlConfig and File risk the 16MB document limit. Cap with `$push` + `$slice`.
- **`chunks: ObjectId[]` on File schema** stores up to 10K IDs (240KB). Remove — query by `{ fileId }` instead.
- **Vector collection `dealroomdocsvectors`** — legacy name, 1536-dim embeddings with no vector index. Add Atlas Vector Search index or document as write-staging.
- **No write concern on semaphore.** Use `w: "majority"` on replica sets.
- **Queue indexes good** but completed jobs need TTL-based pruning.

## Ramirez — Distributed Systems

- **No idempotency mechanism.** Add idempotency key `{jobType, jobId, attempt}`.
- **No retry backoff.** Add `nextRetryAt` with exponential backoff.
- **Queue sort lacks FIFO tiebreaker.** Add `createdAt` to sort index.
- **Semaphore lacks fencing tokens.** ABA problem under contention.
- **Polling race condition** acceptable at moderate scale; claim-based batching at >100 workers.

## Okonkwo — NestJS & Node.js Platform

- **`etl.module.ts` god module** — extract 18 registrations to declarative config.
- **`EtlService` (15+ methods)** — split into FileOps, Embeddings, Config, Orchestration.
- **`HttpModule` no timeout** — set `timeout: 30000` minimum.
- **Recursive polling** — replace with `while(!stopRequested)` loop.
- **No `onModuleInit` error boundaries** — wrap in try-catch for degraded mode.

## Park — MLOps & AI Pipelines

- **No embedding model versioning.** Add `embeddingModelVersion` to vector schema + reindex job.
- **No classification evaluation loop.** Add `humanVerified` field and periodic accuracy check.
- **Dual backend without A/B testing.** Implement shadow mode or pick one.
- **Static embedding batch size (100).** Make dynamic based on token limits.
- **No cost tracking.** Add per-project API cost tracking.

---
