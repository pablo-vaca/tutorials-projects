# Architecture Decision Records

## ADR-1: MongoDB as Sole Storage Backend

**Context:** Both libraries rely exclusively on MongoDB (Mongoose 9) for all persistence — job queues, batch tracking, cron configs, ETL configs, file metadata, chunks, vectors, and semaphores.

**Decision:** Single database technology for all concerns.

| Pro | Con |
|-----|-----|
| Operational simplicity — one DB to manage | Job queue polling on MongoDB adds load vs purpose-built (Redis, RabbitMQ) |
| Consistent tooling and schema patterns | Vector storage in MongoDB instead of dedicated vector DB (Pinecone, Weaviate) |
| Mongoose discriminators enable polymorphism elegantly | Semaphore via MongoDB lacks the atomic guarantees of Redis SETNX |
| Single connection pool, simpler deployment | No pub/sub — forced into polling pattern for queue processing |

**Risk:** As volume scales, the queue polling pattern (1s intervals x N workers x M job types) could generate significant read pressure on MongoDB.

---

## ADR-2: Polling-Based Worker Pool vs Event-Driven Queue

**Context:** `queue-manager` uses a recursive polling pattern (`poll -> sleep -> poll`) with configurable intervals rather than event-driven consumption (e.g., MongoDB Change Streams, Redis Pub/Sub, RabbitMQ consumers).

**Decision:** Polling with visibility timeout soft-locks.

| Pro | Con |
|-----|-----|
| Simple mental model — no message broker dependency | Latency floor = poll interval (default 1s) |
| Graceful shutdown via `Promise.allSettled()` | Wasted queries when queue is empty |
| Works with any MongoDB deployment (no replica set required for basic use) | CPU/DB cycles spent on empty polls |
| Visibility timeout prevents message loss on crash | More complex than event-driven ack/nack |

**Alternative considered:** MongoDB Change Streams would eliminate polling but require replica set and add complexity to worker management.

---

## ADR-3: Provider Interface Abstraction (IQueueProvider / IBatchProvider)

**Context:** `queue-manager` defines storage-agnostic interfaces and injects MongoDB as the default implementation via DI tokens.

**Decision:** Interface-driven design with swappable backends.

| Pro | Con |
|-----|-----|
| Can swap to Redis/PostgreSQL without changing GenericQueueService | Currently only one implementation exists (MongoDB) — YAGNI risk |
| Clean separation of concerns | Extra abstraction layer adds indirection |
| Testable — mock providers in unit tests | Interface maintenance overhead if provider API evolves |

**Assessment:** Strong decision. The abstraction cost is low and the `forRoot()` pattern is idiomatic NestJS. Even if Redis is never added, the interface improves testability.

---

## ADR-4: 23 Discrete Job Types in etl-manager

**Context:** The ETL module registers 23 distinct job types with varying concurrency (1-20) and visibility timeouts (2 min to 2 hours).

**Decision:** Fine-grained job types rather than a generic "process file" pipeline.

| Pro | Con |
|-----|-----|
| Each step independently retryable | 23 types = 23 worker pools = complex concurrency management |
| Can scale bottleneck steps independently | Job chaining logic spread across handlers (hard to visualize full pipeline) |
| Failure in one step doesn't restart entire pipeline | `preventChaining` flag adds branching complexity |
| Different visibility timeouts per step type | No centralized pipeline definition — the flow is implicit |

**Risk:** The pipeline flow is encoded in handler logic (handler A queues job type B on success). There's no single place that defines the complete ETL pipeline sequence. A pipeline DSL or state machine would improve visibility.

---

## ADR-5: Mongoose Discriminators for Polymorphic Data Sources

**Context:** `etl-manager` uses Mongoose discriminators on `DataSourceBase` to support SharePoint, S3, and Local data source types with type-specific config schemas.

**Decision:** Mongoose discriminator pattern over separate collections or union types.

| Pro | Con |
|-----|-----|
| Single collection — simple queries across all sources | Discriminator bugs are subtle (wrong type populated) |
| Type-safe with TypeScript generics | Adding a new source type requires schema + discriminator registration |
| Built-in Mongoose support — well-tested | Mixed schemas in one collection can complicate indexing |
| Shared fields (projectId, status) queryable across types | S3 implementation appears incomplete (schema exists, no service) |

**Assessment:** Good choice for 2-3 source types. If the system grows to 10+ source types, consider a factory pattern with separate collections.

---

## ADR-6: Dual Classification Backend (Mastra + LangChain)

**Context:** `DocumentClassifierService` supports both Mastra agents and LangChain with ChatOpenAI for document classification, switchable via environment variable.

**Decision:** Two classification backends in parallel.

| Pro | Con |
|-----|-----|
| Flexibility to compare/benchmark approaches | Two code paths to maintain and test |
| Can switch if one provider has outages | Different prompt engineering per backend |
| Mastra provides agent framework, LangChain provides structured output | Potential inconsistency in classification results between backends |

**Risk:** Maintaining two backends doubles testing surface. If one is clearly superior, consider deprecating the other to reduce complexity.

---

## ADR-7: MongoDB-Based Distributed Semaphore

**Context:** `SemaphoreService` implements distributed locking using a MongoDB collection with unique indexes and TTL expiration (120s default).

**Decision:** MongoDB semaphore over Redis-based locking (e.g., Redlock).

| Pro | Con |
|-----|-----|
| No additional infrastructure (Redis) | MongoDB `findOneAndUpdate` is not as fast as Redis SETNX |
| TTL-based auto-expiration prevents deadlocks | Retry with random backoff (10s + jitter) is coarse |
| Unique index on {resource, processType} prevents duplicates | No fencing token — ABA problem possible under high contention |
| Consistent with rest of stack | Clock skew between app servers could cause premature expiration |

**Assessment:** Acceptable for current scale. If contention increases or lock granularity needs sub-second precision, migrate to Redis-based locking.

---
