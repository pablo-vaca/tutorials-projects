# Monorepo Overview

| Property | Value |
|----------|-------|
| Monorepo Tool | Nx 19.0.2 |
| Repository Type | Monorepo (4 projects: 2 apps, 2 libs) |
| Package Manager | npm |
| Node.js | >= 20.0.0 |
| TypeScript | ~5.4.0 |
| Target | ES2021 |
| Module System | ESNext |

## Workspace Projects

| Project | Type | Path | Description |
|---------|------|------|-------------|
| `frontend` | Application | `apps/frontend/` | Angular 17 web application |
| `backend` | Application | `apps/backend/` | NestJS API server — consumes both libs |
| `etl-manager` | Library | `libs/etl-manager/` | ETL pipeline: document ingestion, chunking, embeddings, vector storage |
| `queue-manager` | Library | `libs/queue-manager/` | Generic job queue, batch tracking, cron scheduling |

## Workspace Path Aliases

| Alias | Path |
|-------|------|
| `@tutorials/etl-manager` | `libs/etl-manager/src/index.ts` |
| `@tutorials/queue-manager` | `libs/queue-manager/src/index.ts` |

---
