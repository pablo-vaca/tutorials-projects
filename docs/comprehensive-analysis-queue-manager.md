# Comprehensive Analysis: queue-manager

> Always-on pattern scans: configuration, auth/security, entry points, shared code, async/events, CI/CD.
> Generated: 2026-03-09 | Scan level: exhaustive

## Table of Contents

- [Configuration Management](#configuration-management)
- [Authentication and Security](#authentication-and-security)
- [Entry Points and Bootstrap](#entry-points-and-bootstrap)
- [Shared Code and Provider Architecture](#shared-code-and-provider-architecture)
- [Async and Event-Driven Architecture](#async-and-event-driven-architecture)
- [CI/CD and Build System](#cicd-and-build-system)

---

## Configuration Management

### Module Options Pattern

Queue-manager uses NestJS dynamic module pattern for configuration:

**GenericQueueModule.forRoot(options)**

```typescript
interface GenericQueueModuleOptions {
  enableBatches?: boolean;        // Default: true
  queueProvider?: Type<IQueueProvider>;   // Default: MongoQueueService
  batchProvider?: Type<IBatchProvider>;    // Default: MongoQueueBatchService
  imports?: Array<Type | DynamicModule>;  // Default: [MongoQueueModule]
}
```

- **Default behavior:** MongoDB-backed queue and batch tracking
- **Custom providers:** Swap queue backend by injecting different `IQueueProvider`
- **Global module:** Registered globally, available to all modules in the application

**CronJobsModule.forRoot/forFeature(options)**

```typescript
interface CronJobsModuleOptions {
  enablePersistence?: boolean;  // Default: false
}
```

- **Without persistence:** In-memory cron scheduling only
- **With persistence:** MongoDB models for config and execution history

### ConfigService Usage

`MongoQueueModule` injects `@nestjs/config` ConfigService to read:

| Variable | Purpose | Default |
|----------|---------|---------|
| `JOB_CLEANER_CRON` | Cron schedule for queue cleanup | `CronTimeExpression.EVERY_HOUR` |

### Constants-Based Defaults

Hardcoded defaults in constants files:

| Constant | Value | File |
|----------|-------|------|
| `DEFAULT_CONCURRENCY` | `1` | `generic-queue.constants.ts` |
| `DEFAULT_POLL_INTERVAL_MS` | `1000` | `generic-queue.constants.ts` |
| `DEFAULT_MAX_RETRIES` | `3` | `generic-queue.constants.ts` |
| `DEFAULT_VISIBILITY_TIMEOUT_SECONDS` | `30` | `generic-queue.constants.ts` |
| `DEFAULT_DELAY_SECONDS` | `0` | `mongo-queue.constants.ts` |
| `EXECUTION_HISTORY_RETENTION_DAYS` | `30` | `cron-jobs.constants.ts` |

---

## Authentication and Security

**No authentication or security patterns** in queue-manager.

This is by design — queue-manager is a pure infrastructure library. Authentication is the responsibility of the consuming application. The `CronJobsController` endpoints are unguarded; consuming apps should add guards as needed.

---

## Entry Points and Bootstrap

### Module Hierarchy

```
QueueManagerModule (library root — placeholder)
│
├── GenericQueueModule.forRoot()
│     ├── Provides: GenericQueueService, GenericBatchService
│     ├── DI tokens: QUEUE_PROVIDER, BATCH_PROVIDER
│     └── Default imports: MongoQueueModule
│
├── MongoQueueModule (MongoDB queue implementation)
│     ├── Provides: MongoQueueService, MongoQueueBatchService, MongoQueueUtilsService
│     ├── Registers: Mongoose models for queue_jobs, queue_batches
│     └── onModuleInit(): Registers job-cleaner cron job
│
└── CronJobsModule.forRoot/forFeature()
      ├── Provides: CronJobsService, CronJobsController
      └── (if persistence): Registers Mongoose models for cron_job_configs, cron_job_executions
```

### Library Public Exports

Via `libs/queue-manager/src/index.ts`:
- `QueueManagerModule` — Root module
- `QueueManagerService` — Placeholder service

Via barrel exports (`index.ts` in each sub-module):
- All services, interfaces, types, enums, constants listed in [api-contracts-queue-manager.md](./api-contracts-queue-manager.md)

### MongoQueueModule Bootstrap (`onModuleInit`)

Registers a `job-cleaner-sync` cron job:
- Schedule: `JOB_CLEANER_CRON` env var or `CronTimeExpression.EVERY_HOUR`
- Handler: `queueService.clean()` — removes soft-deleted/processed jobs

---

## Shared Code and Provider Architecture

### Provider Pattern (Strategy)

Queue-manager uses a provider-based architecture enabling backend swapping:

```
┌─────────────────────┐     ┌────────────────────┐
│  GenericQueueService │────>│   IQueueProvider    │  (interface)
│  (orchestration)     │     │                    │
└─────────────────────┘     └────────┬───────────┘
                                     │
                            ┌────────┴───────────┐
                            │  MongoQueueService  │  (default implementation)
                            └────────────────────┘

┌─────────────────────┐     ┌────────────────────┐
│  GenericBatchService │────>│   IBatchProvider    │  (interface)
│  (orchestration)     │     │                    │
└─────────────────────┘     └────────┬───────────┘
                                     │
                            ┌────────┴───────────┐
                            │MongoQueueBatchService│  (default implementation)
                            └────────────────────┘
```

### Abstract Base Class

`BaseQueueConsumer<T>` provides reusable job processor scaffolding:
- Logger context per consumer instance
- Abstract `process()` method for concrete implementations
- `executeJob()` wrapper with error handling and result formatting

### DI Token System

| Token | Type | Default Provider |
|-------|------|-----------------|
| `QUEUE_PROVIDER` | `IQueueProvider` | `MongoQueueService` |
| `BATCH_PROVIDER` | `IBatchProvider` | `MongoQueueBatchService` |

### NX Path Mappings

- `@tutorials/queue-manager` → `libs/queue-manager/src/index.ts`

### Consumers of This Library

- **etl-manager** imports: `GenericQueueModule`, `GenericQueueService`, `CronJobsModule`, `CronJobsService`, `BaseQueueConsumer`, `QueueJob`, `IJobResult`

---

## Async and Event-Driven Architecture

### Worker Pool with Polling

`GenericQueueService` manages a polling-based worker pool:

```
For each defined job type:
  1. Start polling loop (interval: pollIntervalMs, default 1s)
  2. Call provider.get([jobType]) to fetch visible jobs
  3. On job received:
     a. Execute registered handler
     b. On success: provider.ack(token) → remove job
     c. On failure: provider.ackError(token, error)
     d. If tries > maxRetries: permanent failure
  4. If no job: wait and poll again
```

### Visibility Timeout Pattern

MongoDB queue uses visibility timeout for distributed processing:

1. **Add job:** Insert document with `visible = now + delaySeconds`
2. **Get job:** `findOneAndUpdate` where `visible < now` AND `deleted IS null`:
   - Set `ack` = random token
   - Set `visible` = now + visibilityTimeoutSeconds
   - Increment `tries`
3. **Acknowledge:** Remove document (success) or mark failed
4. **Timeout:** If worker crashes, `visible` expires → job becomes available

### Priority Queue

Jobs sorted by:
1. `order` (ascending) — explicit execution order
2. `priority` (descending) — QueuePriorityEnum: LOWEST(1) to HIGHEST(5)

### Unique Job Prevention

`addUnique()` checks for existing pending job with same `jobType`:
- If found: skips insertion (returns undefined)
- If not found: inserts normally

### Batch Tracking

Optional batch tracking with atomic progress updates:
- `createBatch(totalJobs)` → returns batchId
- `markJobCompleted(batchId)` → atomic `$inc` on completedJobs
- `markJobFailed(batchId)` → atomic `$inc` on failedJobs
- Status auto-transitions: `pending` → `processing` → `completed`/`failed`

### Cron Job System

Dynamic cron job management with lifecycle:
1. **Register:** `registerCronJob(config, handler)` → creates CronJob in NestJS SchedulerRegistry
2. **Execute:** Handler called on cron tick with `CronJobContext`
3. **Track:** Execution count, failure count, duration, last/next execution
4. **Persist (optional):** Save configs and execution history to MongoDB
5. **Cleanup:** TTL index auto-removes execution records after 30 days

---

## CI/CD and Build System

### NX Build Configuration

**File:** `libs/queue-manager/project.json`

| Target | Executor | Output |
|--------|----------|--------|
| `build` | `@nx/js:tsc` | `dist/libs/queue-manager` |
| `test` | `@nx/jest:jest` | `coverage/libs/queue-manager` |

**Tags:** `scope:backend`, `type:lib`

### npm Scripts

```
test:queue  → nx test queue-manager
test:libs   → nx run-many --target=test --projects=etl-manager,queue-manager
build:libs  → nx run-many --target=build --projects=etl-manager,queue-manager
```

### Testing

- Jest test runner with NestJS testing utilities (`@nestjs/testing`)
- Spec files: `*.spec.ts` convention
- Coverage output: `coverage/libs/queue-manager`
- Notable test files: `mongo-queue-utils.service.spec.ts`, `generic-queue.service.spec.ts`

### No CI/CD Pipeline Files

No `.github/workflows/`, `.gitlab-ci.yml`, or similar CI/CD configuration files found in the repository.
