# Comprehensive Analysis: etl-manager

> Always-on pattern scans: configuration, auth/security, entry points, shared code, async/events, CI/CD.
> Generated: 2026-03-09 | Scan level: exhaustive

## Table of Contents

- [Configuration Management](#configuration-management)
- [Authentication and Security](#authentication-and-security)
- [Entry Points and Bootstrap](#entry-points-and-bootstrap)
- [Shared Code and Cross-Library Dependencies](#shared-code-and-cross-library-dependencies)
- [Async and Event-Driven Architecture](#async-and-event-driven-architecture)
- [CI/CD and Build System](#cicd-and-build-system)

---

## Configuration Management

### NestJS ConfigService

The library uses `@nestjs/config` ConfigService for environment-driven configuration:

- **EtlModule** (`etl.module.ts`): Injects ConfigService to read:
  - `SHAREPOINT_DELTA_SYNC_CRON` — Cron expression for SharePoint delta sync scheduling
  - Feature flags and environment-specific settings

### MongoDB-Stored Configuration

`EtlConfigService` manages persistent ETL configurations in MongoDB (`etl.config` collection):

- Full CRUD with soft-delete support (`deletedAt` field)
- History tracking via `addHistoryEntry()` for audit trail
- Status management: `active` → `syncing` → `error` → `inactive`
- Correlation ID tracking for distributed operations

### Discriminator-Based Config

Data source configuration uses Mongoose discriminators for polymorphism:

| Data Source Type | Config Entity | Key Fields |
|-----------------|---------------|------------|
| SharePoint | `SharePointConfigEntity` | `url`, `tenantId`, `driveId`, `folderId`, `deltaLink`, `cronSchedule` |
| S3 | `S3ConfigEntity` | `bucket`, `region`, `prefix`, `accessKeyId` |
| Local | `LocalConfig` (interface only) | `rootPath` |

### Environment Variables Used

| Variable | Purpose | Default |
|----------|---------|---------|
| `SHAREPOINT_DELTA_SYNC_CRON` | Cron schedule for delta sync | `CronTimeExpression.EVERY_5_MINUTES` |
| `X_API_KEY` | API key for external service calls | Required |
| SharePoint OAuth credentials | Service-to-service auth | Via ConfigService |

---

## Authentication and Security

### Bearer Token Authentication

- **EtlController** uses `@ApiBearerAuth('access-token')` decorator for protected endpoints
- Token extraction via `getTokenFromHeader()` helper method on the controller
- Bearer tokens passed through to downstream service calls

### No-Auth Controllers

Three controllers bypass bearer auth using `@AllowControllerWithNoBearer()`:
- `EtlQueueController` — Queue test endpoints (internal use)
- `SemaphoreController` — Lock management endpoints
- `DocumentClassificationController` — Classification endpoints

### Service-to-Service Auth

- `AuthApiService` provides machine-to-machine token via `getMachineToken()`
- Used by `DocumentProcessingClient` for calling external document processing API
- `X_API_KEY` passed as header for API key authentication

### Custom Exception

`AuthenticationException` returns HTTP 401 UNAUTHORIZED for auth failures.

---

## Entry Points and Bootstrap

### Module Hierarchy

```
EtlManagerModule (public API)
  └── EtlModule (internal orchestration)
        ├── CronJobsModule.forRoot()     ← from queue-manager
        ├── GenericQueueModule.forRoot()  ← from queue-manager
        ├── HttpModule                    ← for external API calls
        ├── LLMModule                     ← AI/LLM integration
        ├── MastraModule                  ← Mastra AI framework
        └── FeatureFlagModule             ← Feature flag management
```

### Library Public Exports

Via `libs/etl-manager/src/index.ts`:
- `EtlManagerModule` — Root module for NestJS imports
- `EtlManagerService` — Placeholder service

### EtlModule Bootstrap (`onModuleInit`)

The `EtlModule.onModuleInit()` performs critical initialization:

1. **Registers 16+ job handlers** with `GenericQueueService.defineJob()`:
   - Each job type gets specific concurrency and visibility timeout settings
   - Handlers delegate to `EtlJobProcessor.process()` or individual handler classes

2. **Starts queue processing** via `queueService.startProcessing()`

3. **Registers cron job** for SharePoint delta sync:
   - Conditionally enabled based on `SHAREPOINT_DELTA_SYNC_CRON` env var
   - Uses `CronJobsService.registerCronJob()` with configurable schedule

---

## Shared Code and Cross-Library Dependencies

### Inter-Library Dependency

**etl-manager → queue-manager** (unidirectional):

| Import | Source | Used For |
|--------|--------|----------|
| `GenericQueueModule` | `@tutorials/queue-manager` | Queue infrastructure |
| `GenericQueueService` | `@tutorials/queue-manager` | Job enqueue/processing |
| `CronJobsModule` | `@tutorials/queue-manager` | Cron scheduling |
| `CronJobsService` | `@tutorials/queue-manager` | Cron registration |
| `BaseQueueConsumer` | `@tutorials/queue-manager` | Job processor base class |
| `QueueJob`, `IJobResult` | `@tutorials/queue-manager` | Type definitions |

### NX Path Mappings

Configured in `tsconfig.base.json`:
- `@tutorials/etl-manager` → `libs/etl-manager/src/index.ts`
- `@tutorials/queue-manager` → `libs/queue-manager/src/index.ts`

### No Shared Utility Directories

Neither library has `shared/`, `common/`, or `utils/` directories. Shared code is managed through:
- NX library imports via path aliases
- Abstract classes (`BaseQueueConsumer`)
- Interface contracts (`IQueueProvider`, `IBatchProvider`)

---

## Async and Event-Driven Architecture

### Job Processing Pipeline

The ETL pipeline uses queue-based async processing with 22 job types:

```
                    ┌─ ETL_UPLOAD_FILE
                    │     ↓
                    ├─ ETL_CREATE_CHUNKS
                    │     ↓
                    ├─ ETL_CREATE_EMBEDDINGS
                    │     ↓
                    └─ ETL_MOVE_TO_VECTORSTORE

PDF Pipeline:       ┌─ PDF_DOWNLOAD_AND_SPLIT
                    │     ↓
                    ├─ PDF_MARKDOWN_PROCESS
                    │     ↓
                    ├─ PDF_UPLOAD_PROCESS
                    │     ↓
                    └─ PDF_CHUNK_PROCESS / PDF_LOCAL_CHUNK_PROCESS

Sync Pipeline:      ┌─ SHAREPOINT_DELTA_SYNC (cron-triggered)
                    │     ↓
                    ├─ SHAREPOINT_DELTA_SYNC_PROJECT (per project)
                    │     ↓
                    ├─ ETL_SHAREPOINT_DELTA_UPSERT / ETL_SHAREPOINT_DELTA_DELETE
                    │     ↓
                    └─ Individual file processing jobs

Maintenance:        ├─ CLEAR_PROJECT_DATA
                    └─ TEST jobs
```

### Job Chaining Pattern

Jobs enqueue subsequent jobs upon completion:
- `UploadFileHandler` → enqueues `ETL_CREATE_CHUNKS`
- `ProcessSharePointFile` → enqueues downstream based on file analysis
- Chain can be interrupted via `preventChaining` flag in job data

### Concurrency Configuration

| Job Type | Concurrency | Visibility Timeout |
|----------|-------------|-------------------|
| ETL_UPLOAD_FILE | 2 | 5 minutes |
| ETL_CREATE_CHUNKS | 2 | 5 minutes |
| PDF_DOWNLOAD_AND_SPLIT | 1 | 10 minutes |
| SHAREPOINT_DELTA_SYNC | 1 | 5 minutes |
| Default | 1 | 30 seconds |

### Retry Logic

`retryAsync()` helper provides generic retry mechanism:
- Configurable retry count and delay
- Logs attempt details
- Rethrows last error on exhaustion

### Distributed Locking

`SemaphoreService` provides MongoDB-based distributed locks:
- Atomic acquire/release via `findOneAndUpdate()`
- Token-based ownership with expiration
- Force-release capability for stuck locks
- Used to prevent concurrent sync operations on the same resource

### Cron Scheduling

| Job Name | Schedule | Trigger |
|----------|----------|---------|
| `sharepoint-delta-sync` | Configurable via env | `deltaSyncForAllActiveProjects()` |

---

## CI/CD and Build System

### NX Build Configuration

**File:** `libs/etl-manager/project.json`

| Target | Executor | Output |
|--------|----------|--------|
| `build` | `@nx/js:tsc` | `dist/libs/etl-manager` |
| `test` | `@nx/jest:jest` | `coverage/libs/etl-manager` |

**Tags:** `scope:backend`, `type:lib`

### npm Scripts

```
test:etl    → nx test etl-manager
test:libs   → nx run-many --target=test --projects=etl-manager,queue-manager
build:libs  → nx run-many --target=build --projects=etl-manager,queue-manager
```

### Testing

- Jest test runner with NestJS testing utilities (`@nestjs/testing`)
- Spec files: `*.spec.ts` convention
- Coverage output: `coverage/libs/etl-manager`

### No CI/CD Pipeline Files

No `.github/workflows/`, `.gitlab-ci.yml`, or similar CI/CD configuration files found in the repository.
