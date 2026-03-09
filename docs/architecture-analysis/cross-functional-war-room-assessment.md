# Cross-Functional War Room Assessment

**Participants:** PM (delivery/onboarding), Senior Backend Engineer (maintainability/testability), DevOps/SRE (operations/scale)

## Feasibility — 7/10

**Strengths:**
- `BaseQueueConsumer<T>` abstract class is well-typed and testable
- Mongoose schemas have proper indexes and clean structure
- Exception hierarchy (`EtlException` -> specialized types) ensures consistent error handling
- Feature flags enable gradual rollouts
- `IQueueProvider` abstraction is idiomatic NestJS

**Concerns:**
- Testing the full pipeline requires 8+ mocks (SharePoint, document processing, embeddings, queue, file service, chunk service, vector service, semaphore) — tight coupling between handlers and services
- Adding a new data source (e.g., Google Drive) requires touching 7+ files (shotgun surgery): discriminator schema, config entity, service, handler, job types, DTOs, controller
- `etl.module.ts` is a god module: 18 job type registrations with inline config, 7 module imports — easy to misconfigure

## Desirability (Developer Experience) — 4/10

**Strengths:**
- queue-manager has examples (`demo-queue-lifecycle.ts`, `usage-examples.ts`) and thorough cron-jobs README (399 lines)
- Nx tags (`scope:backend`, `type:lib`) enable dependency rules and build caching

**Concerns:**
- No root README — zero guidance for new developers cloning the repo
- etl-manager has zero documentation for 60+ source files, 23 job types, 14 schemas, and multiple external API integrations — all knowledge is tribal
- Debugging a failed job is a treasure hunt: job type names don't map to filenames, routing logic in `etl.processor.ts` is inconsistent (some dispatched to handlers, some inline)
- Job data types are discriminated unions but lack runtime validation at the queue boundary — wrong payloads fail deep in handlers with cryptic Mongoose errors

## Viability (Operations & Scale) — 5/10

**Critical operational gaps:**

1. **No circuit breakers on external APIs.** SharePoint, document processing, and embeddings clients have no circuit breaker or backoff. If an external service degrades, failed jobs retry endlessly, hammering both the queue and the failed API.

2. **Queue backpressure is invisible.** No metrics for queue depth by job type, average processing time, or worker utilization. If embeddings API slows, jobs accumulate silently until visibility timeouts cascade.

3. **Semaphore TTL risk.** Default TTL is 120 seconds, but PDF processing can take minutes. If a lock expires mid-processing, another worker picks up the same file. The `refresh()` method exists but is not called during long operations — needs heartbeat-based renewal.

4. **SharePoint token thundering herd.** Token caching with 5-minute refresh buffer means multiple workers can hit the refresh window simultaneously. Token refresh should be serialized with a single-flight pattern.

5. **Single MongoDB SPOF.** Queue, data, locking, cron scheduling, and vector storage all share one MongoDB instance. If Mongo goes down, everything fails simultaneously.

---
