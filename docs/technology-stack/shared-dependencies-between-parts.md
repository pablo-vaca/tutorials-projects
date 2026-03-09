# Shared Dependencies Between Parts

| Dependency | etl-manager | queue-manager |
|-----------|:-----------:|:-------------:|
| NestJS 10 | x | x |
| TypeScript 5.4 | x | x |
| Mongoose 9 | x | x |
| @nestjs/mongoose 11 | x | x |
| @nestjs/schedule 6 | x | x |
| uuid 13 | x | x |
| Jest 29 | x | x |

## Inter-Library Dependency

`etl-manager` **imports from** `queue-manager`:
- `GenericQueueModule` — for job queue processing
- `CronJobsModule` — for SharePoint delta sync scheduling
- `GenericQueueService` — for job enqueuing and worker management

The dependency is **unidirectional**: `etl-manager` -> `queue-manager` (no circular dependency).

---
