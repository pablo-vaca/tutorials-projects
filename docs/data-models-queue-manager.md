# Data Models: queue-manager

> Exhaustive scan of all MongoDB schemas, document interfaces, indexes, constraints, and data structures.
> Generated: 2026-03-09 | Scan level: exhaustive

## Table of Contents

- [MongoDB Schemas](#mongodb-schemas)
  - [QueueSchema](#queueschema)
  - [BatchSchema](#batchschema)
  - [CronJobConfigSchema](#cronjobconfigschema)
  - [CronJobExecutionSchema](#cronjobexecutionschema)
- [Document Interfaces](#document-interfaces)
- [Indexes and Constraints](#indexes-and-constraints)
- [Data Flow Patterns](#data-flow-patterns)
- [TTL and Cleanup](#ttl-and-cleanup)

---

## MongoDB Schemas

### QueueSchema

**Collection:** `queue_jobs`
**Timestamps:** Manual (`createdAt` field, no Mongoose timestamps)
**File:** `libs/queue-manager/src/lib/mongo-queue/schemas/queue.schema.ts`

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `visible` | Date | Yes | - | When job becomes visible for processing |
| `priority` | Number | Yes | `1` (LOWEST) | QueuePriorityEnum: 1-5 |
| `payload` | Mixed | Yes | - | Contains `jobType` (String, indexed) and `payload` (Mixed) |
| `ack` | String | No | `null` | Acknowledgement token, indexed |
| `tries` | Number | No | `0` | Retry attempt count |
| `deleted` | Date | No | `null` | Soft delete timestamp |
| `createdAt` | Date | No | `Date.now` | Creation timestamp |
| `order` | Number | No | `0` | Execution order |
| `status` | String | No | `'pending'` | QueueStatusEnum value |
| `producer` | String | No | `'not-producer'` | Producer identifier |

**Visibility Timeout Pattern:**
The queue uses a visibility timeout approach for distributed job processing:
1. `get()` atomically sets `ack` token and pushes `visible` forward by timeout seconds
2. Worker processes job, then calls `ack()` (success) or `ackError()` (failure)
3. If worker crashes, `visible` expires and job becomes available to other workers
4. `tries` increments on each `get()` call

### BatchSchema

**Collection:** `queue_batches`
**Timestamps:** createdAt, updatedAt (Mongoose)
**File:** `libs/queue-manager/src/lib/mongo-queue/schemas/batch.schema.ts`

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `batchId` | String | Yes | - | Unique batch identifier, indexed |
| `totalJobs` | Number | Yes | `0` | Total jobs in batch |
| `completedJobs` | Number | Yes | `0` | Completed count (atomic $inc) |
| `failedJobs` | Number | Yes | `0` | Failed count (atomic $inc) |
| `status` | String | No | `'pending'` | Enum: `pending`, `processing`, `completed`, `failed` |
| `metadata` | Mixed | No | `{}` | Custom metadata storage |

**Automatic Status Transitions:**
- `pending` → `processing` when first job completes/fails
- `processing` → `completed` when `completedJobs + failedJobs == totalJobs` and `failedJobs == 0`
- `processing` → `failed` when `completedJobs + failedJobs == totalJobs` and `failedJobs > 0`

### CronJobConfigSchema

**Collection:** `cron_job_configs`
**Timestamps:** createdAt, updatedAt (Mongoose)
**File:** `libs/queue-manager/src/lib/cron-jobs/schemas/cron-job-config.schema.ts`

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `name` | String | Yes | - | Unique job name, indexed |
| `cronTime` | String | Yes | - | Cron expression |
| `enabled` | Boolean | No | `true` | Job enabled state, indexed |
| `runOnInit` | Boolean | No | `false` | Run on module initialization |
| `timeZone` | String | No | `'America/New_York'` | Timezone for scheduling |
| `lastExecution` | Date | No | `null` | Last execution timestamp |
| `nextExecution` | Date | No | `null` | Next scheduled execution |
| `executionCount` | Number | No | `0` | Total executions |
| `failureCount` | Number | No | `0` | Total failures |

### CronJobExecutionSchema

**Collection:** `cron_job_executions`
**Timestamps:** createdAt only (updatedAt disabled)
**File:** `libs/queue-manager/src/lib/cron-jobs/schemas/cron-job-execution.schema.ts`

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `jobName` | String | Yes | - | Cron job name, indexed |
| `executedAt` | Date | Yes | - | Execution timestamp, indexed |
| `duration` | Number | Yes | - | Duration in milliseconds |
| `success` | Boolean | Yes | - | Success flag, indexed |
| `error` | Object | No | - | `{ message: String, stack: String }` |
| `context` | Object | No | - | `{ previousExecution?: Date, nextExecution?: Date }` |
| `executionCount` | Number | Yes | - | Total count at execution time |
| `failureCount` | Number | Yes | - | Total failures at execution time |

---

## Document Interfaces

### QueueDocument

```typescript
interface QueueDocument<TPayload = unknown> extends Document {
  visible: Date;
  priority: QueuePriorityEnum;
  payload: QueueMessagePayload<TPayload>;
  ack?: string | null;
  tries: number;
  deleted?: Date | null;
  createdAt: Date;
  order: number;
  status: QueueStatusEnum;
  producer: string;
}
```

### BatchDocument

```typescript
interface BatchDocument {
  _id: string;
  batchId: string;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  status: BatchStatus;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}
```

### CronJobConfigDocument

```typescript
interface CronJobConfigDocument extends Document {
  name: string;
  cronTime: string;
  enabled: boolean;
  runOnInit: boolean;
  timeZone: string;
  lastExecution?: Date | null;
  nextExecution?: Date | null;
  executionCount: number;
  failureCount: number;
  createdAt: Date;
  updatedAt: Date;
}
```

### CronJobExecutionDocument

```typescript
interface CronJobExecutionDocument extends Document {
  jobName: string;
  executedAt: Date;
  duration: number;
  success: boolean;
  error?: { message: string; stack?: string };
  context: { previousExecution?: Date; nextExecution?: Date };
  executionCount: number;
  failureCount: number;
  createdAt: Date;
}
```

---

## Indexes and Constraints

### QueueSchema Indexes

| Name | Fields | Type | Purpose |
|------|--------|------|---------|
| Primary query | `{ deleted: 1, visible: 1, 'payload.jobType': 1, order: 1, priority: -1 }` | Compound | Main job fetch query: non-deleted, visible, by type, ordered by priority |
| Fetch message | `{ visible: 1, 'payload.jobType': 1 }` | Compound | Alternative fetch path |
| ACK lookup | `{ ack: 1, visible: 1 }` | Compound | Acknowledgement operations |

**Unique constraints:** None (same job type can have multiple entries)

### BatchSchema Indexes

| Name | Fields | Type | Purpose |
|------|--------|------|---------|
| Batch ID | `{ batchId: 1 }` | Unique | Batch lookup |
| Status | `{ status: 1 }` | Standard | Status queries |
| Created | `{ createdAt: 1 }` | Standard | Date range queries |

### CronJobConfigSchema Indexes

| Name | Fields | Type | Purpose |
|------|--------|------|---------|
| Job name | `{ name: 1 }` | Unique | Job lookup |
| Active jobs | `{ enabled: 1, nextExecution: 1 }` | Compound | Find enabled jobs by schedule |
| Recent | `{ createdAt: -1 }` | Standard | Recent jobs first |

### CronJobExecutionSchema Indexes

| Name | Fields | Type | Purpose |
|------|--------|------|---------|
| Job history | `{ jobName: 1, executedAt: -1 }` | Compound | Per-job history queries |
| Job success | `{ jobName: 1, success: 1, executedAt: -1 }` | Compound | Success/failure by job |
| Global history | `{ executedAt: -1 }` | Standard | Global ordering |
| Success rate | `{ success: 1, executedAt: -1 }` | Compound | Success rate analysis |
| **TTL** | `{ executedAt: 1 }` | TTL | `expireAfterSeconds: 2592000` (30 days) |

---

## Data Flow Patterns

### Queue Job Lifecycle

```
Producer                          MongoDB                         Worker
   │                                │                               │
   ├── add(payload) ───────────────>│ insert doc                    │
   │                                │ (status: pending,             │
   │                                │  visible: now + delay)        │
   │                                │                               │
   │                                │<── get(jobTypes) ─────────────┤
   │                                │ findOneAndUpdate:             │
   │                                │   visible < now               │
   │                                │   set ack token               │
   │                                │   set visible += timeout      │
   │                                │   inc tries                   │
   │                                │                               │
   │                                │                    process ───┤
   │                                │                               │
   │                                │<── ack(token) ────────────────┤
   │                                │ remove doc (success)          │
   │                                │                               │
   │                                │<── ackError(token, err) ──────┤
   │                                │ mark as failed                │
   │                                │                               │
   │                                │        (if worker crashes)    │
   │                                │ visible expires →             │
   │                                │   job becomes available       │
   │                                │   again to other workers      │
```

### Batch Tracking Lifecycle

```
Create batch (totalJobs: N)
    │
    ├── status: 'pending'
    │
    ├── markJobCompleted() × M ──── status: 'processing'
    ├── markJobFailed() × F ─────── status: 'processing'
    │
    └── when M + F == N:
        ├── F == 0 → status: 'completed'
        └── F > 0  → status: 'failed'
```

### Cron Job Execution Flow

```
registerCronJob(config, handler)
    │
    ├── Create CronJob in SchedulerRegistry
    ├── Store metadata in memory Map
    ├── (if persistence) Save config to MongoDB
    │
    ├── On cron tick:
    │   ├── Build CronJobContext
    │   ├── Execute handler(context)
    │   ├── Record duration
    │   ├── Update metadata (execution/failure counts)
    │   ├── (if persistence) Save execution record
    │   └── (if persistence) Update config timestamps
    │
    └── TTL auto-cleanup (30 days for execution records)
```

---

## TTL and Cleanup

| Collection | Mechanism | Retention | Trigger |
|------------|-----------|-----------|---------|
| `cron_job_executions` | MongoDB TTL index | 30 days | Automatic (MongoDB background) |
| `cron_job_executions` | Manual cleanup | Configurable | `cleanupExecutionHistory(jobName?, olderThanDays)` |
| `queue_batches` | Manual cleanup | Configurable | `cleanupOldBatches(olderThanDays)` |
| `queue_jobs` | Manual cleanup | Immediate | `clean()` removes deleted/processed jobs |

---

## Summary

| Metric | Count |
|--------|-------|
| MongoDB Collections | 4 |
| Schema Definitions | 4 (Queue, Batch, CronJobConfig, CronJobExecution) |
| Document Interfaces | 4 |
| Total Indexes | 12 |
| TTL Indexes | 1 (CronJobExecution, 30 days) |
| Unique Indexes | 2 (Batch.batchId, CronJobConfig.name) |
| Compound Indexes | 7 |
