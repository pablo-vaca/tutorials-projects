# Part: queue-manager

**Type:** NestJS Library (backend)
**Root:** `libs/queue-manager/`
**Tags:** `scope:backend`, `type:lib`
**Build:** `@nx/js:tsc` -> `dist/libs/queue-manager`
**Test:** `@nx/jest:jest`

## Technology Table

| Category | Technology | Version | Purpose |
|----------|-----------|---------|---------|
| Framework | NestJS | ^10.3.0 | Core backend framework |
| Language | TypeScript | ~5.4.0 | Type-safe development |
| Database | MongoDB (Mongoose) | ^9.2.4 | Job queue storage, batch tracking |
| ODM | @nestjs/mongoose | ^11.0.4 | Mongoose integration with NestJS DI |
| Scheduling | @nestjs/schedule + cron | ^6.1.1 | Dynamic cron job management |
| UUID | uuid | ^13.0.0 | Batch ID generation |
| Testing | Jest + ts-jest | ^29.7.0 / ^29.1.0 | Unit testing framework |

## Architecture Pattern

**Pattern:** Provider-Based Pluggable Architecture (Strategy Pattern)

- **3 Independent Modules:** GenericQueue, MongoQueue, CronJobs
- **Interface-Driven:** IQueueProvider and IBatchProvider for swappable backends
- **Worker Pool:** Concurrent polling workers per job type
- **Dynamic Module Pattern:** `.forRoot()` / `.forFeature()` configuration

## Key Architectural Decisions

1. **Storage Agnostic Design** via IQueueProvider/IBatchProvider interfaces
2. **Worker Pool Pattern** with configurable concurrency per job type
3. **Visibility Timeout** for soft-lock job processing (no message loss)
4. **Optional Batch Tracking** as separate concern
5. **Optional Persistence** for cron job configs and execution history
6. **TTL Indexes** for automatic cleanup of old execution records (30 days)
7. **DI Token Injection** (QUEUE_PROVIDER, BATCH_PROVIDER) for flexibility
8. **Graceful Shutdown** with Promise.allSettled() worker draining

---
