# Pre-mortem Analysis

Five failure scenarios imagined 6 months into the future, working backwards to identify causes and prevention.

## Scenario 1: Silent Data Loss — HIGH likelihood, CRITICAL impact

**What happens:** 847 jobs stuck in `IN_PROGRESS` with expired visibility timeouts. Workers crashed mid-processing and jobs exceeded `maxRetries` (3). No alert fired, no dead letter queue captured them. Files permanently stuck at `processingStatus: "embeddings-creating"`.

**Root causes:** No DLQ for exhausted retries. File status not rolled back on job failure. No monitoring for stale jobs or queue depth.

**Prevention:**
- Dead letter queue for jobs exceeding max retries (with alerting)
- File status rollback on job failure — revert to previous state
- Stale job detector cron — find `IN_PROGRESS` jobs older than 2x visibility timeout
- Structured error logging with error category (network, auth, validation, internal)

## Scenario 2: Thundering Herd Meltdown — MEDIUM likelihood, HIGH impact

**What happens:** Monday 9 AM, delta sync fires for 200 projects simultaneously. Each triggers independent Azure AD token refresh. Azure throttles the app. Token requests timeout. Every sync job fails and retries immediately. MongoDB CPU spikes to 100% from polling + retry storm. All ETL processing halts for 45 minutes.

**Root causes:** All projects sync simultaneously. No token sharing. No rate limiting. Immediate retries amplify load. No backpressure mechanism.

**Prevention:**
- Stagger project sync across the cron window (not all at once)
- Single-flight token refresh — one in-flight at a time, others wait for result
- Exponential backoff on retry (1s -> 2s -> 4s -> 8s delays)
- Adaptive polling — increase poll interval when error rate exceeds threshold
- Concurrency limit on sync orchestrator (max N projects in parallel)

## Scenario 3: Duplicate Processing Disaster — MEDIUM likelihood, HIGH impact

**What happens:** A 500-page PDF takes 8 minutes to process. Semaphore TTL is 120 seconds. Lock expires after 2 minutes. A second worker picks up the same file. Both complete. Vector store has duplicate chunks. Search results return doubled content. Classification confidence degrades.

**Root causes:** No heartbeat renewal during long operations. No idempotency on vector insertion (`unordered: true` only deduplicates on `_id`, not content). No `{fileId, chunkIndex}` compound unique index on vectors.

**Prevention:**
- Heartbeat-based lock renewal — worker calls `refresh()` every 30s during processing
- Dynamic TTL — set based on expected processing time (file size -> estimated duration)
- Compound unique index on `{fileId, chunkIndex}` in vectors collection
- Pre-check before processing — verify file status hasn't changed since job was queued

## Scenario 4: Cascading Schema Migration — LOW likelihood, MEDIUM impact

**What happens:** Developer adds Google Drive data source. Discriminator key `"GoogleDrive"` doesn't match enum value `"google_drive"`. Existing configs work fine. New configs persist but can't be read back. Bug discovered 3 weeks later after "working" Google Drive integration.

**Root causes:** Manual discriminator registration is error-prone. No validation that discriminator key matches enum. No integration test that round-trips each source type. Shotgun surgery (7+ files) increases inconsistency odds.

**Prevention:**
- Auto-generate discriminator keys from `DataSourceType` enum values
- Startup validation — verify all discriminator types can be instantiated and round-tripped
- Integration test per source type — create, save, read, query for each `DataSourceType`
- Checklist document: "Adding a new data source" with all files to modify

## Scenario 5: Invisible Queue Starvation — MEDIUM likelihood, HIGH impact

**What happens:** High-volume job type with concurrency 20 consumes the MongoDB connection pool. Lower-priority jobs (cleanup, delta sync) can't acquire connections to poll. Delta sync falls days behind. Cleanup jobs never run. Disk usage grows. No per-job-type latency metric fires an alert.

**Root causes:** All job types share a single connection pool (default: 5-10). High-concurrency type issues 20 concurrent `findOneAndUpdate` calls. No per-job-type metrics. No priority-based resource allocation.

**Prevention:**
- Size connection pool >= sum of all job type concurrencies + headroom
- Per-job-type metrics: queue depth, processing latency, poll success rate
- Resource quotas — cap total concurrent workers within connection pool limits
- Alert on queue age — fire if oldest pending job > threshold for any job type

---
