# API Contracts: queue-manager

> Exhaustive scan of all module exports, service public APIs, interfaces, abstract classes, and provider tokens.
> Generated: 2026-03-09 | Scan level: exhaustive

## Table of Contents

- [Module Configuration](#module-configuration)
  - [GenericQueueModule](#genericqueuemodule)
  - [CronJobsModule](#cronjobsmodule)
- [Module Exports (Public API)](#module-exports-public-api)
- [Service Public APIs](#service-public-apis)
  - [GenericQueueService](#genericqueueservice)
  - [GenericBatchService](#genericbatchservice)
  - [MongoQueueService](#mongoqueueservice)
  - [MongoQueueBatchService](#mongoqueuebatchservice)
  - [MongoQueueUtilsService](#mongoqueueutilsservice)
  - [CronJobsService](#cronjobsservice)
- [HTTP Controller](#http-controller)
  - [CronJobsController](#cronjobscontroller)
- [Abstract Classes](#abstract-classes)
  - [BaseQueueConsumer](#basequeueconsumer)
- [Interface Contracts](#interface-contracts)
  - [IQueueProvider](#iqueueprovider)
  - [IBatchProvider](#ibatchprovider)
- [Type Definitions](#type-definitions)
  - [Queue Types](#queue-types)
  - [Queue Provider Types](#queue-provider-types)
  - [Batch Types](#batch-types)
  - [Cron Job Types](#cron-job-types)
- [Enums](#enums)
- [DI Tokens and Constants](#di-tokens-and-constants)

---

## Module Configuration

### GenericQueueModule

**Registration:** `GenericQueueModule.forRoot(options?)`
**Global:** Yes (registered globally)
**File:** `libs/queue-manager/src/lib/generic-queue/generic-queue.module.ts`

```typescript
interface GenericQueueModuleOptions {
  enableBatches?: boolean;                       // Default: true
  queueProvider?: Type<IQueueProvider>;           // Default: MongoQueueService
  batchProvider?: Type<IBatchProvider>;            // Default: MongoQueueBatchService
  imports?: Array<Type<unknown> | DynamicModule>;  // Default: [MongoQueueModule]
}
```

**Default behavior:** Uses MongoQueueService + MongoQueueBatchService with MongoDB backing. Custom providers can be injected to replace the default implementation.

**Exports:** `GenericQueueService`, `GenericBatchService`, `QUEUE_PROVIDER`, `BATCH_PROVIDER`

### CronJobsModule

**Registration:** `CronJobsModule.forRoot(options?)` or `CronJobsModule.forFeature(options?)`
**File:** `libs/queue-manager/src/lib/cron-jobs/cron-jobs.module.ts`

```typescript
interface CronJobsModuleOptions {
  enablePersistence?: boolean;  // Default: false
}
```

**With persistence:** Registers MongoDB models for cron job configs and execution history. Enables TTL-based automatic cleanup.

**Exports:** `CronJobsService`

---

## Module Exports (Public API)

### Library Root (`libs/queue-manager/src/index.ts`)

- `QueueManagerModule` - Main library module
- `QueueManagerService` - Placeholder service

### Generic Queue (`libs/queue-manager/src/lib/generic-queue/index.ts`)

- `GenericQueueModule` - Core queue abstraction module
- `GenericQueueService` - Service for queue operations
- `GenericBatchService` - Service for batch tracking
- `BaseQueueConsumer` - Abstract base class for job processors
- `QueueJob` - Job type interface
- `IQueueProvider` - Queue provider interface
- `IBatchProvider` - Batch provider interface
- `QUEUE_PROVIDER` - DI injection token
- `BATCH_PROVIDER` - DI injection token
- `QueuePriorityEnum` - Priority enum
- `CronTimeExpression` - Cron expression constants
- `TimeZone` - Timezone enum

### Mongo Queue (`libs/queue-manager/src/lib/mongo-queue/index.ts`)

- `MongoQueueService` - MongoDB queue provider
- `MongoQueueBatchService` - MongoDB batch provider
- `MongoQueueUtilsService` - Queue utilities
- `MONGO_QUEUE_COLLECTION` - Collection name constant
- `MONGO_QUEUE_BATCH_COLLECTION` - Batch collection name constant
- `DEFAULT_DELAY_SECONDS` - Default delay constant

### Cron Jobs (`libs/queue-manager/src/lib/cron-jobs/index.ts`)

- `CronJobsModule` - Cron management module
- `CronJobsService` - Cron management service
- `CronJobsController` - HTTP controller

---

## Service Public APIs

### GenericQueueService

**File:** `libs/queue-manager/src/lib/generic-queue/generic-queue.service.ts`

Storage-agnostic queue service that delegates to an `IQueueProvider`. Manages job definitions, worker lifecycle, and queue operations.

| Method | Parameters | Return | Description |
|--------|------------|--------|-------------|
| `defineJob<T>` | `jobType: string, handler: (job: QueueJob<T>) => Promise<IJobResult>, options?: IJobProcessingOptions` | `void` | Register handler for job type |
| `queueJob<T>` | `jobType: string, data: T, options?: QueueProviderOptions` | `Promise<string>` | Enqueue a single job |
| `queueUniqueJob<T>` | `jobType: string, data: T, options?: QueueProviderOptions` | `Promise<string>` | Enqueue unique job (no duplicates) |
| `startProcessing` | none | `Promise<void>` | Start all registered workers |
| `stopProcessing` | none | `Promise<void>` | Stop workers, drain outstanding |
| `purgeAllJobs` | none | `Promise<number>` | Remove all queued jobs |
| `purgeJobsByName` | `jobType: string` | `Promise<number>` | Remove jobs by type |
| `isQueueConnected` | none | `boolean` | Check queue availability |
| `onModuleDestroy` | none | `Promise<void>` | NestJS lifecycle hook |

### GenericBatchService

**File:** `libs/queue-manager/src/lib/generic-queue/generic-batch.service.ts`

Optional batch tracking service. Delegates to `IBatchProvider` when configured.

| Method | Parameters | Return | Description |
|--------|------------|--------|-------------|
| `isBatchTrackingEnabled` | none | `boolean` | Check if batch tracking available |
| `createBatch` | `totalJobs: number, options?: CreateBatchOptions` | `Promise<string>` | Create batch, returns batch ID |
| `markJobCompleted` | `batchId: string` | `Promise<BatchProgress \| null>` | Mark job completed in batch |
| `markJobFailed` | `batchId: string` | `Promise<BatchProgress \| null>` | Mark job failed in batch |
| `getProgress` | `batchId: string` | `Promise<BatchProgress \| null>` | Get batch progress |
| `updateMetadata` | `batchId, metadata: Record<string, unknown>` | `Promise<BatchProgress \| null>` | Update batch metadata |
| `deleteBatch` | `batchId: string` | `Promise<boolean>` | Delete batch |
| `findByStatus` | `status: BatchStatus, limit?: number` | `Promise<BatchProgress[]>` | Find batches by status |
| `cleanupOldBatches` | `olderThanDays: number` | `Promise<number>` | Cleanup old batches |

### MongoQueueService

**File:** `libs/queue-manager/src/lib/mongo-queue/mongo-queue.service.ts`
**Implements:** `IQueueProvider`

MongoDB-backed queue provider using visibility timeout pattern for distributed job processing.

| Method | Parameters | Return | Description |
|--------|------------|--------|-------------|
| `add<T>` | `data: QueueMessagePayload<T> \| QueueMessagePayload<T>[], opts?` | `Promise<string \| string[] \| undefined>` | Add job(s) to queue |
| `addUnique<T>` | `data: QueueMessagePayload<T>, opts?` | `Promise<string \| undefined>` | Add unique job (by jobType) |
| `get<T>` | `jobTypes: string[], opts?` | `Promise<QueueProviderMessage<T> \| undefined>` | Fetch job for processing |
| `ack` | `ack: string` | `Promise<string \| undefined>` | Acknowledge success, remove job |
| `ackFail` | `ack: string` | `Promise<string \| undefined>` | Acknowledge failure |
| `ackError` | `ack, lastError: string` | `Promise<string \| undefined>` | Acknowledge error with message |
| `removeByFilter` | `filter: Record<string, any>` | `Promise<number>` | Remove by MongoDB filter |
| `removeByJobType` | `jobType: string` | `Promise<number>` | Remove all of job type |
| `removeAll` | none | `Promise<number>` | Remove all jobs |
| `clean` | none | `Promise<DeleteResult \| undefined>` | Clean deleted/processed jobs |

### MongoQueueBatchService

**File:** `libs/queue-manager/src/lib/mongo-queue/mongo-queue-batch.service.ts`
**Implements:** `IBatchProvider`

MongoDB-backed batch tracking with atomic increment operations.

| Method | Parameters | Return | Description |
|--------|------------|--------|-------------|
| `createBatch` | `totalJobs, options?` | `Promise<string>` | Create batch |
| `markJobCompleted` | `batchId` | `Promise<BatchProgress \| null>` | Atomic increment completed |
| `markJobFailed` | `batchId` | `Promise<BatchProgress \| null>` | Atomic increment failed |
| `getProgress` | `batchId` | `Promise<BatchProgress \| null>` | Get progress |
| `updateMetadata` | `batchId, metadata` | `Promise<BatchProgress \| null>` | Update metadata |
| `deleteBatch` | `batchId` | `Promise<boolean>` | Delete batch |
| `findByStatus` | `status, limit?` | `Promise<BatchProgress[]>` | Query by status |
| `cleanupOldBatches` | `olderThanDays` | `Promise<number>` | Cleanup old records |

### MongoQueueUtilsService

**File:** `libs/queue-manager/src/lib/mongo-queue/mongo-queue-utils.service.ts`

| Method | Parameters | Return | Description |
|--------|------------|--------|-------------|
| `id` | none | `string` | Generate random hex ACK token |
| `now` | none | `Date` | Current timestamp |
| `nowPlusSeconds` | `seconds: number` | `Date` | Future timestamp |

### CronJobsService

**File:** `libs/queue-manager/src/lib/cron-jobs/cron-jobs.service.ts`

Dynamic cron job management with optional MongoDB persistence, execution history, and statistics.

| Method | Parameters | Return | Description |
|--------|------------|--------|-------------|
| `registerCronJob<T>` | `config: CronJobConfig, handler: CronJobHandler<T>` | `Promise<CronJob>` | Register new cron job |
| `executeCronJob<T>` | `name: string` | `Promise<CronJobResult<T>>` | Execute manually |
| `removeCronJob` | `name: string` | `Promise<void>` | Remove cron job |
| `startCronJob` | `name: string` | `void` | Start job |
| `stopCronJob` | `name: string` | `void` | Stop job |
| `getCronJob` | `name: string` | `CronJob` | Get job instance |
| `jobExists` | `name: string` | `boolean` | Check existence |
| `getJobMetadata` | `name: string` | `CronJobMetadata \| undefined` | Get job metadata |
| `getAllJobMetadata` | none | `Map<string, CronJobMetadata>` | All job metadata |
| `getAllJobNames` | none | `string[]` | All registered names |
| `enableCronJob` | `name: string` | `Promise<void>` | Enable job |
| `disableCronJob` | `name: string` | `Promise<void>` | Disable job |
| `restartCronJob` | `name: string` | `Promise<void>` | Restart job |
| `updateCronSchedule` | `name, newCronTime: string` | `void` | Update schedule |
| `getNextExecution` | `name: string` | `Date \| null` | Next execution time |
| `loadJobConfigsFromDatabase` | none | `Promise<CronJobConfigDocument[]>` | Load from MongoDB |
| `getExecutionHistory` | `jobName, limit?` | `Promise<CronJobExecutionDocument[]>` | Execution history |
| `getExecutionStats` | `jobName` | `Promise<stats \| null>` | Aggregated stats |
| `cleanupExecutionHistory` | `jobName?, olderThanDays?` | `Promise<number>` | Cleanup old records |
| `onModuleDestroy` | none | `Promise<void>` | NestJS lifecycle hook |

---

## HTTP Controller

### CronJobsController

**Route Prefix:** `/cron-jobs`
**File:** `libs/queue-manager/src/lib/cron-jobs/cron-jobs.controller.ts`

| HTTP | Path | Method | Parameters | Return |
|------|------|--------|------------|--------|
| GET | `/cron-jobs/:jobName` | `getJobMetadata` | `jobName` (param) | Job metadata + success rate |
| POST | `/cron-jobs/:jobName/execute` | `executeJob` | `jobName` (param) | Execution result |
| POST | `/cron-jobs/:jobName/enable` | `enableJob` | `jobName` (param) | Success message |
| POST | `/cron-jobs/:jobName/disable` | `disableJob` | `jobName` (param) | Success message |
| POST | `/cron-jobs/:jobName/restart` | `restartJob` | `jobName` (param) | Success message |

---

## Abstract Classes

### BaseQueueConsumer

**File:** `libs/queue-manager/src/lib/generic-queue/base/base-queue-consumer.ts`

Abstract base class for creating job processors. Provides error-safe execution wrapper.

```typescript
abstract class BaseQueueConsumer<T extends IJobData> {
  constructor(context: string);

  // Must implement - core job processing logic
  abstract process(job: QueueJob<T>): Promise<IJobResult>;

  // Provided - wraps process() with error handling
  executeJob(job: QueueJob<T>): Promise<IJobResult>;
}
```

**Usage pattern:** Extend this class, implement `process()`, then register with `GenericQueueService.defineJob()`.

---

## Interface Contracts

### IQueueProvider

**File:** `libs/queue-manager/src/lib/generic-queue/interfaces/queue-provider.interface.ts`

```typescript
interface IQueueProvider {
  add<T>(data: QueueMessagePayload<T> | QueueMessagePayload<T>[],
         options?: QueueProviderOptions): Promise<string | string[] | undefined>;

  addUnique<T>(data: QueueMessagePayload<T> | QueueMessagePayload<T>[],
               options?: QueueProviderOptions): Promise<string | string[] | undefined>;

  get<T>(jobTypes: string[],
         options?: QueueProviderOptions): Promise<QueueProviderMessage<T> | undefined>;

  ack(ack: string): Promise<string | undefined>;

  ackError(ack: string, error: string): Promise<string | undefined>;

  removeByJobType(jobType: string): Promise<number>;

  removeAll(): Promise<number>;

  clean(): Promise<unknown>;
}
```

### IBatchProvider

**File:** `libs/queue-manager/src/lib/generic-queue/interfaces/batch-provider.interface.ts`

```typescript
interface IBatchProvider {
  createBatch(totalJobs: number, options?: CreateBatchOptions): Promise<string>;
  markJobCompleted(batchId: string): Promise<BatchProgress | null>;
  markJobFailed(batchId: string): Promise<BatchProgress | null>;
  getProgress(batchId: string): Promise<BatchProgress | null>;
  updateMetadata(batchId: string, metadata: Record<string, unknown>): Promise<BatchProgress | null>;
  deleteBatch(batchId: string): Promise<boolean>;
  findByStatus(status: BatchStatus, limit?: number): Promise<BatchProgress[]>;
  cleanupOldBatches(olderThanDays: number): Promise<number>;
}
```

---

## Type Definitions

### Queue Types

**File:** `libs/queue-manager/src/lib/generic-queue/types/queue.types.ts`

```typescript
interface IJobData {
  [key: string]: unknown;
}

interface IJobResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

interface IJobProcessingOptions {
  concurrency?: number;                 // Default: 1
  visibilityTimeoutSeconds?: number;    // Default: 30
  pollIntervalMs?: number;              // Default: 1000
  maxRetries?: number;                  // Default: 3
}

interface QueueJob<TPayload extends IJobData = IJobData> {
  id: string;
  ackToken: string;
  jobType: string;
  payload: TPayload;
  tries: number;
  visibleUntil: Date;
  priority: QueuePriorityEnum;
  createdAt: Date;
  order?: number;
}

type QueueJobHandler<T> = (job: QueueJob<T>) => Promise<IJobResult>;

interface QueueJobDefinition<T> {
  jobType: string;
  handler: QueueJobHandler<T>;
  options: ResolvedJobProcessingOptions;
}

interface QueueWorkerState {
  jobType: string;
  promise: Promise<void>;
}
```

### Queue Provider Types

**File:** `libs/queue-manager/src/lib/generic-queue/interfaces/queue-provider.interface.ts`

```typescript
interface QueueProviderOptions {
  delaySeconds?: number;
  visibilitySeconds?: number;
  maxRetries?: number;
  priority?: QueuePriorityEnum;
  order?: number;
  producer?: string;
}

interface QueueMessagePayload<TPayload = unknown> {
  jobType: string;
  payload: TPayload;
}

interface QueueProviderMessage<TPayload = unknown> {
  id: string;
  ack: string;
  jobType: string;
  payload: TPayload;
  tries: number;
  visible: Date;
  createdAt: Date;
  priority: QueuePriorityEnum;
  order: number;
  status: QueueStatusEnum;
  producer: string;
}
```

### Batch Types

**File:** `libs/queue-manager/src/lib/generic-queue/interfaces/batch-provider.interface.ts`

```typescript
type BatchStatus = 'pending' | 'processing' | 'completed' | 'failed';

interface BatchProgress {
  batchId: string;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  progress: number;  // 0-100
  status: BatchStatus;
}

interface CreateBatchOptions {
  batchId?: string;
  metadata?: Record<string, unknown>;
}
```

### Cron Job Types

**File:** `libs/queue-manager/src/lib/cron-jobs/types/cron-jobs.types.ts`

```typescript
interface CronJobConfig {
  name: string;
  cronTime: string | Date | CronExpression | CronTimeExpression;
  runOnInit?: boolean;
  timeZone?: TimeZone | string;
  enabled?: boolean;
}

interface CronJobContext {
  jobName: string;
  executedAt: Date;
  previousExecution?: Date;
  nextExecution?: Date;
}

interface CronJobResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: Error;
  context: CronJobContext;
  duration: number;
}

type CronJobHandler<T = unknown> = (context: CronJobContext) => Promise<T> | T;

interface CronJobMetadata {
  name: string;
  cronTime: string | Date;
  enabled: boolean;
  runOnInit: boolean;
  timeZone: string;
  lastExecution?: Date;
  nextExecution?: Date;
  executionCount: number;
  failureCount: number;
}
```

---

## Enums

### QueuePriorityEnum

```typescript
enum QueuePriorityEnum {
  LOWEST = 1,
  LOW = 2,
  MEDIUM = 3,
  HIGH = 4,
  HIGHEST = 5
}
```

### QueueStatusEnum

```typescript
enum QueueStatusEnum {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  PAUSED = 'paused'
}
```

### CronTimeExpression

27 predefined cron expressions including:
`EVERY_SECOND`, `EVERY_5_SECONDS`, `EVERY_MINUTE`, `EVERY_5_MINUTES`, `EVERY_HOUR`, `EVERY_DAY_AT_MIDNIGHT`, `EVERY_WEEKDAY_AT_9AM`, `EVERY_MONTH_ON_FIRST`, etc.

### TimeZone

25 timezone constants including:
`UTC`, `AMERICA_NEW_YORK`, `AMERICA_LOS_ANGELES`, `EUROPE_LONDON`, `EUROPE_PARIS`, `ASIA_TOKYO`, `ASIA_SINGAPORE`, `AUSTRALIA_SYDNEY`, `AMERICA_SAO_PAULO`, `AMERICA_ARGENTINA_BUENOS_AIRES`, etc.

---

## DI Tokens and Constants

### Generic Queue Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `QUEUE_PROVIDER` | `'QUEUE_PROVIDER'` | DI token for queue provider |
| `BATCH_PROVIDER` | `'BATCH_PROVIDER'` | DI token for batch provider |
| `DEFAULT_CONCURRENCY` | `1` | Default worker concurrency |
| `DEFAULT_POLL_INTERVAL_MS` | `1000` | Default poll interval (ms) |
| `DEFAULT_MAX_RETRIES` | `3` | Default max retries |
| `DEFAULT_VISIBILITY_TIMEOUT_SECONDS` | `30` | Default visibility timeout |

### Mongo Queue Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `MONGO_QUEUE_COLLECTION` | `'queue_jobs'` | MongoDB collection name |
| `MONGO_QUEUE_BATCH_COLLECTION` | `'queue_batches'` | Batch collection name |
| `DEFAULT_DELAY_SECONDS` | `0` | Default job delay |

### Cron Jobs Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `CRON_JOB_CONFIG_COLLECTION` | `'cron_job_configs'` | Config collection name |
| `CRON_JOB_EXECUTION_COLLECTION` | `'cron_job_executions'` | Execution collection name |
| `EXECUTION_HISTORY_RETENTION_DAYS` | `30` | TTL retention days |

---

## Summary

| Metric | Count |
|--------|-------|
| NestJS Modules | 3 (GenericQueue, MongoQueue, CronJobs) |
| HTTP Endpoints | 5 (CronJobsController) |
| Service Classes | 6 |
| Total Public Methods | ~55 |
| Interface Contracts | 2 (IQueueProvider, IBatchProvider) |
| Abstract Classes | 1 (BaseQueueConsumer) |
| DI Tokens | 2 (QUEUE_PROVIDER, BATCH_PROVIDER) |
| Enums | 4 (QueuePriority, QueueStatus, CronTime, TimeZone) |
| Type Definitions | ~15 interfaces |
