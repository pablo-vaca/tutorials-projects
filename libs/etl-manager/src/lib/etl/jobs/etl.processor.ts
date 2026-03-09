/* eslint-disable max-lines */
/* eslint-disable max-lines-per-function */
/* eslint-disable no-plusplus */
/* eslint-disable no-await-in-loop */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';


import { Injectable, Logger } from '@nestjs/common';

import {
    BaseQueueConsumer,
    GenericQueueService,
    IJobResult,
    JobType,
    MongoQueueOptions,
    QueueJob,
    QueuePriorityEnum,
} from '@deal-insights/shared-nestjs-utils';

import {
    EtlUploadFileJobData,
    EtlCreateChunksJobData,
    EtlCreateEmbeddingsJobData,
    EtlMoveToVectorstoreJobData,
    EtlProcessFullJobData,
    EtlSharePointDeltaDeleteJobData,
    EtlSharePointDeltaUpsertJobData,
    EtlJobType,
    EtlJobData,
    EtlDownloadFileJobData,
    EtlSplitFileIntoPagesJobData,
    EtlGenerateMarkdownsFromPagesJobData,
    EtlIterateCreateChunksJobData,
    EtlAnalyzeFileJobData,
    EtlDeltaSyncForAllActiveProjectsJobData,
    EtlDeltaSyncProjectJobData,
    DeltaSyncProjectType,
    EtlMarkdownBuilderJobData,
    EtlUploadMarkdownJobData,
    EtlNewChunkMarkdownJobData,
} from './etl-job.types';
import { ISingleEtlHandler } from './single-etl-handler.interface';
import { FeatureFlagEnum } from '../../feature-flag/enums/feature-flag.enum';
import { FeatureFlagService } from '../../feature-flag/feature-flag.service';
import { ProcessingException } from '../exceptions';
import { DataSourceType, LocalConfig, SharePointConfig } from '../schemas';
import { EtlConfig, EtlConfigDocument } from '../schemas/etl-config.schema';
import ChunkMongoService from '../services/chunk-mongo.service';
import ChunkProcessorService from '../services/etl-chunks.service';
import EtlConfigService from '../services/etl-config.service';
import EtlEmbeddingProcessorService from '../services/etl-embeddings-processor.service';
import { ImageMarkdownData, MarkdownUploadData } from '../services/etl-image-markdown.service';
import EtlSharedService, {
    EtlAnalyzeNextStep,
    EtlAnalyzeResponse,
} from '../services/etl-shared.service';
import EtlService from '../services/etl.service';
import FileService from '../services/file.service';
import { SemaphoreService } from '../services/semaphore.service';
import VectorService from '../services/vector.service';
import { ClearProjectDataHandler } from './handlers/clear-project-data.handle';
import { TestHandler } from './handlers/test.handler';
import SharepointService from '../services/sharepoint.service';

const successFileDownload = 'File downloaded successfully';
const markdownCreated = 'markdown-created';

const retryAsync = async <T>(
    fn: () => Promise<T>,
    retries: number,
    delayMs: number,
    logger?: Logger,
    message?: string
): Promise<T> => {
    let lastError: unknown;

    for (let i = 0; i <= retries; i++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            logger?.verbose?.(
                `${message ?? 'RetryAsync'} | Attempt ${i + 1} of ${retries + 1} failed`,
                err.data
            );
            if (i < retries) {
                // eslint-disable-next-line no-promise-executor-return
                await new Promise((res) => setTimeout(res, delayMs));
            }
        }
    }

    throw lastError;
};

/**
 * ETL job processor
 * Handles all ETL-related job processing
 */
@Injectable()
export class EtlJobProcessor extends BaseQueueConsumer {
    private readonly handlers: Record<string, ISingleEtlHandler<any>> = {};

    /**
     *
     * @param etlService
     * @param etlConfigService
     * @param fileService
     * @param chunkMongoService
     * @param vectorService
     * @param queueService
     * @param chunkProcessorService
     * @param embeddingProcessorService
     * @param testHandler
     * @param clearProjectDataHandler
     * @param sharepointService
     * @param sharepointSyncService
     * @param etlSharedService
     * @param semaphoreService
     * @param featureFlagService
     */
    constructor(
        private readonly etlService: EtlService,
        private readonly etlConfigService: EtlConfigService,
        private readonly fileService: FileService,
        private readonly chunkMongoService: ChunkMongoService,
        private readonly vectorService: VectorService,
        private readonly queueService: GenericQueueService,
        private readonly chunkProcessorService: ChunkProcessorService,
        private readonly embeddingProcessorService: EtlEmbeddingProcessorService,
        private readonly etlSharedService: EtlSharedService,
        private readonly semaphoreService: SemaphoreService,
        private readonly testHandler: TestHandler,
        private readonly clearProjectDataHandler: ClearProjectDataHandler,
        private readonly sharepointService: SharepointService,
        private readonly featureFlagService: FeatureFlagService
    ) {
        super(EtlJobProcessor.name);
        this.handlers[JobType.TEST] = this.testHandler;
        this.handlers[EtlJobType.CLEAR_PROJECT_DATA] = this.clearProjectDataHandler;
    }

    /**
     *
     * @param job
     */
    async processSyncAllProjects(
        job: QueueJob<EtlDeltaSyncForAllActiveProjectsJobData>
    ): Promise<IJobResult> {
        return this.handleDeltaSyncForAllActiveProjects(job);
    }

    /**
     * Process ETL jobs based on job type
     * @param job - The job to process
     * @returns Job result∏
     */
    async process(job: QueueJob<EtlJobData>): Promise<IJobResult> {
        try {
            const etlConfig = await this.loadConfigForJob(job);
            const expiredJob = await this.isExpiredJob(job, etlConfig);
            if (expiredJob.expired) {
                return {
                    success: false,
                    data: {
                        message: expiredJob.message,
                    },
                };
            }

            this.logger.verbose(` # # Trying with strategy ${job.jobType} # # `);
            const handler = this.handlers[job.jobType];
            if (!handler) {
                // throw error here
                this.logger.verbose(
                    ` # > No strategy handler found for ${job.jobType}. Continuing with switch (deprecated).`
                );
                // throw
            } else {
                // remove else wrap (not the content) when full migration to strategy complete
                this.logger.verbose(' # > Handler found');
                return await handler.handle(job, etlConfig);
            }

            this.logger.log(`Processing ETL job: ${job.jobType}`);

            switch (job.jobType) {
                case EtlJobType.ETL_UPLOAD_FILE:
                    return await this.handleUploadFile(
                        job as QueueJob<EtlUploadFileJobData>,
                        etlConfig
                    );

                case EtlJobType.ETL_CREATE_CHUNKS:
                    return await this.handleCreateChunks(
                        job as QueueJob<EtlCreateChunksJobData>,
                        etlConfig
                    );

                case EtlJobType.ETL_CREATE_EMBEDDINGS:
                    return await this.handleCreateEmbeddings(
                        job as QueueJob<EtlCreateEmbeddingsJobData>,
                        etlConfig
                    );

                case EtlJobType.ETL_MOVE_TO_VECTORSTORE:
                    return await this.handleMoveToVectorstore(
                        job as QueueJob<EtlMoveToVectorstoreJobData>
                    );

                case EtlJobType.ETL_PROCESS_FULL:
                    return await this.handleProcessFull(
                        job as QueueJob<EtlProcessFullJobData>,
                        etlConfig
                    );

                case EtlJobType.ETL_SHAREPOINT_DELTA_DELETE:
                    return await this.handleSharePointDeltaDelete(
                        job as QueueJob<EtlSharePointDeltaDeleteJobData>
                    );

                case EtlJobType.ETL_SHAREPOINT_DELTA_UPSERT:
                    return await this.handleSharePointDeltaUpsert(
                        job as QueueJob<EtlSharePointDeltaUpsertJobData>,
                        etlConfig
                    );

                case EtlJobType.ANALYZE_FILE:
                    return await this.handleAnalyzeFile(
                        job as QueueJob<EtlAnalyzeFileJobData>,
                        etlConfig
                    );

                case EtlJobType.DOWNLOAD_FILE:
                    return await this.handleDownloadFile(
                        job as QueueJob<EtlDownloadFileJobData>,
                        etlConfig
                    );

                case EtlJobType.SPLIT_PAGES:
                    return await this.handleSplitFileIntoPages(
                        job as QueueJob<EtlSplitFileIntoPagesJobData>,
                        etlConfig
                    );

                case EtlJobType.GENERATE_MARKDOWNS:
                    return await this.handleGenerateMarkdownsFromPages(
                        job as QueueJob<EtlGenerateMarkdownsFromPagesJobData>,
                        etlConfig
                    );

                case EtlJobType.MARKDOWN_TO_CHUNKS:
                    return await this.handleMarkdownToChunks(
                        job as QueueJob<EtlIterateCreateChunksJobData>,
                        etlConfig
                    );

                case EtlJobType.SHAREPOINT_DELTA_SYNC_PROJECT:
                    return await this.handleDeltaSyncProject(
                        job as QueueJob<EtlDeltaSyncProjectJobData>
                    );

                case EtlJobType.FULL_MARKDOWN_PROCESS:
                    return await this.handleFullMarkdownProcess(
                        job as QueueJob<EtlDownloadFileJobData>,
                        etlConfig
                    );

                case EtlJobType.PDF_DOWNLOAD_AND_SPLIT:
                    return await this.handleDownloadAndSplit(
                        job as QueueJob<EtlDownloadFileJobData>,
                        etlConfig
                    );
                case EtlJobType.PDF_MARKDOWN_PROCESS:
                    return await this.handleMarkdownBuilder(
                        job as QueueJob<EtlMarkdownBuilderJobData>
                    );
                case EtlJobType.PDF_UPLOAD_PROCESS:
                    // will be removed, use PDF_LOCAL_CHUNK_PROCESS job instead, ticket: https://dev.azure.com/mmctech/Mercer-PDE-Commercial-AI/_workitems/edit/2240260
                    return await this.handleUploadMarkdown(
                        job as QueueJob<EtlUploadMarkdownJobData>
                    );
                case EtlJobType.PDF_CHUNK_PROCESS:
                    return await this.handleChunkMarkdown(
                        job as QueueJob<EtlNewChunkMarkdownJobData>,
                        etlConfig
                    );
                case EtlJobType.PDF_LOCAL_CHUNK_PROCESS:
                    return await this.handleLocalMarkdownChunks(
                        job as QueueJob<EtlNewChunkMarkdownJobData>,
                        etlConfig
                    );

                default:
                    throw new Error(`Unknown ETL job type: ${job.jobType}`);
            }
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.logger.error(`ETL job failed: ${err.message}`);
            // Re-throw the error so the queue can retry it
            throw err;
        }
    }

    /**
     * @param job
     */
    private async loadConfigForJob(job: QueueJob<EtlJobData>): Promise<EtlConfigDocument> {
        if (!job.payload.configId && !job.payload.projectId && job.payload.mongoFileId) {
            const etlFile = await this.fileService.findById(job.payload.mongoFileId as string);
            if (!etlFile) {
                throw new Error(
                    `[ETL] File not found for loadConfig: mongoFileId=${job.payload.mongoFileId}`
                );
            }
            return this.etlConfigService.findById(etlFile.configId);
        }

        const includeDeleted = job.jobType === EtlJobType.CLEAR_PROJECT_DATA;

        return this.etlService.ensureEtlConfig(
            job.payload.configId,
            job.payload.projectId,
            includeDeleted
        );
    }

    /**
     * Handle upload file job
     * @param job
     * @param etlConfig
     * @deprecated use handlers/<name>.handler.ts
     */
    private async handleUploadFile(
        job: QueueJob<EtlUploadFileJobData>,
        etlConfig: EtlConfigDocument
    ): Promise<IJobResult> {
        this.logger.log(`[UPLOAD] Starting file upload: ${job.payload.mongoFileId}`);

        const { mongoFileId } = job.payload;

        const mongoFile = await this.fileService.findById(mongoFileId);

        if (!mongoFile) {
            throw new Error(`ETL mongo file not found (mongoFileId=${mongoFileId ?? 'n/a'}`);
        }

        this.logger.log(
            `[UPLOAD] Uploading file '${mongoFile.fileName}' (origin ${mongoFile.fileOriginId})`
        );

        // Resolve config
        const resolvedConfigId = this.etlService.getConfigId(etlConfig);
        const resolvedProjectId = etlConfig.projectId;
        const chunkSettings = this.etlSharedService.resolveChunkSettings(etlConfig, mongoFile);

        let fileBuffer = null;
        if (mongoFile.fileSource === DataSourceType.SharePoint) {
            await this.sharepointService.initialize(etlConfig);
            const sourceConfig = etlConfig.dataSource.config as SharePointConfig;
            fileBuffer = await this.sharepointService.downloadFile(
                sourceConfig.driveId,
                mongoFile.fileOriginId
            );
        } else if (mongoFile.fileSource === DataSourceType.Local) {
            const sourceConfig = etlConfig.dataSource.config as LocalConfig;
            const rootPath = path.isAbsolute(sourceConfig.rootPath)
                ? sourceConfig.rootPath
                : path.resolve(process.cwd(), sourceConfig.rootPath);

            const fullPath = path.resolve(rootPath, mongoFile.fileOriginId);
            const rel = path.relative(rootPath, fullPath);
            if (rel.startsWith('..') || path.isAbsolute(rel)) {
                throw new ProcessingException(
                    ` > invalid local fileOriginId path traversal [${mongoFile.fileOriginId}]`
                );
            }

            fileBuffer = await fs.readFile(fullPath);
        } else {
            throw new ProcessingException(` > file source not supported [${mongoFile.fileSource}]`);
        }

        const uploaderId = 'queue-worker';

        this.logger.log(
            `[UPLOAD] Uploading file '${mongoFile.fileName}' (origin ${mongoFile.fileOriginId}) for user ${uploaderId}`
        );

        try {
            await this.etlService.uploadFileFromBuffer({
                mongoFileId,
                buffer: fileBuffer,
                fileName: mongoFile.fileName,
                mimeType: mongoFile.mimeType,
            });

            await this.fileService.updateProjectId(mongoFileId, resolvedProjectId);

            let nextJobId: string | undefined;

            if (chunkSettings) {
                nextJobId = await this.queueNextJob<EtlCreateChunksJobData>(
                    EtlJobType.ETL_CREATE_CHUNKS,
                    {
                        correlationId: etlConfig.correlationId,
                        mongoFileId,
                        configId: resolvedConfigId,
                        projectId: resolvedProjectId,
                    }
                );
                await this.fileService.updateStatus(mongoFileId, 'processing');
            } else {
                this.logger.warn(
                    `[UPLOAD] Missing chunk configuration in ETL config ${resolvedConfigId}; skipping automatic chunk job enqueue`
                );
                await this.fileService.updateStatus(mongoFileId, 'uploaded');
            }

            return {
                success: true,
                data: {
                    message: 'File uploaded successfully',
                    jobId: job.id,
                    mongoFileId,
                    nextJobId,
                },
            };
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            if (mongoFileId) {
                await this.fileService.updateStatus(mongoFileId, 'failed', err.message);
            }
            throw err;
        }
    }

    /**
     * Handle create chunks job
     * @param job
     * @param etlConfig
     */
    private async handleCreateChunks(
        job: QueueJob<EtlCreateChunksJobData>,
        etlConfig: EtlConfigDocument
    ): Promise<IJobResult> {
        this.logger.log(`[CHUNKS] Creating chunks for file: ${job.payload.mongoFileId}`);

        const { mongoFileId } = job.payload;

        try {
            const file = await this.fileService.findById(mongoFileId);
            if (!file) {
                throw new Error(`[CHUNKS] File not found for id ${mongoFileId}`);
            }

            const resolvedConfigId = this.etlService.getConfigId(etlConfig);
            const resolvedProjectId = etlConfig.projectId;
            const resolvedDataScope = etlConfig.dataScope;
            const chunkSettings = this.etlSharedService.resolveChunkSettings(etlConfig, file);

            if (!chunkSettings) {
                throw new Error(
                    `[CHUNKS] Missing chunk configuration for ETL config ${resolvedConfigId}`
                );
            }

            this.logger.debug(
                `[CHUNKS] Using chunkSize=${chunkSettings.chunkSize} overlap=${chunkSettings.overlap} (config ${resolvedConfigId})`
            );

            if (!resolvedProjectId) {
                throw new Error('[CHUNKS] Project ID is required to create chunks');
            }

            await this.fileService.updateStatus(mongoFileId, 'processing');
            let chunks = await this.chunkMongoService.findByFileId(mongoFileId);

            if (chunks.length === 0) {
                chunks = await this.chunkProcessorService.processChunks(file, {
                    chunkSize: chunkSettings.chunkSize,
                    overlap: chunkSettings.overlap,
                    projectId: resolvedProjectId,
                    dataScope: resolvedDataScope,
                });
            } else {
                this.logger.log(
                    `[CHUNKS] Found ${chunks.length} existing chunks for file ${mongoFileId}; skipping regeneration`
                );
            }

            let nextJobId: string | undefined;
            const embeddingSettings = this.etlSharedService.resolveEmbeddingSettings(etlConfig);

            if (embeddingSettings) {
                nextJobId = await this.queueNextJob<EtlCreateEmbeddingsJobData>(
                    EtlJobType.ETL_CREATE_EMBEDDINGS,
                    {
                        projectId: resolvedProjectId,
                        correlationId: etlConfig.correlationId,
                        mongoFileId,
                        configId: resolvedConfigId,
                    }
                );
            } else {
                this.logger.warn(
                    `[CHUNKS] Missing embedding configuration for ETL config ${resolvedConfigId}; skipping embeddings job enqueue`
                );
            }

            return {
                success: true,
                data: {
                    message: 'Chunks created',
                    jobId: job.id,
                    chunkCount: chunks.length,
                    nextJobId,
                },
            };
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            await this.fileService.updateStatus(mongoFileId, 'failed', err.message);
            throw err;
        }
    }

    /**
     * Handle create embeddings job
     * @param job
     * @param etlConfig
     */
    private async handleCreateEmbeddings(
        job: QueueJob<EtlCreateEmbeddingsJobData>,
        etlConfig: EtlConfigDocument
    ): Promise<IJobResult> {
        this.logger.log(`[EMBEDDINGS] Creating embeddings for file: ${job.payload.mongoFileId}`);
        const { mongoFileId } = job.payload;

        try {
            const resolvedConfigId = this.etlService.getConfigId(etlConfig);
            const embeddingSettings = this.etlSharedService.resolveEmbeddingSettings(etlConfig);

            if (!embeddingSettings) {
                throw new Error(
                    `[EMBEDDINGS] Missing embedding configuration for ETL config ${resolvedConfigId}`
                );
            }

            const chunks = await this.chunkMongoService.findByFileId(mongoFileId);

            if (chunks.length === 0) {
                throw new Error(
                    `[EMBEDDINGS] No chunks found for file ${mongoFileId}; cannot generate embeddings`
                );
            }

            await this.fileService.syncChunks(mongoFileId);

            await this.embeddingProcessorService.processEmbeddings(chunks, embeddingSettings);

            await this.fileService.markEmbeddingsStored(mongoFileId);
            await this.fileService.updateStatus(mongoFileId, 'embeddings-created');

            const nextJobId = await this.queueNextJob<EtlMoveToVectorstoreJobData>(
                EtlJobType.ETL_MOVE_TO_VECTORSTORE,
                {
                    projectId: etlConfig.projectId,
                    correlationId: etlConfig.correlationId,
                    mongoFileId,
                    dataScope: etlConfig.dataScope,
                    configId: resolvedConfigId,
                }
            );

            return {
                success: true,
                data: {
                    message: 'Embeddings generated',
                    jobId: job.id,
                    processedChunks: chunks.length,
                    nextJobId,
                },
            };
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.logger.error(`[EMBEDDINGS] - Error: ${err.message}`);
            await this.fileService.updateStatus(mongoFileId, 'failed', err.message);
            throw err;
        }
    }

    /**
     * Handle move to vectorstore job
     * @param job
     */
    private async handleMoveToVectorstore(
        job: QueueJob<EtlMoveToVectorstoreJobData>
    ): Promise<IJobResult> {
        this.logger.debug(
            `[VECTORSTORE] Moving embeddings to vectorstore for: ${job.payload.mongoFileId}`
        );
        const { mongoFileId, configId, projectId } = job.payload;

        try {
            await this.etlService.ensureEtlConfig(configId, projectId);

            const file = await this.fileService.findById(mongoFileId);

            if (!file) {
                throw new Error(`[VECTORSTORE] File not found for id ${mongoFileId}`);
            }

            // Idempotent: if already completed (e.g. job retried after ack failure), acknowledge and exit
            if (file.processingStatus === 'completed') {
                this.logger.debug(
                    `[VECTORSTORE] File ${mongoFileId} already completed, skipping (idempotent)`
                );
                return {
                    success: true,
                    data: {
                        message: 'Embeddings already moved (idempotent)',
                        jobId: job.id,
                        mongoFileId,
                    },
                };
            }

            if (job.tries > 1) {
                this.logger.warn(
                    `[VECTORSTORE] Retry detected for file ${mongoFileId}; removing existing vectors before reinserting`
                );
                await this.vectorService.deleteByFileId(mongoFileId);
            }

            await this.etlService.moveEmbeddingsToVectorstore(file);
            this.logger.warn(`[VECTORSTORE] Embedding moved for file ${mongoFileId}`);

            const featureIsActive = await this.featureFlagService.isActive(
                FeatureFlagEnum.CHUNK_CLEAN_FEATURE
            );
            if (featureIsActive) {
                await this.chunkMongoService.deleteByFileIds([mongoFileId]);
                this.logger.warn(`[VECTORSTORE] Embedding cleaned for file ${mongoFileId}`);
            }

            await this.fileService.updateStatus(mongoFileId, 'completed');

            return {
                success: true,
                data: {
                    message: 'Embeddings moved to vectorstore',
                    jobId: job.id,
                    mongoFileId,
                },
            };
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.logger.error(`[VECTORSTORE] -Error: ${err.message}`);
            await this.fileService.updateStatus(mongoFileId, 'failed', err.message);
            throw err;
        }
    }

    /**
     * Handle full process job (orchestrates all steps)
     * @param job
     * @param etlConfig
     */
    private async handleProcessFull(
        job: QueueJob<EtlProcessFullJobData>,
        etlConfig: EtlConfigDocument
    ): Promise<IJobResult> {
        this.logger.log(`[FULL] Starting full ETL process for: ${job.payload.fileName}`);
        const resolvedConfigId = this.etlService.getConfigId(etlConfig);

        return {
            success: true,
            data: {
                message: 'Queued staged ETL pipeline',
                conf: resolvedConfigId,
            },
        };
    }

    /**
     * Handle SharePoint delta delete job
     * Deletes a file and its associated data when it's been deleted from SharePoint
     * @param job
     */
    private async handleSharePointDeltaDelete(
        job: QueueJob<EtlSharePointDeltaDeleteJobData>
    ): Promise<IJobResult> {
        this.logger.debug(
            `[DELTA DELETE] Deleting file with origin ID: ${job.payload.fileOriginId}`
        );
        const { fileOriginId } = job.payload;

        try {
            // Delete the file and all associated data (chunks, embeddings, vectors)
            await this.etlService.deleteFileByOriginId(fileOriginId);

            return {
                success: true,
                data: {
                    message: `Sharepoint delta deletion queue for file id: ${fileOriginId} finish successfully`,
                    jobId: job.id,
                    fileOriginId,
                },
            };
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.logger.error(
                `[DELTA DELETE] Failed to delete file ${fileOriginId}: ${err.message}`
            );
            throw err;
        }
    }

    /**
     * Handle SharePoint delta upsert job
     * Downloads and processes a file that was added or updated in SharePoint
     * @param job
     * @param etlConfig
     */
    private async handleSharePointDeltaUpsert(
        job: QueueJob<EtlSharePointDeltaUpsertJobData>,
        etlConfig: EtlConfigDocument
    ): Promise<IJobResult> {
        this.logger.debug(
            `[DELTA UPSERT] Processing file: ${job.payload.change.name} (ID: ${job.payload.change.id})`
        );

        const { change, configId, projectId } = job.payload;

        try {
            const fileName = change.name;
            const fileId = change.id;
            const mimeType = change.file?.mimeType ?? 'application/octet-stream';

            // Check if file already exists by origin ID
            const existingFile = await this.fileService.findByFileOriginIdAndProjectId(
                fileId,
                projectId
            );

            if (existingFile) {
                this.logger.verbose(
                    `[DELTA UPSERT] File already exists with origin ID ${fileId}. Deleting old version before re-processing.`
                );
                // Delete the old version
                await this.etlService.deleteFileById(existingFile.id);
            }

            const nextJobId = await this.queueNextJob<EtlAnalyzeFileJobData>(
                EtlJobType.ANALYZE_FILE,
                {
                    projectId,
                    correlationId: etlConfig.correlationId,
                    fileName,
                    fileSource: DataSourceType.SharePoint,
                    fileLink: change.webUrl,
                    fileMimeType: mimeType,
                    fileOriginId: fileId,
                    configId,
                }
            );

            this.logger.debug(
                `[DELTA UPSERT] Successfully queued file processing for: ${fileName}`
            );

            return {
                success: true,
                data: {
                    message: 'File upsert queued successfully',
                    jobId: job.id,
                    fileName,
                    fileOriginId: fileId,
                    nextJobId,
                },
            };
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.logger.error(
                `[DELTA UPSERT] Failed to process file ${change.name}: ${err.message}`
            );
            throw err;
        }
    }

    /** Job types that are part of a per-document pipeline; we do not expire these so in-flight documents can finish. */
    private static readonly DOCUMENT_PIPELINE_JOB_TYPES = new Set<EtlJobType>([
        EtlJobType.ANALYZE_FILE,
        EtlJobType.PDF_DOWNLOAD_AND_SPLIT,
        EtlJobType.PDF_MARKDOWN_PROCESS,
        EtlJobType.PDF_UPLOAD_PROCESS,
        EtlJobType.PDF_CHUNK_PROCESS,
        EtlJobType.ETL_CREATE_EMBEDDINGS,
        EtlJobType.ETL_MOVE_TO_VECTORSTORE,
        EtlJobType.DOWNLOAD_FILE,
        EtlJobType.SPLIT_PAGES,
        EtlJobType.GENERATE_MARKDOWNS,
        EtlJobType.MARKDOWN_TO_CHUNKS,
    ]);

    /**
     *
     * @param job
     * @param config
     */
    private async isExpiredJob(
        job: QueueJob<EtlJobData>,
        config: EtlConfig
    ): Promise<{ expired: boolean; message: string; data?: object }> {
        if (!job.payload!.correlationId) {
            return { expired: false, message: 'old-not-expires' };
        }
        // Let document-pipeline jobs run to completion even if a new sync changed correlationId
        if (EtlJobProcessor.DOCUMENT_PIPELINE_JOB_TYPES.has(job.jobType as EtlJobType)) {
            return { expired: false, message: 'document-pipeline-not-expired' };
        }
        if (config.correlationId !== job.payload.correlationId) {
            this.logger.warn(
                `Expired job because of correlationId difference. From config '${config.correlationId}' != from job '${job.payload.correlationId}'`
            );
            return {
                expired: true,
                message: `Job ignored due to correlationId expired. From config '${config.correlationId}' != from job '${job.payload.correlationId}'`,
            };
        }
        return { expired: false, message: 'not-expired' };
    }

    /**
     *
     * @param jobType
     * @param payload
     * @param options
     */
    private async queueNextJob<T extends EtlJobData>(
        jobType: EtlJobType,
        payload: T,
        options?: MongoQueueOptions
    ): Promise<string> {
        this.logger.verbose(
            ` > next ${jobType} :: ${JSON.stringify((payload?.payload as any)?.mongoFileId)}`
        );
        // If payload contains a projectId, try to read its configured order
        const { projectId } = payload;
        let resolvedOptions = options;
        if (projectId && options?.order === undefined) {
            try {
                const order = await this.etlConfigService.getProjectOrder(projectId);
                if (order !== null && order !== undefined) {
                    resolvedOptions = { ...(options || {}), order };
                }
            } catch (err) {
                this.logger.verbose('Could not resolve project order for enqueue', err);
            }
        }

        return this.queueService.queueJob(jobType, payload, resolvedOptions);
    }

    /**
     * This is from the new ETL process.
     *
     * This handler is responsible of:
     * download a file to cache (disk) based on information provided in payload( from sharepoint or similar)
     * create a record in the database stating this file is being processed.
     *
     * Notice this step auto-queues next step in the new ETL process.
     * @param {QueueJob<EtlNewProcessDownloadFileJobData>} job
     * @param etlConfig
     * @returns {Promise<IJobResult>}
     */
    private async handleDownloadFile(
        job: QueueJob<EtlDownloadFileJobData>,
        etlConfig: EtlConfigDocument
    ): Promise<IJobResult> {
        const { mongoFileId } = job.payload;

        try {
            this.logger.log(`[DOWNLOAD FILE]  MongoFile: ${mongoFileId} starting`);
            await this.etlService.downloadFileFromSource_StoreItInCache_CreateMongoFile(
                mongoFileId
            );

            await this.fileService.updateStatus(mongoFileId, 'downloaded');

            this.logger.log(`DOWNLOAD FILE]  MongoFile: ${mongoFileId} ended`);
            const nextJobId = await this.queueNextJob<EtlSplitFileIntoPagesJobData>(
                EtlJobType.SPLIT_PAGES,
                {
                    projectId: etlConfig.projectId,
                    correlationId: etlConfig.correlationId,
                    mongoFileId,
                }
            );

            return {
                success: true,
                data: {
                    message: successFileDownload,
                    jobId: job.id,
                    mongoFileId,
                    nextJobId,
                },
            };
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            if (mongoFileId) {
                await this.fileService.updateStatus(mongoFileId, 'download_failed', err.message);
            }
            throw err;
        }
    }

    /**
     * This is from the new ETL process.
     *
     * This handler is responsible of:
     * download a file to cache (disk) based on information provided in payload( from sharepoint or similar)
     * create a record in the database stating this file is being processed.
     *
     * Notice this step auto-queues next step in the new ETL process.
     * @param {QueueJob<EtlNewProcessDownloadFileJobData>} job
     * @param etlConfig
     * @returns {Promise<IJobResult>}
     */
    private async handleFullMarkdownProcess(
        job: QueueJob<EtlDownloadFileJobData>,
        etlConfig: EtlConfigDocument
    ): Promise<IJobResult> {
        const { mongoFileId } = job.payload;

        const retries = 5;
        const msDelay = 1000 * 60 * 5;
        const concurrency = 25;

        try {
            await this.etlService.downloadFileFromSource_StoreItInCache_CreateMongoFile(
                mongoFileId
            );

            this.logger.log(`[FULL MD PROCESS] - mongoFileId: ${mongoFileId} downloaded`);

            const pages = await this.etlService.splitFileIntoPagesFromMongoFileId(mongoFileId);

            let concurrencyProcessingPool: Promise<any>[] = [];

            const processPool = async () => {
                try {
                    if (concurrencyProcessingPool.length > 0) {
                        await Promise.all(concurrencyProcessingPool);
                    }
                } catch (error) {
                    concurrencyProcessingPool = [];

                    throw error;
                }
                concurrencyProcessingPool = [];
            };

            let processingCount = 0;

            // eslint-disable-next-line no-restricted-syntax
            for (const pageFile of pages) {
                const miniJob = async () => {
                    this.logger.log(`[FULL MD PROCESS] - page to process: ${pageFile}`);

                    const markdownFile = await retryAsync(
                        () =>
                            this.etlService.convertImageFileToMarkdownFromMongoFileId(
                                mongoFileId,
                                pageFile
                            ),
                        retries,
                        msDelay,
                        this.logger,
                        `[MARKDOWN PROCESS] - page: ${pageFile} - mongoFileId: ${mongoFileId}`
                    );
                    this.logger.log(`[FULL MD PROCESS] - markdown to process: ${markdownFile}`);

                    await retryAsync(
                        () =>
                            this.etlService.uploadMarkdownFileAndGetChunks(
                                mongoFileId,
                                markdownFile
                            ),
                        retries,
                        msDelay,
                        this.logger,
                        `[UPLOAD PROCESS] - page: ${pageFile} - mongoFileId: ${mongoFileId}`
                    );
                    this.logger.log(
                        `[FULL MD PROCESS] - markdown uploaded and chunked: ${markdownFile}`
                    );
                };
                concurrencyProcessingPool.push(miniJob());
                processingCount++;
                if (processingCount % concurrency === 0) {
                    await processPool();
                }
            }

            // drain any remaining jobs
            await processPool();

            this.logger.log(`[FULL MD PROCESS] - mongoFileId: ${mongoFileId} markdowns created`);

            await this.fileService.updateStatus(mongoFileId, markdownCreated);

            const nextJobId = await this.queueNextJob<EtlCreateEmbeddingsJobData>(
                EtlJobType.ETL_CREATE_EMBEDDINGS,
                {
                    projectId: etlConfig.projectId,
                    correlationId: etlConfig.correlationId,
                    mongoFileId,
                    configId: etlConfig.id.toString(),
                }
            );

            return {
                success: true,
                data: {
                    message: 'Markdowns created successfully',
                    jobId: job.id,
                    mongoFileId,
                    nextJobId,
                },
            };
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            if (mongoFileId) {
                await this.fileService.updateStatus(mongoFileId, 'download_failed', err.message);
            }
            throw err;
        }
    }

    /**
     * This is from the new ETL process.
     *
     * This handler is responsible of:
     * download a file to cache (disk) based on information provided in payload( from sharepoint or similar)
     * create a record in the database stating this file is being processed.
     *
     * Notice this step auto-queues next step in the new ETL process.
     * @param {QueueJob<EtlNewProcessDownloadFileJobData>} job
     * @param etlConfig
     * @returns {Promise<IJobResult>}
     */
    private async handleDownloadAndSplit(
        job: QueueJob<EtlDownloadFileJobData>,
        etlConfig: EtlConfigDocument
    ): Promise<IJobResult> {
        const { mongoFileId, correlationId, projectId } = job.payload;

        try {
            this.logger.debug(
                `[DOWNLOAD PROCESS] - ${etlConfig.correlationId} - mongoFileId: ${mongoFileId} starting`
            );
            await this.etlService.downloadFileFromSource_StoreItInCache_CreateMongoFile(
                mongoFileId
            );

            this.logger.verbose(
                `[DOWNLOAD PROCESS] - ${etlConfig.correlationId} - mongoFileId: ${mongoFileId} downloaded`
            );

            const pages = await this.etlService.splitFileIntoPagesFromMongoFileId(mongoFileId);
            this.logger.verbose(
                `[SPLIT PROCESS] - ${etlConfig.correlationId} - mongoFileId: ${mongoFileId} pages: ${pages.length}`
            );

            await this.fileService.updatePagesToProcess(mongoFileId, pages.length);

            // eslint-disable-next-line no-restricted-syntax
            for (const pageFile of pages) {
                const imageMarkdownData: ImageMarkdownData =
                    await this.etlService.getImageContentFromMongoFile(mongoFileId, pageFile);

                const nextJobId = await this.queueNextJob<EtlMarkdownBuilderJobData>(
                    EtlJobType.PDF_MARKDOWN_PROCESS,
                    {
                        projectId,
                        correlationId,
                        mongoFileId,
                        data: imageMarkdownData,
                    }
                );
                this.logger.debug(`Job for: ${nextJobId}`);
            }

            // await this.etlService.removeTemporaryEtlFolder(mongoFileId);

            await this.fileService.updateStatus(mongoFileId, 'processing');
            this.logger.debug(
                `[DOWNLOAD & SPLIT PROCESS] - ${etlConfig.correlationId} - mongoFileId: ${mongoFileId} completed`
            );
            return {
                success: true,
                data: {
                    message: 'Download & Split pages were successfully',
                    jobId: job.id,
                    mongoFileId,
                    nextJobId: 'many-jobs',
                },
            };
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.logger.error(`[DOWNLOAD & SPLIT PROCESS] - Error: ${err.message}`);
            if (mongoFileId) {
                await this.fileService.updateStatus(mongoFileId, 'download_failed', err.message);
            }
            throw err;
        }
    }

    /**
     * This is from the new ETL process.
     *
     * This handler is responsible of:
     * download a file to cache (disk) based on information provided in payload( from sharepoint or similar)
     * create a record in the database stating this file is being processed.
     *
     * Notice this step auto-queues next step in the new ETL process.
     * @param {QueueJob<EtlNewProcessDownloadFileJobData>} job
     * @param etlConfig
     * @returns {Promise<IJobResult>}
     */
    private async handleMarkdownBuilder(
        job: QueueJob<EtlMarkdownBuilderJobData>
    ): Promise<IJobResult> {
        const { mongoFileId, data, projectId, correlationId } = job.payload;
        try {
            /* Those const are used by the retrySync to execute the markdown generator */
            const retries = 5;
            const msDelay = 1000 * 60 * 5;

            const markdownContent = await retryAsync(
                () => this.etlService.getMarkdownFromContent(data),
                retries,
                msDelay,
                this.logger,
                `[MARKDOWN GENERATOR PROCESS] - page: ${data.sourceFile} - mongoFileId: ${mongoFileId}`
            );

            const markdownData: MarkdownUploadData = {
                sourceFile: data.sourceFile,
                pageNumber: data.pageNumber,
                content: markdownContent,
            };

            const featureIsActive = await this.featureFlagService.isActive(
                FeatureFlagEnum.USE_LOCAL_CHUNKING
            );

            const nextEtlJobType = featureIsActive
                ? EtlJobType.PDF_LOCAL_CHUNK_PROCESS
                : EtlJobType.PDF_UPLOAD_PROCESS;

            const nextJobId = await this.queueNextJob<EtlMarkdownBuilderJobData>(nextEtlJobType, {
                projectId,
                correlationId,
                mongoFileId,
                data: markdownData,
            });

            this.logger.debug(
                `[MARKDOWN GENERATOR PROCESS] - File: ${mongoFileId} - Job for: ${nextJobId}`
            );
            return {
                success: true,
                data: {
                    message: 'Markdown was  successfully',
                    jobId: job.id,
                    mongoFileId,
                    nextJobId,
                },
            };
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.logger.error(`[MARKDOWN GENERATOR PROCESS] - Error: ${err.message}`);
            if (mongoFileId) {
                await this.fileService.updateStatus(mongoFileId, 'failed', err.message);
            }
            throw err;
        }
    }

    /**
     * This is from the new ETL process.
     *
     * This handler is responsible of:
     * download a file to cache (disk) based on information provided in payload( from sharepoint or similar)
     * create a record in the database stating this file is being processed.
     *
     * Notice this step auto-queues next step in the new ETL process.
     * @param {QueueJob<EtlUploadMarkdownJobData>} job
     * @param etlConfig
     * @returns {Promise<IJobResult>}
     * @deprecated will be removed, no longer needed, ticket: https://dev.azure.com/mmctech/Mercer-PDE-Commercial-AI/_workitems/edit/2240260
     */
    private async handleUploadMarkdown(
        job: QueueJob<EtlUploadMarkdownJobData>
    ): Promise<IJobResult> {
        const { mongoFileId, data, projectId, correlationId } = job.payload;
        try {
            this.logger.debug(
                `[MARKDOWN UPLOAD PROCESS] Project: ${projectId} - CorrelationId: ${correlationId}`
            );

            /* Those const are used by the retrySync to execute the markdown generator */
            const retries = 5;
            const msDelay = 1000 * 60 * 5;

            const remoteFileId = await retryAsync(
                () => this.etlService.uploadMarkdown(data),
                retries,
                msDelay,
                this.logger,
                `[MARKDOWN UPLOAD PROCESS] - page: ${data.sourceFile} - mongoFileId: ${mongoFileId}`
            );

            const nextJobId = await this.queueNextJob<EtlNewChunkMarkdownJobData>(
                EtlJobType.PDF_CHUNK_PROCESS,
                {
                    projectId,
                    correlationId,
                    mongoFileId,
                    remoteId: remoteFileId,
                    data,
                },
                {
                    priority: QueuePriorityEnum.HIGHEST,
                }
            );
            this.logger.debug(
                `[MARKDOWN UPLOAD PROCESS] - Upload success with ${remoteFileId} remote id`
            );
            return {
                success: true,
                data: {
                    message: 'Upload was successfully',
                    jobId: job.id,
                    mongoFileId,
                    nextJobId,
                },
            };
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.logger.error(`[MARKDOWN UPLOAD PROCESS] - Error: ${err.message}`);
            if (mongoFileId) {
                await this.fileService.updateStatus(mongoFileId, 'failed', err.message);
            }
            throw err;
        }
    }

    /**
     * This is from the new ETL process.
     *
     * This handler is responsible of:
     * download a file to cache (disk) based on information provided in payload( from sharepoint or similar)
     * create a record in the database stating this file is being processed.
     *
     * Notice this step auto-queues next step in the new ETL process.
     * @param {QueueJob<EtlChunkMarkdownJobData>} job
     * @param etlConfig
     * @returns {Promise<IJobResult>}
     */
    private async handleChunkMarkdown(
        job: QueueJob<EtlNewChunkMarkdownJobData>,
        etlConfig: EtlConfigDocument
    ): Promise<IJobResult> {
        const { mongoFileId, projectId, correlationId, remoteId, data } = job.payload;
        try {
            this.logger.debug(
                `[CHUNK MARKDOWN PROCESS] Project: ${projectId} - CorrelationId: ${correlationId}`
            );
            /* Those const are used by the retrySync to execute the markdown generator */
            const retries = 5;
            const msDelay = 1000 * 60 * 5;

            await retryAsync(
                () => this.etlService.chunkMarkdown(mongoFileId, remoteId, data, etlConfig),
                retries,
                msDelay,
                this.logger,
                `[CHUNK MARKDOWN PROCESS] - page: ${data.sourceFile} - mongoFileId: ${mongoFileId}`
            );

            const fileDocument = await this.fileService.updateTotalPagesProcessed(mongoFileId);
            if (!fileDocument) {
                this.logger.error(
                    `[CHUNK MARKDOWN PROCESS] File not found after incrementing processed: ${mongoFileId}`
                );
                throw new Error(
                    `[CHUNK MARKDOWN PROCESS] File not found: ${mongoFileId}. Cannot determine if all pages are done.`
                );
            }

            const { pagesToProcess } = fileDocument;
            const total =
                typeof pagesToProcess?.total === 'number' ? pagesToProcess.total : undefined;
            const processed =
                typeof pagesToProcess?.processed === 'number'
                    ? pagesToProcess.processed
                    : undefined;

            this.logger.debug(
                `[CHUNK MARKDOWN PROCESS] - Pages: processed: ${processed} / total: ${total}`
            );

            this.logger.debug(
                `[CHUNK MARKDOWN PROCESS] - Chunking success with ${remoteId} remoteId`
            );

            let nextJobId = 'no-job';
            if (total === processed) {
                await this.fileService.updateStatus(mongoFileId, 'chunked');
                this.logger.log(
                    `[CHUNK MARKDOWN PROCESS] - Markdown proces for file: ${mongoFileId} is completed`
                );
                nextJobId = await this.queueNextJob<EtlCreateEmbeddingsJobData>(
                    EtlJobType.ETL_CREATE_EMBEDDINGS,
                    {
                        projectId: etlConfig.projectId,
                        correlationId: etlConfig.correlationId,
                        mongoFileId,
                        configId: etlConfig.id.toString(),
                    }
                );
            }
            return {
                success: true,
                data: {
                    message: 'Chunking was successfully',
                    jobId: job.id,
                    mongoFileId,
                    nextJobId,
                },
            };
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            if (mongoFileId) {
                await this.fileService.updateStatus(mongoFileId, 'failed', err.message);
            }
            throw err;
        }
    }

    /**
     * This is from the new ETL process.
     *
     * This handler is responsible of:
     * download a file to cache (disk) based on information provided in payload( from sharepoint or similar)
     * create a record in the database stating this file is being processed.
     *
     * Notice this step auto-queues next step in the new ETL process.
     * @param {QueueJob<EtlChunkMarkdownJobData>} job
     * @param etlConfig
     * @returns {Promise<IJobResult>}
     */
    private async handleLocalMarkdownChunks(
        job: QueueJob<EtlNewChunkMarkdownJobData>,
        etlConfig: EtlConfigDocument
    ): Promise<IJobResult> {
        const { mongoFileId, projectId, correlationId, data } = job.payload;
        try {
            this.logger.log(
                `[CHUNK MARKDOWN PROCESS] Project: ${projectId} - CorrelationId: ${correlationId}`
            );
            /* Those const are used by the retrySync to execute the markdown generator */
            const retries = 5;
            const msDelay = 1000 * 60 * 5;

            await retryAsync(
                () => this.etlService.chunkMarkdownLocally(mongoFileId, data, etlConfig),
                retries,
                msDelay,
                this.logger,
                `[CHUNK MARKDOWN PROCESS] - page: ${data.sourceFile} - mongoFileId: ${mongoFileId}`
            );

            const fileDocument = await this.fileService.updateTotalPagesProcessed(mongoFileId);
            const { total, processed } = fileDocument.pagesToProcess;

            this.logger.log(
                `[CHUNK MARKDOWN PROCESS] - Pages: processed: ${processed} / total: ${total}`
            );

            let nextJobId = 'no-job';
            // Only queue embeddings when we have valid counts and all pages are done (avoid undefined === undefined)
            if (
                typeof total === 'number' &&
                typeof processed === 'number' &&
                total > 0 &&
                total === processed
            ) {
                await this.fileService.updateStatus(mongoFileId, 'chunked');
                this.logger.debug(
                    `[CHUNK MARKDOWN PROCESS] - Markdown process for file: ${mongoFileId} is completed, queuing ETL_CREATE_EMBEDDINGS`
                );
                nextJobId = await this.queueNextJob<EtlCreateEmbeddingsJobData>(
                    EtlJobType.ETL_CREATE_EMBEDDINGS,
                    {
                        projectId: etlConfig.projectId,
                        correlationId: etlConfig.correlationId,
                        mongoFileId,
                        configId: etlConfig.id.toString(),
                    }
                );
            } else if (total === undefined || processed === undefined) {
                this.logger.warn(
                    `[CHUNK MARKDOWN PROCESS] - File ${mongoFileId} has no/invalid pagesToProcess (total=${total}, processed=${processed}); not queueing embeddings yet`
                );
            }
            return {
                success: true,
                data: {
                    message: 'Chunking was successfully',
                    jobId: job.id,
                    mongoFileId,
                    nextJobId,
                },
            };
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.logger.error(`[CHUNK MARKDOWN PROCESS] - Error: ${err.message}`);
            if (mongoFileId) {
                await this.fileService.updateStatus(mongoFileId, 'failed', err.message);
            }
            throw err;
        }
    }

    /**
     * This is from the new ETL process.
     *
     * This handler os responsible of:
     * analyze a file and determine if should be split into pages (pdf) or chunked directly
     *
     * Notice this step auto-queues next step in the new ETL process.
     * @param {QueueJob<EtlNewProcessAnalyzeFileJobData>} job
     * @param etlConfig
     * @returns {Promise<IJobResult>}
     */
    private async handleAnalyzeFile(
        job: QueueJob<EtlAnalyzeFileJobData>,
        etlConfig: EtlConfigDocument
    ): Promise<IJobResult> {
        const { fileName, fileSource, fileLink, fileOriginId, fileMimeType, configId, projectId } =
            job.payload;

        let mongoFileId: string | null = null;

        try {
            this.logger.debug(
                `[ANALYZE FILE] - Analyzing ${fileName} - FileOriginId: ${fileOriginId}`
            );
            const analyzeResponse: EtlAnalyzeResponse =
                await this.etlService.analyzeFile_ReturnNextStep(
                    fileName,
                    fileSource,
                    fileLink,
                    fileOriginId,
                    fileMimeType,
                    configId,
                    projectId
                );

            mongoFileId = analyzeResponse.mongoFileId;

            this.logger.verbose(`[ANALYZE FILE] - Response: ${analyzeResponse.mongoFileId}`);

            await this.fileService.updateStatus(analyzeResponse.mongoFileId, 'analyzed');
            this.logger.verbose('[ANALYZE FILE] - Status updated');
            let nextJobId;
            switch (analyzeResponse.nextStep) {
                case EtlAnalyzeNextStep.DOWNLOAD: {
                    this.logger.debug('[DOWNLOAD] process');
                    nextJobId = await this.queueNextJob<EtlDownloadFileJobData>(
                        EtlJobType.PDF_DOWNLOAD_AND_SPLIT,
                        {
                            projectId: etlConfig.projectId,
                            correlationId: etlConfig.correlationId,
                            mongoFileId: analyzeResponse.mongoFileId,
                        },
                        {
                            priority: QueuePriorityEnum.MEDIUM,
                        }
                    );
                    break;
                }
                case EtlAnalyzeNextStep.CHUNK: {
                    this.logger.debug('[CHUNK DOC] generation process');
                    const mongoFile = await this.fileService.findById(analyzeResponse.mongoFileId);

                    nextJobId = await this.queueNextJob<EtlIterateCreateChunksJobData>(
                        EtlJobType.ETL_UPLOAD_FILE,
                        {
                            projectId: etlConfig.projectId,
                            correlationId: etlConfig.correlationId,
                            mongoFileId: analyzeResponse.mongoFileId,
                            iterationQueue: [mongoFile.storageFilename],
                            processed: [],
                        }
                    );
                    break;
                }
                case EtlAnalyzeNextStep.SKIP:
                default: {
                    this.logger.debug(
                        `[ANALYZE FILE] Unsupported file type, skipped processing. File: ${fileName}, MimeType: ${fileMimeType}, OriginId: ${fileOriginId}`
                    );
                    return {
                        success: true,
                        data: {
                            message: 'File type not supported, skipped',
                            jobId: job.id,
                            fileName,
                            fileOriginId,
                            fileMimeType,
                        },
                    };
                }
            }

            return {
                success: true,
                data: {
                    message: 'File analyzed successfully',
                    jobId: job.id,
                    mongoFileId: analyzeResponse.mongoFileId,
                    nextJobId,
                },
            };
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.logger.error(`[ANALYZE FILE] - Error: ${err.message}`);

            if (mongoFileId) {
                await this.fileService.updateStatus(mongoFileId, 'analyzed', err.message);
            }
            throw err;
        }
    }

    /**
     * This is from the new ETL process.
     *
     * This handler os responsible of:
     * take the file, split it into pages and optimize each page
     *
     * Notice this step auto-queues next step in the new ETL process.
     * @param {QueueJob<EtlNewProcessSplitFileIntoPagesJobData>} job
     * @param etlConfig
     * @returns {Promise<IJobResult>}
     */
    private async handleSplitFileIntoPages(
        job: QueueJob<EtlSplitFileIntoPagesJobData>,
        etlConfig: EtlConfigDocument
    ): Promise<IJobResult> {
        const { mongoFileId } = job.payload;

        try {
            const pages = await this.etlService.splitFileIntoPagesFromMongoFileId(mongoFileId);

            await this.fileService.updateStatus(mongoFileId, 'split');

            const nextJobId = await this.queueNextJob<EtlGenerateMarkdownsFromPagesJobData>(
                EtlJobType.GENERATE_MARKDOWNS,
                {
                    projectId: etlConfig.projectId,
                    correlationId: etlConfig.correlationId,
                    mongoFileId,
                    iterationQueue: pages,
                    processed: [],
                }
            );

            return {
                success: true,
                data: {
                    message: successFileDownload,
                    jobId: job.id,
                    mongoFileId,
                    nextJobId,
                },
            };
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            if (mongoFileId) {
                await this.fileService.updateStatus(mongoFileId, 'split', err.message);
            }
            throw err;
        }
    }

    /**
     * This is from the new ETL process.
     *
     * This handler os responsible of:
     * Convert pages to markdown
     *
     * Notice this step processes one page and queue himself to process the rest.
     * Notice this step auto-queues next step in the new ETL process.
     * @param {QueueJob<EtlNewProcessGenerateMarkdownsFromPagesJobData>} job
     * @param etlConfig
     * @returns {Promise<IJobResult>}
     */
    private async handleGenerateMarkdownsFromPages(
        job: QueueJob<EtlGenerateMarkdownsFromPagesJobData>,
        etlConfig: EtlConfigDocument
    ): Promise<IJobResult> {
        const { mongoFileId, iterationQueue, processed: createdMarkdowns } = job.payload;

        try {
            const pageFile = iterationQueue.shift();

            const markdown = await this.etlService.convertImageFileToMarkdownFromMongoFileId(
                mongoFileId,
                pageFile
            );
            createdMarkdowns.push(markdown);

            let nextJobId;
            if (iterationQueue.length > 0) {
                await this.fileService.updateStatus(mongoFileId, 'markdown-creating');
                nextJobId = await this.queueNextJob<EtlGenerateMarkdownsFromPagesJobData>(
                    EtlJobType.GENERATE_MARKDOWNS,
                    {
                        projectId: etlConfig.projectId,
                        correlationId: etlConfig.correlationId,
                        mongoFileId,
                        iterationQueue,
                        processed: createdMarkdowns,
                    }
                );
            } else {
                await this.fileService.updateStatus(mongoFileId, markdownCreated);
                nextJobId = await this.queueNextJob<EtlIterateCreateChunksJobData>(
                    EtlJobType.MARKDOWN_TO_CHUNKS,
                    {
                        projectId: etlConfig.projectId,
                        correlationId: etlConfig.correlationId,
                        mongoFileId,
                        iterationQueue: createdMarkdowns,
                        processed: [],
                    }
                );
            }

            return {
                success: true,
                data: {
                    message: successFileDownload,
                    jobId: job.id,
                    mongoFileId,
                    nextJobId,
                },
            };
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            if (mongoFileId) {
                await this.fileService.updateStatus(mongoFileId, markdownCreated, err.message);
            }
            throw err;
        }
    }

    /**
     *
     * @param job
     * @param etlConfig
     */
    private async handleMarkdownToChunks(
        job: QueueJob<EtlIterateCreateChunksJobData>,
        etlConfig: EtlConfigDocument
    ): Promise<IJobResult> {
        const { mongoFileId, iterationQueue, processed: createdChunks } = job.payload;

        try {
            const markdownFile = iterationQueue.shift();

            await this.etlService.uploadMarkdownFileAndGetChunks(mongoFileId, markdownFile);
            createdChunks.push(markdownFile);

            let nextJobId;
            if (iterationQueue.length > 0) {
                await this.fileService.updateStatus(mongoFileId, 'markdown-creating');
                nextJobId = await this.queueNextJob<EtlIterateCreateChunksJobData>(
                    EtlJobType.MARKDOWN_TO_CHUNKS,
                    {
                        projectId: etlConfig.projectId,
                        correlationId: etlConfig.correlationId,
                        mongoFileId,
                        iterationQueue,
                        processed: createdChunks,
                    }
                );
            } else {
                await this.fileService.updateStatus(mongoFileId, markdownCreated);

                nextJobId = await this.queueNextJob<EtlCreateEmbeddingsJobData>(
                    EtlJobType.ETL_CREATE_EMBEDDINGS,
                    {
                        projectId: etlConfig.projectId,
                        correlationId: etlConfig.correlationId,
                        mongoFileId,
                        configId: etlConfig.id.toString(),
                    }
                );
            }

            return {
                success: true,
                data: {
                    message: successFileDownload,
                    jobId: job.id,
                    mongoFileId,
                    nextJobId,
                },
            };
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            if (mongoFileId) {
                await this.fileService.updateStatus(mongoFileId, markdownCreated, err.message);
            }
            throw err;
        }
    }

    /**
     *
     * @param job
     */
    private async handleDeltaSyncForAllActiveProjects(
        job: QueueJob<EtlDeltaSyncForAllActiveProjectsJobData>
    ): Promise<IJobResult> {
        const response = await this.semaphoreService.acquire(
            'DELTA_SYNC',
            'DELTA_SYNC',
            job.payload.ownerId,
            false
        );
        try {
            if (response.acquired) {
                const activeConfigs = await this.etlService.deltaSyncForAllActiveProjects();

                this.logger.debug(
                    `[DELTA ALL PROJECT] - Found ${activeConfigs.length} active SharePoint projects.`
                );

                const queuePromises = activeConfigs.map(async (config) => {
                    const deltaConfig: DeltaSyncProjectType = {
                        id: config.id,
                        projectId: config.projectId,
                        projectName: config.projectName,
                        dataScope: config.dataScope,
                        // Delta sync is only registered for active SharePoint projects; keep type narrow here.
                        spConfig: config.dataSource.config as any,
                    };

                    return this.queueNextJob<EtlDeltaSyncProjectJobData>(
                        EtlJobType.SHAREPOINT_DELTA_SYNC_PROJECT,
                        {
                            projectId: config.projectId,
                            correlationId: config.correlationId,
                            config: deltaConfig,
                        }
                    );
                });

                await Promise.all(queuePromises);

                return {
                    success: true,
                    data: {
                        message: 'Delta sync for all project enqueued',
                        jobId: job.id,
                    },
                };
            }
            return {
                success: true,
                data: {
                    message: 'Delta sync not executed by could not acquire the semaphore',
                    jobId: job.id,
                },
            };
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.logger.error(`[SHAREPOINT DELTA SYNC] error: ${err.message}`);
            throw err;
        } finally {
            await this.semaphoreService.release(
                'DELTA_SYNC',
                'DELTA_SYNC',
                job.payload.ownerId,
                response.token
            );
            this.logger.debug(
                `[DELTA SYNC ALL PROJECT] ownerId: ${job.payload.ownerId} - token: ${response.token}`
            );
            this.logger.debug(`[DELTA SYNC ALL PROJECT] finished: ${job.payload.testName}`);
        }
    }

    /**
     *
     * @param job
     */
    private async handleDeltaSyncProject(
        job: QueueJob<EtlDeltaSyncProjectJobData>
    ): Promise<IJobResult> {
        const { config } = job.payload;
        await this.etlService.deltaSyncProject(config);

        return {
            success: true,
            data: {
                message: 'Delta sync project completed',
                jobId: job.id,
            },
        };
    }
}
