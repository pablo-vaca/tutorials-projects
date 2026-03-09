# Lessons Learned

Cross-cutting lessons extracted from 9 applied analysis methods.

## L1: Implicit Constraints Drive Architecture More Than Explicit Decisions

The "no-Redis" constraint is never documented, yet it shapes the entire system — custom queue (~2000 LOC), MongoDB semaphore, polling pattern, no pub/sub. One unstated assumption generated 5 of 7 ADRs.

**Takeaway:** Document infrastructure constraints *before* they become architectural decisions. A one-line constraint doc makes all downstream decisions auditable and reversible.

## L2: Write-Only Code Paths Are a Debt Magnet

Three write-only patterns discovered independently by multiple analyses: vectors written but never queried (no search index), `CANCELLED`/`PAUSED` enum values never set, `DocumentClassification` schema only used as embedded prop.

**Takeaway:** Apply the "who reads this?" test to every write path and the "who enters this state?" test to every enum value.

## L3: The Abstraction Was Worth It (YAGNI Doesn't Apply at Module Boundaries)

`IQueueProvider`/`IBatchProvider` interfaces were flagged as potential YAGNI (only MongoDB exists). Every analysis confirmed the value: testability, clean separation, idiomatic NestJS. The real YAGNI was `CANCELLED`/`PAUSED` — states without consumers.

**Takeaway:** Interface abstractions at module boundaries pay for themselves through testability alone. YAGNI applies to *unused* abstractions, not *actively consumed* ones.

## L4: Pipeline Visibility Is Non-Negotiable for ETL Systems

The most consistent finding — flagged by 6 of 8 methods. Handler A queuing type B makes the full pipeline invisible. Six of 40 action items trace to this single root cause.

**Takeaway:** Multi-step async pipelines need the stage graph as a first-class artifact (config file, state machine, or diagram), not encoded in handler-to-handler calls.

## L5: "At-Least-Once" Without Idempotency Is "At-Least-Twice"

Converged from Expert Panel, Pre-mortem, and Reverse Engineering: the queue guarantees at-least-once delivery, but no handler implements idempotency and vectors have no unique constraint on `{fileId, chunkIndex}`.

**Takeaway:** At-least-once delivery requires idempotent consumers. If handlers can't be idempotent, add dedup at storage (unique indexes) or queue (idempotency keys) layer.

## L6: God Modules Are a Symptom, Not the Disease

`etl.module.ts` (18 inline job registrations) isn't large because it needs splitting — it's large because configuration is code when it should be data. Each registration is 4-5 lines of inline config that could be a JSON/YAML file.

**Takeaway:** When modules grow beyond ~10 registrations, extract configuration to declarative files. The module becomes a thin loader.

## L7: Two Implementations Need a Sunset Plan

Dual classification (Mastra + LangChain) provides flexibility but without comparison metrics, the "evaluation" never concludes. Permanent optionality becomes permanent maintenance.

**Takeaway:** Dual implementations need defined comparison criteria, measured results, a winner, and deprecation of the loser.

## L8: The Library Boundary Was Drawn Correctly

Every analysis validated the `etl-manager` / `queue-manager` split: zero domain coupling, unidirectional dependency, idiomatic NestJS patterns, genuinely reusable. No analysis suggested merging.

**Takeaway:** When multiple independent analyses validate a structural decision, protect it. Resist "optimizing" by merging or creating cross-library shortcuts.
