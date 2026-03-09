# Part: etl-manager

**Type:** NestJS Library (backend)
**Root:** `libs/etl-manager/`
**Tags:** `scope:backend`, `type:lib`
**Build:** `@nx/js:tsc` -> `dist/libs/etl-manager`
**Test:** `@nx/jest:jest`

## Technology Table

| Category | Technology | Version | Purpose |
|----------|-----------|---------|---------|
| Framework | NestJS | ^10.3.0 | Core backend framework |
| Language | TypeScript | ~5.4.0 | Type-safe development |
| Database | MongoDB (Mongoose) | ^9.2.4 | Document storage, schemas, discriminators |
| ODM | @nestjs/mongoose | ^11.0.4 | Mongoose integration with NestJS DI |
| Scheduling | @nestjs/schedule | ^6.1.1 | Cron job scheduling for delta sync |
| HTTP Client | @nestjs/axios (HttpModule) | (bundled) | External API calls |
| Configuration | @nestjs/config + dotenv | ^3.2.0 / ^16.4.0 | Environment variable management |
| UUID | uuid | ^13.0.0 | Correlation IDs and unique identifiers |
| Reactive | RxJS | ~7.8.0 | Observable patterns |
| Testing | Jest + ts-jest | ^29.7.0 / ^29.1.0 | Unit testing framework |
| AI/ML | Mastra Framework | (imported) | Agent-based document classification |
| AI/ML | LangChain | (imported) | Alternative classification pipeline |
| AI/ML | Zod | (imported) | Structured output validation |
| PDF Processing | Poppler (pdfToCairo) | (system) | PDF to image conversion |
| Image Processing | Sharp | (imported) | Image optimization (PNG/JPEG) |

## Architecture Pattern

**Pattern:** Service-Oriented Architecture with Job Queue Processing

- **Controllers** (4): REST API layer with validation pipes and serialization
- **Services** (15+): Business logic, external API clients, data access
- **Job Processors** (3 handlers): Async job execution via queue system
- **Schemas** (14): Mongoose models with discriminator polymorphism
- **DTOs** (10): Request/response validation
- **Exceptions** (6): Hierarchical error handling

## Key Architectural Decisions

1. **Mongoose Discriminators** for polymorphic DataSource (SharePoint, S3, Local)
2. **Job Queue Architecture** for async ETL pipeline processing (23 job types)
3. **Distributed Locking** via MongoDB-based semaphore with TTL
4. **Feature Flags** for runtime feature gating (classification, JPEG output)
5. **Dual Classification Backend** (Mastra agents + LangChain fallback)
6. **Soft Deletes** with audit history on configurations
7. **Batch Processing** with configurable batch sizes for large deletions
8. **Delta Sync** for incremental SharePoint updates

---
