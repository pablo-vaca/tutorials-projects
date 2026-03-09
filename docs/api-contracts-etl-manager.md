# API Contracts: etl-manager

> Exhaustive scan of all controllers, service public APIs, DTOs, and module exports.
> Generated: 2026-03-09 | Scan level: exhaustive

## Table of Contents

- [HTTP Controllers](#http-controllers)
  - [EtlController](#etlcontroller)
  - [EtlQueueController](#etlqueuecontroller)
  - [SemaphoreController](#semaphorecontroller)
  - [DocumentClassificationController](#documentclassificationcontroller)
  - [EtlManagerController](#etlmanagercontroller)
- [Service Public APIs](#service-public-apis)
  - [EtlService](#etlservice)
  - [EtlConfigService](#etlconfigservice)
  - [FileService](#fileservice)
  - [SharepointService](#sharepointservice)
  - [SemaphoreService](#semaphoreservice)
  - [DocumentClassifierService](#documentclassifierservice)
  - [ChunkMongoService](#chunkmongoservice)
  - [VectorService](#vectorservice)
  - [SharepointSyncOrchestrator](#sharepointsyncorchestrator)
  - [EtlManagerService](#etlmanagerservice)
- [DTOs and Request Validation](#dtos-and-request-validation)
- [Job Types and Queue Integration](#job-types-and-queue-integration)
- [Module Exports](#module-exports)

---

## HTTP Controllers

### EtlController

**Route Prefix:** `/etl`
**Guards:** `@ApiBearerAuth('access-token')`, `@UseInterceptors(ClassSerializerInterceptor)`
**File:** `libs/etl-manager/src/lib/etl/controllers/etl.controller.ts`

| HTTP | Path | Method | Parameters | Return Type |
|------|------|--------|------------|-------------|
| POST | `/etl/files/:fileId/chunks` | `createChunks` | `fileId` (param), `request` (Request), `body` (CreateFileEmbeddingsDto) | `Promise<{ message: string }>` |
| POST | `/etl/configs` | `createConfig` | `body` (CreateEtlConfigDto) | `Promise<{ configId: string; message: string }>` |
| DELETE | `/etl/configs/:configId/:correlationId` | `deleteConfig` | `configId` (param), `correlationId` (param) | `Promise<{ message: string; job: any }>` |
| POST | `/etl/new-project-sync` | `testNewProject` | `body` (any) | `Promise<{ response: any }>` |
| POST | `/etl/clear-project-data` | `projectDataCleanup` | `projectId` (query), `correlationId` (query) | `Promise<{ message: string; projectId: string; correlationId: string; job: any }>` |

### EtlQueueController

**Route Prefix:** `/etl`
**Guards:** `@AllowControllerWithNoBearer()`
**File:** `libs/etl-manager/src/lib/etl/controllers/etl.queue.controller.ts`

| HTTP | Path | Method | Parameters | Return Type |
|------|------|--------|------------|-------------|
| POST | `/etl/test-queue-job/:status` | `queueTestJob` | `status` (param: 'success' \| 'fail') | `Promise<any>` |
| POST | `/etl/cleanup-test-jobs` | `cleanupTestJobs` | none | `Promise<any>` |

### SemaphoreController

**Route Prefix:** `/semaphore`
**Guards:** `@AllowControllerWithNoBearer()`
**File:** `libs/etl-manager/src/lib/etl/controllers/semaphore.controller.ts`

| HTTP | Path | Method | Parameters | Return Type |
|------|------|--------|------------|-------------|
| GET | `/semaphore/is-locked` | `isLocked` | `resource` (query), `processType` (query) | `Promise<{ locked: boolean; ownerId?: string; expiresAt?: Date }>` |
| POST | `/semaphore/acquire` | `acquire` | `resource`, `processType`, `ownerId` (body) | `Promise<{ acquired: boolean; token?: string; ownerId?: string; expiresAt?: Date; reason?: string }>` |
| POST | `/semaphore/release` | `release` | `resource`, `processType`, `ownerId`, `token` (body) | `Promise<{ released: boolean; reason?: string }>` |
| POST | `/semaphore/refresh` | `refresh` | `resource`, `processType`, `ownerId`, `token` (body) | `Promise<{ refreshed: boolean; expiresAt?: Date; reason?: string }>` |
| POST | `/semaphore/force-release` | `forceRelease` | `resource`, `processType` (body) | `Promise<{ forced: boolean }>` |

### DocumentClassificationController

**Route Prefix:** `/etl/classification`
**Guards:** `@AllowControllerWithNoBearer()`
**File:** `libs/etl-manager/src/lib/etl/controllers/document-classification.controller.ts`

| HTTP | Path | Method | Parameters | Return Type |
|------|------|--------|------------|-------------|
| POST | `/etl/classification/classify` | `classifyDocument` | `dto` (body: ClassifyFileDto) | `Promise<ClassificationResult>` |
| POST | `/etl/classification/:fileId` | `classifyDocumentByParam` | `fileId` (param) | `Promise<ClassificationResult>` |

### EtlManagerController

**Route Prefix:** `/etl-manager`
**File:** `libs/etl-manager/src/lib/etl-manager.controller.ts`

| HTTP | Path | Method | Parameters | Return Type |
|------|------|--------|------------|-------------|
| GET | `/etl-manager/hello` | `getHello` | none | `{ message: string }` |

---

## Service Public APIs

### EtlService

**File:** `libs/etl-manager/src/lib/etl/services/etl.service.ts`

Core orchestration service for the ETL pipeline. Manages file upload, download, analysis, splitting, markdown conversion, chunking, embedding, and sync operations.

| Method | Parameters | Return |
|--------|------------|--------|
| `uploadFileFromBuffer` | `{ mongoFileId, buffer, fileName, mimeType }` | `Promise<string>` |
| `moveEmbeddingsToVectorstore` | `file: FileDocument` | `Promise<string[]>` |
| `upsertFileFromDelta` | `change: SharePointFile, driveId: string` | `Promise<void>` |
| `deleteFileByOriginId` | `fileOriginId: string` | `Promise<void>` |
| `deleteFileById` | `mongoFileId: string` | `Promise<void>` |
| `createEtlProcessForProject` | `projectId, projectName, sharepointUrl, dataScope, dataSourceType?` | `Promise<string>` |
| `ensureEtlConfig` | `configId?, projectId?, includeDeleted?` | `Promise<EtlConfigDocument>` |
| `downloadFileFromSource_StoreItInCache_CreateMongoFile` | `mongoFileId: string` | `Promise<string>` |
| `analyzeFile_ReturnNextStep` | `fileName, fileSource, fileLink, fileOriginId, fileMimeType, configId, projectId` | `Promise<EtlAnalyzeResponse>` |
| `splitFileIntoPagesFromMongoFileId` | `mongoFileId: string` | `Promise<string[]>` |
| `convertImageFileToMarkdownFromMongoFileId` | `mongoFileId, pageFile` | `Promise<string>` |
| `getImageContentFromMongoFile` | `mongoFileId, pageFile` | `Promise<ImageMarkdownData>` |
| `getMarkdownFromContent` | `data: ImageMarkdownData` | `Promise<string>` |
| `uploadMarkdownFileAndGetChunks` | `mongoFileId, markdownFile` | `Promise<void>` |
| `uploadMarkdown` | `data: MarkdownUploadData` | `Promise<string>` |
| `chunkMarkdown` | `mongoFileId, remoteId, data, etlConfig` | `Promise<void>` |
| `chunkMarkdownLocally` | `mongoFileId, data, etlConfig` | `Promise<void>` |
| `deltaSyncForAllActiveProjects` | none | `Promise<any>` |
| `deltaSyncProject` | `config: DeltaSyncProjectType` | `Promise<void>` |
| `projectCleanup` | `projectId, correlationId, type: 'RESYNC' \| 'DELETE'` | `Promise<any>` |
| `removeTemporaryEtlFolder` | `mongoFileId: string` | `Promise<void>` |

### EtlConfigService

**File:** `libs/etl-manager/src/lib/etl/services/etl-config.service.ts`

CRUD operations for ETL configurations with soft-delete, history tracking, and status management.

| Method | Parameters | Return |
|--------|------------|--------|
| `create` | `configData: Partial<EtlConfig>` | `Promise<EtlConfigDocument>` |
| `findById` | `id: string` | `Promise<EtlConfigDocument \| null>` |
| `findByProjectId` | `projectId, includeDeleted?` | `Promise<EtlConfigDocument \| null>` |
| `findByQuery` | `query: FilterQuery, includeDeleted?` | `Promise<EtlConfigDocument[]>` |
| `findByField` | `field: keyof EtlConfig, value` | `Promise<EtlConfigDocument[]>` |
| `getDefaultConfig` | `paramObj: object` | `EtlConfigDocument` |
| `update` | `id, updateData: Partial<EtlConfig>` | `Promise<EtlConfigDocument \| null>` |
| `updateStatus` | `id, status, errorMessage?` | `Promise<EtlConfigDocument \| null>` |
| `updateStatusToSyncing` | `id, errorMessage?` | `Promise<EtlConfigDocument \| null>` |
| `softDelete` | `id: string` | `Promise<EtlConfigDocument \| null>` |
| `delete` | `id, soft?` | `Promise<EtlConfigDocument \| null>` |
| `addHistoryEntry` | `id, action` | `Promise<EtlConfigDocument \| null>` |
| `getProjectOrder` | `projectId` | `Promise<number \| null>` |
| `getLastResyncTimestamp` | `config: EtlConfig` | `Promise<Date \| null>` |

### FileService

**File:** `libs/etl-manager/src/lib/etl/services/file.service.ts`

CRUD operations for File documents with status tracking, aggregation, and batch operations.

| Method | Parameters | Return |
|--------|------------|--------|
| `createFile` | `fileData: Partial<File>` | `Promise<FileDocument>` |
| `findById` | `id` | `Promise<FileDocument \| null>` |
| `findByRemoteId` | `remoteId` | `Promise<FileDocument \| null>` |
| `findByFileOriginId` | `fileOriginId` | `Promise<FileDocument \| null>` |
| `findByFileOriginIdAndProjectId` | `fileOriginId, projectId` | `Promise<FileDocument \| null>` |
| `updatePagesToProcess` | `id, pages` | `Promise<FileDocument \| null>` |
| `updateTotalPagesProcessed` | `id` | `Promise<FileDocument \| null>` |
| `updateStatus` | `id, status, errorMessage?` | `Promise<FileDocument \| null>` |
| `syncChunks` | `id` | `Promise<FileDocument \| null>` |
| `markEmbeddingsStored` | `id` | `Promise<FileDocument \| null>` |
| `updateProjectId` | `id, projectId` | `Promise<FileDocument \| null>` |
| `updateStorageFilename` | `id, storageFilename, fileSize` | `Promise<FileDocument \| null>` |
| `updateRemoteId` | `id, remoteId` | `Promise<FileDocument \| null>` |
| `updateFileForAnalyze` | `id, data: { fileName, fileOriginId, remoteId, fileSource, sourceData, mimeType }` | `Promise<FileDocument \| null>` |
| `findByStatus` | `status` | `Promise<FileDocument[]>` |
| `findByUser` | `userId` | `Promise<FileDocument[]>` |
| `getStatusCounts` | none | `Promise<{ _id: string; count: number }[]>` |
| `countCompletedDocumentsByProjectId` | `projectId` | `Promise<number>` |
| `countAllDocumentsByProjectId` | `projectId` | `Promise<number>` |
| `deleteById` | `id` | `Promise<FileDocument \| null>` |
| `deleteByProjectId` | `projectId` | `Promise<{ deletedCount: number }>` |
| `findByProjectId` | `projectId` | `Promise<FileDocument[]>` |
| `getFileStatusCountsByProjectId` | `projectId` | `Promise<{ status: string; count: number }[]>` |

### SharepointService

**File:** `libs/etl-manager/src/lib/etl/services/sharepoint.service.ts`

Microsoft Graph API integration for SharePoint file operations, delta sync, and drive management.

| Method | Parameters | Return |
|--------|------------|--------|
| `onModuleInit` | none | `Promise<void>` |
| `initialize` | `config: EtlConfig` | `Promise<void>` |
| `listFiles` | `driveId, folderId?` | `Promise<SharePointFile[]>` |
| `downloadFile` | `driveId, fileId` | `Promise<Buffer>` |
| `getFileDetails` | `driveId, fileId` | `Promise<SharePointFile>` |
| `listDrives` | `siteId` | `Promise<Record<string, unknown>[]>` |
| `searchItemByName` | `driveId, name` | `Promise<Record<string, unknown>[]>` |
| `getFilesRecursively` | `driveId, folderId?, fileExtensions?` | `Promise<SharePointFile[]>` |
| `getDocumentLibraryId` | `siteId, libraryName?` | `Promise<string>` |
| `getDeltaChanges` | `currentDeltaLink?, driveId, folderId` | `Promise<SharePointSite>` |
| `getDriveItemFromUrl` | `url` | `Promise<{ id, name, webUrl, parentReference }>` |
| `validateAndResolveFolder` | `host, path` | `Promise<{ uniqueId, canonicalUrl }>` |
| `resolveSharingLink` | `sharingUrl` | `Promise<{ uniqueId, canonicalUrl }>` |
| `getAccessToken` | none | `string` |

### SemaphoreService

**File:** `libs/etl-manager/src/lib/etl/services/semaphore.service.ts`

Distributed locking via MongoDB atomic operations.

| Method | Parameters | Return |
|--------|------------|--------|
| `acquire` | `resource, processType, ownerId, doRetry?` | `Promise<{ acquired, token?, ownerId?, expiresAt?, reason? }>` |
| `release` | `resource, processType, ownerId, token` | `Promise<{ released, reason? }>` |
| `isLocked` | `resource, processType` | `Promise<{ locked, ownerId?, expiresAt? }>` |
| `forceRelease` | `resource, processType` | `Promise<{ forced }>` |
| `refresh` | `resource, processType, ownerId, token` | `Promise<{ refreshed, expiresAt?, reason? }>` |

### DocumentClassifierService

**File:** `libs/etl-manager/src/lib/etl/services/document-classification.service.ts`

AI-powered document classification using dual LLM strategy (Mastra + LangChain).

| Method | Parameters | Return |
|--------|------------|--------|
| `onModuleInit` | none | `Promise<void>` |
| `classifyAndTagFile` | `fileId, config?: ClassificationConfig` | `Promise<ClassificationResult>` |

### ChunkMongoService

**File:** `libs/etl-manager/src/lib/etl/services/chunk-mongo.service.ts`

CRUD operations for document chunks with bulk operations.

| Method | Parameters | Return |
|--------|------------|--------|
| `createChunk` | `chunkData: Partial<Chunk>` | `Promise<ChunkDocument>` |
| `findByFileId` | `fileId` | `Promise<ChunkDocument[]>` |
| `updateEmbedding` | `chunkId, embedding: number[]` | `Promise<ChunkDocument \| null>` |
| `createChunks` | `chunksData: Partial<Chunk>[]` | `Promise<ChunkDocument[]>` |
| `deleteMany` | `query: FilterQuery` | `Promise<{ deletedCount }>` |
| `deleteByFileIds` | `fileIds: string[]` | `Promise<{ deletedCount }>` |
| `getChunksByFileId` | `fileId` | `Promise<ChunkDocument[]>` |
| `updateChunksByFileId` | `fileId, updateData` | `Promise<{ modifiedCount }>` |

### VectorService

**File:** `libs/etl-manager/src/lib/etl/services/vector.service.ts`

Vector storage operations for embeddings.

| Method | Parameters | Return |
|--------|------------|--------|
| `insertVectors` | `vectors: Partial<Vector>[]` | `Promise<any[]>` |
| `createMany` | `vectors: Partial<Vector>[]` | `Promise<VectorDocument[]>` |
| `deleteByFileId` | `fileId` | `Promise<{ deletedCount }>` |
| `deleteByProjectId` | `projectId` | `Promise<{ deletedCount }>` |
| `appendMetadata` | `ids, filename, pageNumber` | `Promise<any>` |

### SharepointSyncOrchestrator

**File:** `libs/etl-manager/src/lib/etl/services/sharepoint-sync-orchestrator.service.ts`

Orchestrates delta sync across all active projects.

| Method | Parameters | Return |
|--------|------------|--------|
| `triggerTest` | `ownerId` | `Promise<void>` |
| `triggerDeltaSyncForAllActiveProjects` | none | `Promise<EtlConfigDocument[]>` |
| `deltaSyncProject` | `config: DeltaSyncProjectType` | `Promise<void>` |

### EtlManagerService

**File:** `libs/etl-manager/src/lib/etl-manager.service.ts`

Placeholder service for library health check.

| Method | Parameters | Return |
|--------|------------|--------|
| `getHello` | none | `{ message: string }` |

---

## DTOs and Request Validation

### CreateEtlConfigDto

```typescript
{
  projectId: string;        // @IsString, @IsNotEmpty
  projectName: string;      // @IsString, @IsNotEmpty
  dataScope: string;        // @IsString, @IsNotEmpty
  sharepointUrl: string;    // @IsUrl, @IsNotEmpty
  sharepointTennantId: string; // @IsString, @IsNotEmpty
  sharepointFolder: string; // @IsString, @IsNotEmpty
  chunksConfig: ChunksConfigDto;       // @ValidateNested, @Type
  embeddingsConfig: EmbeddingsConfigDto; // @ValidateNested, @Type
}
```

### CreateFileEmbeddingsDto

```typescript
{
  projectId: string;     // @IsString, @IsNotEmpty
  chunkSize: number;     // @IsNumber, @Min(100), @Max(2000)
  overlap: number;       // @IsNumber, @Min(0), @Max(660)
  deploymentId: string;  // @IsString, @IsNotEmpty
  user: string;          // @IsString, @IsNotEmpty
  model: string;         // @IsString, @IsNotEmpty
}
```

### ChunksConfigDto

```typescript
{
  chunkSize: number;  // @IsNumber, @Min(100), @Max(2000)
  overlap: number;    // @IsNumber, @Min(0), @Max(660)
}
```

### EmbeddingsConfigDto

```typescript
{
  deploymentId: string;  // @IsString, @IsNotEmpty
  user: string;          // @IsString, @IsNotEmpty
  model: string;         // @IsString, @IsNotEmpty
}
```

### SyncSharePointFilesDto

```typescript
{
  configId: string;          // @IsString, @IsNotEmpty
  fileExtensions?: string[]; // @IsArray, @IsOptional
}
```

### ProcessSharePointFileDto

```typescript
{
  driveId: string;  // @IsString, @IsNotEmpty
  fileId: string;   // @IsString, @IsNotEmpty
}
```

### ClassifyFileDto

```typescript
{
  fileId: string;
  config?: ClassificationConfig;
}
```

### ClassificationConfig

```typescript
{
  headChunks?: number;           // default: 3
  middleChunks?: number;         // default: 2
  tailChunks?: number;           // default: 1
  confidenceThreshold?: number;  // 0-1, default: 0.75
  useLangChain?: boolean;        // default: false
}
```

### ClassificationResult

```typescript
{
  fileId: string;
  category: string;
  confidence: number;
  reasoning: string;
  needsReview: boolean;
  chunksAnalyzed: number;
  totalChunks: number;
}
```

---

## Job Types and Queue Integration

### EtlJobType Enum

| Constant | Value | Description |
|----------|-------|-------------|
| `ETL_UPLOAD_FILE` | `etl:upload_file` | Upload file to storage |
| `ETL_CREATE_CHUNKS` | `etl:create_chunks` | Create text chunks from file |
| `ETL_CREATE_EMBEDDINGS` | `etl:create_embeddings` | Generate vector embeddings |
| `ETL_MOVE_TO_VECTORSTORE` | `etl:move_to_vectorstore` | Move embeddings to vector store |
| `ETL_PROCESS_FULL` | `etl:process_full` | Full pipeline processing |
| `ETL_PROCESS_SHAREPOINT_FILE` | `etl:process_sharepoint_file` | Process SharePoint file |
| `ETL_SHAREPOINT_DELTA_DELETE` | `etl:sharepoint_delta_delete` | Delete file from delta sync |
| `ETL_SHAREPOINT_DELTA_UPSERT` | `etl:sharepoint_delta_upsert` | Upsert file from delta sync |
| `SHAREPOINT_DELTA_SYNC` | `etl:sharepoint_delta_sync` | Trigger full delta sync |
| `SHAREPOINT_DELTA_SYNC_PROJECT` | `etl:sharepoint_delta_sync_project` | Sync single project |
| `DOWNLOAD_FILE` | `etl:download_file` | Download file from source |
| `ANALYZE_FILE` | `etl:analyze_file` | Analyze file for processing strategy |
| `SPLIT_PAGES` | `etl:split_pages` | Split document into pages |
| `GENERATE_MARKDOWNS` | `etl:generate_markdowns` | Generate markdown from pages |
| `MARKDOWN_TO_CHUNKS` | `etl:markdown_to_chunks` | Convert markdown to chunks |
| `FULL_MARKDOWN_PROCESS` | `etl:full_markdown_process` | Full markdown pipeline |
| `CLEAR_PROJECT_DATA` | `etl:clear_project_data` | Clear all project data |
| `PDF_DOWNLOAD_AND_SPLIT` | `etl:pdf_download_and_split` | Download PDF and split |
| `PDF_MARKDOWN_PROCESS` | `etl:pdf_markdown_process` | Process PDF to markdown |
| `PDF_UPLOAD_PROCESS` | `etl:pdf_upload_process` | Upload processed PDF |
| `PDF_CHUNK_PROCESS` | `etl:pdf_chunk_process` | Chunk PDF content |
| `PDF_LOCAL_CHUNK_PROCESS` | `etl:pdf_local_chunk_process` | Chunk PDF locally |

### Base Job Data

```typescript
interface EtlJobData {
  projectId: string;
  correlationId: string;
  preventChaining?: boolean;
  configId?: string;
  userId?: string;
  accessToken?: string;
  dataScope?: string;
}
```

### Job Handler Interface

```typescript
interface ISingleEtlHandler<T extends IJobData> {
  handle(job: QueueJob<T>, etlConfig?: EtlConfigDocument): Promise<IJobResult>;
}
```

---

## Module Exports

### EtlModule (internal)

Exports: `EtlConfigService`, `EtlService`, `FileService`, `SharepointService`, `SharepointSyncOrchestrator`, `PdfImagesService`, `PdfFileService`, `Logger`, `EtlSharedService`, `SemaphoreService`, `TestHandler`, `ClearProjectDataHandler`

### EtlManagerModule (library public API)

Exports via `libs/etl-manager/src/index.ts`:
- `EtlManagerModule`
- `EtlManagerService`

---

## Summary

| Metric | Count |
|--------|-------|
| HTTP Controllers | 5 |
| HTTP Endpoints | 15 |
| Service Classes | 10 |
| Total Public Methods | ~90 |
| DTOs | 8 |
| Job Types | 22 |
| Module Exports (public) | 2 |
