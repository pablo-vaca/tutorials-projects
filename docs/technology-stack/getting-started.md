# Getting Started

## Prerequisites

- Node.js >= 20.0.0
- MongoDB instance (local or Atlas)
- Azure AD app registration (for SharePoint integration)
- Access to document processing and embeddings APIs

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment template and fill in values
cp .env.example .env

# Run both apps
npm start

# Run only backend
npm run start:be

# Test libraries
npm run test:libs

# Test individually
npm run test:etl
npm run test:queue
```

## Environment Variables

### etl-manager

| Variable | Required | Description |
|----------|:--------:|-------------|
| `AZURE_TENANT_ID` | Yes | Azure AD tenant for SharePoint authentication |
| `AZURE_CLIENT_ID` | Yes | Azure AD app registration client ID |
| `AZURE_CLIENT_SECRET` | Yes | Azure AD app registration secret |
| `CORE_API_URL` | Yes | Base URL for document processing and embeddings APIs |
| `X_API_KEY` | Yes | API key for document processing and embeddings services |
| `SHAREPOINT_DELTA_SYNC_CRON` | No | Cron expression for SharePoint sync schedule |
| `PDF_LOCATION` | No | Filesystem path for cached PDF files |
| `EMBEDDING_BATCH_SIZE` | No | Batch size for embedding API calls (default: 100) |
| `CLASSIFICATION_CONFIG_HEAD_CHUNKS` | No | Number of head chunks to sample for classification (default: 3) |
| `CLASSIFICATION_CONFIG_MIDDLE_CHUNKS` | No | Number of middle chunks to sample (default: 2) |
| `CLASSIFICATION_CONFIG_TAIL_CHUNKS` | No | Number of tail chunks to sample (default: 1) |
| `CLASSIFICATION_CONFIG_CONFIDENCE_THRESHOLD` | No | Minimum confidence for classification |
| `CLASSIFICATION_CONFIG_USE_LANGCHAIN` | No | Use LangChain instead of Mastra for classification |

### queue-manager

| Variable | Required | Description |
|----------|:--------:|-------------|
| `MONGODB_URI` | Yes | MongoDB connection string (shared with etl-manager) |

### Feature Flags (External Service)

| Flag | Effect |
|------|--------|
| `STRUCTURED_CLASSIFIER_DATA_FEATURE` | Enables document classification before vectorization |
| `USE_JPEG_OUTPUT_FROM_POPPLER` | Switches PDF conversion from PNG to JPEG output |

## Key Entry Points

| To understand... | Start here |
|-----------------|------------|
| ETL pipeline orchestration | `libs/etl-manager/src/lib/etl/jobs/etl.processor.ts` |
| Job type definitions & concurrency | `libs/etl-manager/src/lib/etl/etl.module.ts` |
| Queue system core | `libs/queue-manager/src/lib/generic-queue/services/generic-queue.service.ts` |
| Cron scheduling | `libs/queue-manager/src/lib/cron-jobs/services/cron-jobs.service.ts` |
| Data models | `libs/etl-manager/src/lib/etl/schemas/` |
| SharePoint integration | `libs/etl-manager/src/lib/etl/services/sharepoint.service.ts` |
| Queue usage examples | `libs/queue-manager/src/lib/generic-queue/examples/` |

---
