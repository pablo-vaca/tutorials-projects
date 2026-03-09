# Key Architecture Decisions

Summary of 7 Architecture Decision Records. See [Architecture Analysis](architecture-analysis.md#architecture-decision-records) for full trade-off analysis with pro/con tables.

| ADR | Decision | Confidence | Action Suggested |
|-----|----------|:----------:|------------------|
| ADR-1 | MongoDB as sole storage backend | Medium | Monitor queue load; consider Redis if polling becomes a bottleneck |
| ADR-2 | Polling-based worker pool | Medium | Acceptable at current scale; Change Streams as future option |
| ADR-3 | Provider interface abstraction (IQueueProvider/IBatchProvider) | High | Keep — low cost, high value for testability |
| ADR-4 | 23 discrete job types | Medium | Document pipeline flow; consider state machine visualization |
| ADR-5 | Mongoose discriminators for polymorphic DataSource | High | Good fit for 2-3 source types |
| ADR-6 | Dual classification backends (Mastra + LangChain) | Low | Pick one; deprecate the other |
| ADR-7 | MongoDB-based distributed semaphore | Medium | Sufficient now; Redis if contention grows |
