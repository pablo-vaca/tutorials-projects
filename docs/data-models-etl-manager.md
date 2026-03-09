# Data Models: etl-manager

> Exhaustive scan of all Mongoose schemas, discriminators, enums, interfaces, indexes, and relationships.
> Generated: 2026-03-09 | Scan level: exhaustive

## Table of Contents

- [Schemas](#schemas)
  - [EtlConfig](#etlconfig)
  - [File](#file)
  - [Chunk](#chunk)
  - [ChunkMetadata](#chunkmetadata-embedded)
  - [DocumentClassification](#documentclassification-embedded)
  - [Vector](#vector)
  - [PdfFile](#pdffile)
  - [Semaphore](#semaphore)
  - [GlobalCounter](#globalcounter)
- [Discriminators](#discriminators)
  - [DataSourceBase](#datasourcebase)
  - [SharePointDataSource](#sharepointdatasource)
  - [S3DataSource](#s3datasource)
- [Embedded Entity Schemas](#embedded-entity-schemas)
  - [SharePointConfigEntity](#sharepointconfigentity)
  - [S3ConfigEntity](#s3configentity)
  - [DataSource Wrapper](#datasource-wrapper)
- [Enums](#enums)
- [Interfaces](#interfaces)
- [Indexes and Constraints](#indexes-and-constraints)
- [Relationships](#relationships)
- [Status Workflows](#status-workflows)

---

## Schemas

### EtlConfig

**Collection:** `etl.config`
**Timestamps:** createdAt, updatedAt
**File:** `libs/etl-manager/src/lib/etl/schemas/etl-config.schema.ts`

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `projectId` | String | Yes | - | Project identifier |
| `correlationId` | String | No | - | Correlation tracking ID |
| `projectName` | String | Yes | - | Display name |
| `dataScope` | String | Yes | - | Data scope identifier |
| `dataSource` | DataSourceSchema | Yes | - | Embedded, polymorphic |
| `chunksConfig` | Object | Yes | - | `{ chunkSize: number, overlap: number }` |
| `embeddingsConfig` | Object | Yes | - | `{ deploymentId, user, model }` |
| `status` | String | No | `'active'` | Enum: `active`, `inactive`, `error`, `syncing` |
| `errorMessage` | String | No | - | Error description |
| `webhookUrl` | String | No | - | Notification webhook URL |
| `webhookConfigured` | Boolean | No | `false` | Webhook status |
| `userId` | String | No | - | Owner user ID |
| `lastSyncAt` | Date | No | - | Last sync timestamp |
| `lastSharePointUpdateAt` | Date | No | - | Last SharePoint update |
| `deletedAt` | Date | No | - | Soft delete timestamp |
| `order` | Number | No | - | Project ordering |
| `history` | Array | No | `[]` | `[{ action: String, timestamp: Date }]` |

### File

**Collection:** `etl.file`
**Timestamps:** createdAt, updatedAt
**File:** `libs/etl-manager/src/lib/etl/schemas/file.schema.ts`

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `fileName` | String | Yes | - | Original file name |
| `fileOriginId` | String | Yes | - | Source file identifier |
| `remoteId` | String | No | - | Remote storage ID |
| `fileSource` | String | No | - | Source system identifier |
| `sourceData` | Object | No | - | `{ title: string, link: string }` |
| `fileSize` | Number | No | - | Size in bytes |
| `mimeType` | String | No | - | MIME type |
| `projectId` | String | Yes | - | Associated project |
| `configId` | String | Yes | - | Associated config |
| `storageFilename` | String | No | - | Storage path/filename |
| `processingStrategy` | String | No | `BASE` | Enum: `BASE`, `PBP_SPLIT_FILE` |
| `pagesToProcess` | Object | No | - | `{ total: number, processed: number }` |
| `processingStatus` | String | No | `'uploaded'` | See [File Status Workflow](#file-processing-status-workflow) |
| `errorMessage` | String | No | - | Error message |
| `chunks` | ObjectId[] | No | `[]` | Refs to Chunk documents |
| `embeddingsStored` | Boolean | No | `false` | Embeddings stored flag |
| `userId` | String | No | - | Creator user ID |
| `history` | Array | No | `[]` | `[{ action: String, timestamp: Date }]` |

### Chunk

**Collection:** `etl.chunk`
**Timestamps:** createdAt, updatedAt
**File:** `libs/etl-manager/src/lib/etl/schemas/chunk.schema.ts`

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `fileId` | ObjectId | Yes | - | Ref to `File` |
| `content` | String | Yes | - | Chunk text content |
| `chunkIndex` | Number | Yes | - | Position in file |
| `embedding` | Number[] | No | - | Vector embedding |
| `metadata` | ChunkMetadata | No | - | Embedded schema |

### ChunkMetadata (Embedded)

**Schema Type:** Embedded, no `_id`
**File:** `libs/etl-manager/src/lib/etl/schemas/chunk-metadata.schema.ts`

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `projectId` | String | No | - | Project reference |
| `dataScope` | String | No | - | Data scope |
| `source` | Object | No | - | SharePointFileSource |
| `chunkSize` | Number | No | - | Chunk size used |
| `overlap` | Number | No | - | Overlap used |
| `fileId` | String | No | - | File reference |
| `pageNumber` | Number | No | - | Source page number |
| `classification` | DocumentClassification | No | - | Embedded |

### DocumentClassification (Embedded)

**Schema Type:** Embedded, no `_id`
**File:** `libs/etl-manager/src/lib/etl/schemas/document-classification.schema.ts`

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `category` | String | No | - | Document category |
| `confidence` | Number | No | - | Classification score |
| `reasoning` | String | No | - | Explanation |
| `needsReview` | Boolean | No | - | Manual review flag |
| `chunksAnalyzed` | Number | No | - | Chunks analyzed count |
| `totalChunks` | Number | No | - | Total chunks count |

### Vector

**Collection:** `dealroomdocsvectors`
**Timestamps:** None (manual fields)
**File:** `libs/etl-manager/src/lib/etl/schemas/vector.schema.ts`

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `name` | String | No | - | Vector name |
| `clientId` | String | No | - | Client identifier |
| `folder_id` | String | No | - | Folder reference |
| `projectId` | String | No | - | Project reference |
| `result` | Mixed | No | - | Processing result |
| `folderDetails` | Mixed | No | - | Folder metadata |
| `page_content` | String | Yes | - | Document page content |
| `page_embeddings` | Number[] | No | - | Vector embeddings array |
| `web_url` | String | No | - | Source web URL |
| `last_review_date` | Date | No | - | Review timestamp |
| `last_review_status` | Boolean | No | - | Review status |
| `etag` | String | No | - | Entity tag |
| `mimeType` | String | No | - | MIME type |
| `fields_odata_context` | String | No | - | OData context |
| `last_modified_time` | String | No | - | Last modified |
| `chunk_size` | Number | No | - | Chunk size |
| `chunk_overlap` | Number | No | - | Chunk overlap |
| `document_meta` | Object | No | - | See below |
| `created_by` | String | No | - | Creator |
| `modified_by` | String | No | - | Modifier |
| `created_time` | String | No | - | Creation time |
| `doc_id` | String | No | - | Document ID |
| `fileId` | ObjectId | Yes | - | Ref to `File`, indexed |

**document_meta sub-fields:** `Created`, `Modified`, `ShortDescription`, `Region`, `DocIcon`, `Disclaimer { Label }`, `projectId`, `dataScope`, `source`, `filename`, `pageNumber`

### PdfFile

**Collection:** `pdffile`
**Timestamps:** createdAt, updatedAt
**File:** `libs/etl-manager/src/lib/etl/schemas/pdffile.schema.ts`

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `filename` | String | Yes | - | File name |
| `status` | String | No | `'created'` | Enum: `created`, `split`, `optimized`, `parsed`, `completed`, `error` |
| `hasErrors` | Boolean | No | - | Error flag |
| `errorMessage` | String | No | - | Error description |
| `folderId` | String | Yes | - | Parent folder ID |

### Semaphore

**Collection:** `semaphore`
**Timestamps:** createdAt, updatedAt
**File:** `libs/etl-manager/src/lib/etl/schemas/semaphore.schema.ts`

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `resource` | String | Yes | - | Resource being locked |
| `processType` | String | Yes | - | Process type holding lock |
| `ownerId` | String | Yes | - | Lock owner ID |
| `token` | String | Yes | - | Lock token |
| `lockedAt` | Date | Yes | - | Lock acquisition time |
| `expiresAt` | Date | Yes | - | Lock expiration time |

### GlobalCounter

**Collection:** `global_counters`
**Timestamps:** None
**File:** `libs/etl-manager/src/lib/etl/schemas/global-counter.schema.ts`

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `_id` | String | Yes | - | Sequence name (e.g., `project_order_seq`) |
| `seq` | Number | Yes | `0` | Current counter value |

---

## Discriminators

### DataSourceBase

**Discriminator Key:** `type`
**File:** `libs/etl-manager/src/lib/etl/schemas/data-source-base.schema.ts`

Base schema for polymorphic data source types. Uses Mongoose discriminator pattern.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `type` | String | Yes | Enum: `SharePoint`, `S3`, `Local` |

### SharePointDataSource

**Extends:** DataSourceBase (type = `SharePoint`)
**File:** `libs/etl-manager/src/lib/etl/schemas/sharepoint-data-source.schema.ts`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `config` | SharePointConfigEntity | Yes | Embedded schema |

### S3DataSource

**Extends:** DataSourceBase (type = `S3`)
**File:** `libs/etl-manager/src/lib/etl/schemas/s3-data-source.schema.ts`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `config` | S3ConfigEntity | Yes | Embedded schema |

---

## Embedded Entity Schemas

### SharePointConfigEntity

**Schema Type:** Embedded (`_id: false`, `timestamps: false`)
**File:** `libs/etl-manager/src/lib/etl/entities/sharepoint-config.entity.ts`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `url` | String | Yes | SharePoint site URL |
| `tenantId` | String | Yes | Azure tenant ID |
| `driveId` | String | Yes | Drive identifier |
| `folderId` | String | No | Folder identifier |
| `siteId` | String | No | Site identifier |
| `listId` | String | No | List identifier |
| `deltaLink` | String | No | Delta sync tracking |
| `cronSchedule` | String | No | Cron expression |

### S3ConfigEntity

**Schema Type:** Embedded (`_id: false`, `timestamps: false`)
**File:** `libs/etl-manager/src/lib/etl/entities/s3-config.entity.ts`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `bucket` | String | Yes | S3 bucket name |
| `region` | String | Yes | AWS region |
| `prefix` | String | Yes | Key prefix |
| `accessKeyId` | String | Yes | AWS access key |

### DataSource Wrapper

**Schema Type:** Embedded (no `_id`)
**File:** `libs/etl-manager/src/lib/etl/schemas/data-source.schema.ts`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `type` | DataSourceType | Yes | Discriminator key |
| `config` | SharePointConfig \| S3Config \| LocalConfig | Yes | Discriminated union |

---

## Enums

### DataSourceType

```typescript
enum DataSourceType {
  SharePoint = 'SharePoint',
  S3 = 'S3',
  Local = 'Local'
}
```

### FileProcessingStrategy

```typescript
enum FileProcessingStrategy {
  BASE = 'BASE',
  PBP_SPLIT_FILE = 'PBP_SPLIT_FILE'  // Page-by-page split and process
}
```

### ChunkingStrategy

```typescript
enum ChunkingStrategy {
  BASE = 'BASE',
  PBP_SPLIT_FILE = 'PBP_SPLIT_FILE'  // Mirrors FileProcessingStrategy
}
```

---

## Interfaces

### SharePointConfig

```typescript
{
  url: string;
  tenantId: string;
  driveId: string;
  folderId?: string;
  siteId?: string;
  listId?: string;
  deltaLink?: string;
  cronSchedule?: string;
}
```

### S3Config

```typescript
{
  bucket: string;
  region: string;
  prefix: string;
  accessKeyId: string;
}
```

### LocalConfig

```typescript
{
  rootPath: string;  // Absolute or workspace-relative path
}
```

### SharePointFileSource

```typescript
{
  title: string;
  link: string;
}
```

### SharePointFile

```typescript
{
  id: string;
  name: string;
  webUrl: string;
  size: number;
  createdDateTime: string;
  lastModifiedDateTime: string;
  mimeType?: string;
}
```

---

## Indexes and Constraints

| Schema | Index | Type | Fields | Notes |
|--------|-------|------|--------|-------|
| File | Unique compound | unique | `{ fileOriginId: 1, projectId: 1 }` | One file per origin per project |
| File | Unique compound (partial) | unique, partial | `{ remoteId: 1, projectId: 1 }` | Only when `remoteId` exists |
| Semaphore | Unique compound | unique | `{ resource: 1, processType: 1 }` | One lock per resource+type |
| Vector | Single field | index | `{ fileId: 1 }` | Lookup by parent file |

---

## Relationships

### Reference Relationships (ObjectId refs)

```
File ──1:N──> Chunk        (File.chunks[], Chunk.fileId)
File ──1:N──> Vector       (Vector.fileId)
```

### Embedded Relationships

```
EtlConfig ──1:1──> DataSource ──1:1──> (SharePointConfig | S3Config | LocalConfig)
Chunk ──1:1──> ChunkMetadata ──1:1──> DocumentClassification
File ──1:1──> SharePointFileSource (as sourceData)
```

### Entity-Relationship Diagram

```
┌──────────────┐     ┌──────────┐     ┌──────────┐
│  EtlConfig   │     │   File   │────>│  Chunk   │
│              │     │          │     │          │
│ .dataSource ─┤     │ .chunks[]│     │ .metadata│
│   (embedded) │     │          │     │(embedded)│
│              │     │          │     └──────────┘
│ .chunksConfig│     │          │
│ .embConfig   │     │          │     ┌──────────┐
└──────────────┘     │          │────>│  Vector  │
                     └──────────┘     │          │
                                      │.page_emb │
┌──────────────┐     ┌──────────┐     └──────────┘
│  Semaphore   │     │  PdfFile │
│              │     │          │
│ .resource    │     │ .status  │
│ .processType │     │ .folderId│
│ .token       │     └──────────┘
└──────────────┘
                     ┌──────────────┐
                     │GlobalCounter │
                     │              │
                     │ ._id (seq)   │
                     │ .seq         │
                     └──────────────┘
```

---

## Status Workflows

### File Processing Status Workflow

```
uploaded → created → downloaded → analyzed → split
    → markdown-creating → markdown-created
    → chunking → chunked
    → embeddings-creating → embeddings-created → completed

Error paths:
    → download_failed (terminal)
    → failed (terminal from any state)
    → processing (legacy state)
```

### PdfFile Status Workflow

```
created → split → optimized → parsed → completed

Error path:
    → error (terminal, hasErrors: true)
```

### EtlConfig Status Values

```
active ←→ syncing ←→ error
  ↓
inactive (soft delete via deletedAt)
```

---

## Summary

| Metric | Count |
|--------|-------|
| Main Schemas | 9 |
| Embedded Schemas | 3 (ChunkMetadata, DocumentClassification, DataSource) |
| Discriminators | 1 base + 2 children (DataSourceBase → SharePoint, S3) |
| Entity Schemas | 2 (SharePointConfigEntity, S3ConfigEntity) |
| Enums | 3 (DataSourceType, FileProcessingStrategy, ChunkingStrategy) |
| Interfaces | 5 (SharePointConfig, S3Config, LocalConfig, SharePointFileSource, SharePointFile) |
| Compound Indexes | 3 (2 on File, 1 on Semaphore) |
| Single Indexes | 1 (Vector.fileId) |
| Reference Relationships | 2 (File→Chunk, File→Vector) |
| Embedded Relationships | 4 |
