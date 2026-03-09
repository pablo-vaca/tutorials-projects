/* eslint-disable max-lines */
import * as fs from 'fs';
import * as path from 'path';


import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { lookup } from 'mime-types';
import { Types } from 'mongoose';

import { GenericQueueService } from '@deal-insights/shared-nestjs-utils';

import FileService from './file.service';
import { isSupportedMimeType } from '../../shared/constants/shared.const';
import { EtlException, ProcessingException } from '../exceptions';
import ChunkMongoService from './chunk-mongo.service';
import { DocumentClassifierService } from './document-classification.service';
import DocumentProcessingClient from './document-processing-client';
import { FeatureFlagService } from '../../feature-flag/feature-flag.service';
import {
    DataSourceType,
    EtlConfigDocument,
    FileDocument,
    LocalConfig,
    SharePointConfig,
} from '../schemas';
import ChunkProcessorService from './etl-chunks.service';
import EtlConfigService from './etl-config.service';
import EtlImageMarkdownService, {
    ImageMarkdownData,
    MarkdownUploadData,
} from './etl-image-markdown.service';
import EtlSharedService, { EtlAnalyzeNextStep, EtlAnalyzeResponse } from './etl-shared.service';
import PdfImagesService from './pdf-images.service';
import SharepointSyncOrchestrator from './sharepoint-sync-orchestrator.service';
import SharepointService, { SharePointFile } from './sharepoint.service';
import VectorService from './vector.service';
import AuthApiService from '../../auth/auth-api.service';
import { FeatureFlagEnum } from '../../feature-flag/enums/feature-flag.enum';
import { DeltaSyncProjectType, EtlJobType } from '../jobs/etl-job.types';
import { FileProcessingStrategy } from '../types/config-strategy.types';

/**
 * Configuration for embedding service interactions
 */
export interface EmbeddingConfig {
    deploymentId: string;
    user: string;
    model: string;
    accessToken: string;
}

/**
 * Configuration for chunk processing
 */
export interface ChunkProcessingConfig {
    chunkSize: number;
    overlap: number;
    projectId: string;
    dataScope: string;
    accessToken: string;
}

// etl flow orchestrator
@Injectable()
export default class EtlService {
    private readonly logger = new Logger(EtlService.name);

    /**
     *
     * @param {FileService} fileService
     * @param {ChunkProcessorService} etlChunkService
     * @param {EtlConfigService} etlConfigService
     * @param {SharepointService} sharepointService
     * @param {DocumentProcessingClient} documentProcessingService
     * @param {ChunkMongoService} chunkMongoService
     * @param {VectorService} vectorService
     * @param {PdfImagesService} pdfImageService
     * @param {EtlImageMarkdownService} etlImageMarkdownService
     * @param {SharepointSyncOrchestrator} sharepointSyncOrchestrator
     * @param {AuthApiService} authApiService
     * @param {EtlSharedService} etlSharedService
     * @param {GenericQueueService} queueService
     * @param classifierService
     * @param config
     * @param {FeatureFlagService} featureFlagService
     * @param {Logger} logger
     */
    constructor(
        private readonly fileService: FileService,
        private readonly etlChunkService: ChunkProcessorService,
        private readonly etlConfigService: EtlConfigService,
        private readonly sharepointService: SharepointService,
        private readonly documentProcessingService: DocumentProcessingClient,
        private readonly chunkMongoService: ChunkMongoService,
        private readonly vectorService: VectorService,
        private readonly pdfImageService: PdfImagesService,
        private readonly etlImageMarkdownService: EtlImageMarkdownService,
        private readonly sharepointSyncOrchestrator: SharepointSyncOrchestrator,
        private readonly authApiService: AuthApiService,
        private readonly etlSharedService: EtlSharedService,
        private readonly queueService: GenericQueueService,
        private readonly classifierService: DocumentClassifierService,
        private readonly config: ConfigService,
        private readonly featureFlagService: FeatureFlagService,) {}

    /**
     *
     * @param params
     * @param params.buffer
     * @param params.fileName
     * @param params.fileOriginId
     * @param params.mimeType
     * @param params.accessToken
     * @param params.userId
     * @param params.mongoFileId
     */
    async uploadFileFromBuffer(params: {
        mongoFileId: string;
        buffer: Buffer;
        fileName: string;
        mimeType: string;
    }): Promise<string> {
        const { mongoFileId, buffer, fileName, mimeType } = params;

        return this.documentProcessingService.uploadFile(mongoFileId, buffer, fileName, mimeType);
    }

    /**
     * Move embeddings from MongoDB chunks to the vector store
     * This function has a feature flag to enable a document classification step before moving the embeddings.
     * If the feature is enabled, it will classify the document and tag the file with the classification result.
     * The classification configuration can be set via environment variables.
     * feature flag: STRUCTURED_CLASSIFIER_DATA_FEATURE
     * @param file - The file document with all metadata
     */
    async moveEmbeddingsToVectorstore(file: FileDocument) {
        const featureIsActive = await this.featureFlagService.isActive(
            FeatureFlagEnum.STRUCTURED_CLASSIFIER_DATA_FEATURE
        );
        if (featureIsActive) {
            const classificationConfig = {
                headChunks: parseInt(
                    this.config.get<string>('CLASSIFICATION_CONFIG_HEAD_CHUNKS', '5'),
                    10
                ),
                middleChunks: parseInt(
                    this.config.get<string>('CLASSIFICATION_CONFIG_MIDDLE_CHUNKS', '3'),
                    10
                ),
                tailChunks: parseInt(
                    this.config.get<string>('CLASSIFICATION_CONFIG_TAIL_CHUNKS', '2'),
                    10
                ),
                confidenceThreshold: parseFloat(
                    this.config.get<string>('CLASSIFICATION_CONFIG_CONFIDENCE_THRESHOLD', '0.85')
                ),
                useLangChain:
                    this.config.get<string>('CLASSIFICATION_CONFIG_USE_LANGCHAIN', 'false') ===
                    'true',
            };
            this.logger.debug(`Config: ${JSON.stringify(classificationConfig)}`);
            await this.classifierService.classifyAndTagFile(file.id, classificationConfig);
        }
        const chunks = await this.chunkMongoService.findByFileId(file.id);

        // Prepare vector documents
        const vectors = chunks.map((chunk) => ({
            fileId: new Types.ObjectId(file.id),
            name: file.fileName,
            page_content: chunk.content,
            page_embeddings: chunk.embedding,
            projectId: chunk.metadata?.projectId,
            chunk_size: chunk.metadata?.chunkSize || -1, // From params
            chunk_overlap: chunk.metadata?.overlap || -1, // From params

            // Add other fields as needed, perhaps from file metadata
            // clientId, folder_id, etc. - need to be populated from file or config
            mimeType: file.mimeType,
            createdAt: new Date(),
            updatedAt: new Date(),
            document_meta: chunk.metadata || {},
        }));

        // Insert into vectorstore
        const insertedVectors = await this.vectorService.insertVectors(vectors);
        this.logger.debug(`Inserted ${insertedVectors.length} new vectors`);
        return insertedVectors.map((d) => d._id.toString());
    }

    /**
     * Handles an "upsert" from a delta change.
     * It first deletes any existing data for this file, then processes it as new.
     * @param change - The SharePoint file object from the delta query
     * @param change
     * @param driveId - The SharePoint drive ID
     * @param config - The ETL configuration
     * @param coreApiToken - The access token
     * @deprecated use handleSharePointDeltaUpsert instead
     */
    async upsertFileFromDelta(change: SharePointFile, driveId: string): Promise<void> {
        const fileOriginId = change.id;
        this.logger.debug(
            `[UPSERT] Processing file: ${change.name} (ID: ${fileOriginId}) @ ${driveId}`
        );

        try {
            const existingFile = await this.fileService.findByFileOriginId(fileOriginId);

            if (existingFile) {
                this.logger.debug(` > Deleting existing data for file: ${existingFile.id}`);

                await this.chunkMongoService.deleteMany({
                    fileId: new Types.ObjectId(existingFile.id),
                });

                await this.vectorService.deleteByFileId(existingFile.id);

                await this.fileService.deleteById(existingFile.id);
            }

            // TODO: Start chained queue proces

            this.logger.debug(`[UPSERT] Successfully processed file: ${change.name}`);
        } catch (error) {
            this.logger.error(`[UPSERT] Failed to process file ${change.name}: ${error.message}`);
            // Throw error so Promise.allSettled in orchestrator can catch it
            throw error;
        }
    }

    /**
     *
     * @param fileOriginId
     */
    async deleteFileByOriginId(fileOriginId: string): Promise<void> {
        this.logger.debug(`[DELETE] Processing deletion for origin ID: ${fileOriginId}`);

        const file = await this.fileService.findByFileOriginId(fileOriginId);

        if (!file) {
            this.logger.warn(
                `[DELETE] File with origin ID ${fileOriginId} not found. Already deleted.`
            );
            return;
        }

        await this.deleteFileById(file.id);

        this.logger.debug(
            `[DELETE] Successfully processed deletion for origin ID: ${fileOriginId}`
        );
    }

    /**
     *
     * @param mongoFileId
     */
    async deleteFileById(mongoFileId: string): Promise<void> {
        this.logger.debug(`[DELETE] Processing deletion for file: ${mongoFileId}`);

        try {
            // 1. Delete all associated chunks from Mongo
            const { deletedCount: chunkCount } = await this.chunkMongoService.deleteMany({
                fileId: new Types.ObjectId(mongoFileId),
            });
            this.logger.debug(` > Deleted ${chunkCount} chunks.`);

            // 2. Delete all associated vectors
            const { deletedCount: vectorCount } =
                await this.vectorService.deleteByFileId(mongoFileId);
            this.logger.debug(` > Deleted ${vectorCount} vectors.`);

            // 3. Delete the file record itself from Mongo
            await this.fileService.deleteById(mongoFileId);
            this.logger.debug(` > Deleted file record: ${mongoFileId}`);

            this.logger.debug(
                `[DELETE] Successfully processed deletion for File ID: ${mongoFileId}`
            );
        } catch (error) {
            this.logger.error(`[DELETE] Failed to delete file ${mongoFileId}: ${error.message}`);
            throw error;
        }
    }

    /**
     *
     * @param projectId
     * @param projectName
     * @param sharepointUrl
     * @param dataScope
     * @param dataSourceType
     * @param sharepointTennantId
     * @param fileExtensions
     */
    async createEtlProcessForProject(
        projectId: string,
        projectName: string,
        sharepointUrl: string,
        dataScope: string,
        dataSourceType?: string
    ): Promise<string> {
        let config = await this.etlConfigService.findByProjectId(projectId);
        let ret;

        if (!config) {
            const driveItem = await this.sharepointService.getDriveItemFromUrl(sharepointUrl);
            const folderId = driveItem.id;
            const { driveId } = driveItem.parentReference;

            const sharepointTenantId = process.env.AZURE_TENANT_ID;
            const spUrl = sharepointUrl || process.env.SHAREPOINT_URL;

            config = this.etlConfigService.getDefaultConfig({
                projectId,
                projectName,
                dataScope,
                sharepointUrl: spUrl,
                sharepointTenant: sharepointTenantId,
                sharepointFolder: folderId,
                dataSource: {
                    // TODO: type needs to be handle by request
                    type: dataSourceType || DataSourceType.SharePoint,
                    config: {
                        url: spUrl,
                        tenantId: sharepointTenantId,
                        driveId,
                        folderId,
                    } as SharePointConfig,
                },
            });

            const newConfig = await this.etlConfigService.create(config);

            if (!newConfig.id) {
                throw new EtlException(
                    `Config for project ${projectName} [${projectId}] not created`
                );
            }

            if (newConfig.dataSource.type !== DataSourceType.SharePoint) {
                throw new ProcessingException(
                    ` > DataSource type ${newConfig.dataSource.type} not supported`
                );
            }

            if (newConfig.dataSource.type === DataSourceType.SharePoint) {
                ret = {
                    message: 'SharePoint Sync scheduled',
                };
            } else {
                throw new ProcessingException(
                    'Sync logic for non-SharePoint sources not implemented'
                );
            }
        } else {
            await this.sharepointService.initialize(config);
            ret = { message: 'no reprocess' };
        }

        return ret;
    }

    /**
     *
     * @param {string} configId
     * @param {string} projectId
     * @param {string} includeDeleted - Allow use of deleted config (useful for clear data jobs)
     * @returns {Promise<EtlConfigDocument>}
     */
    async ensureEtlConfig(
        configId?: string,
        projectId?: string,
        includeDeleted = false
    ): Promise<EtlConfigDocument> {
        if (configId) {
            const configById = await this.etlConfigService.findById(configId);
            if (configById) {
                return configById;
            }
            this.logger.warn(
                `[CONFIG] No ETL configuration found for id ${configId}; attempting project lookup`
            );
        }

        if (projectId) {
            const configByProject = await this.etlConfigService.findByProjectId(
                projectId,
                includeDeleted
            );
            if (configByProject) {
                return configByProject;
            }
            this.logger.warn(`[CONFIG] No ETL configuration found for project ${projectId}`);
        }

        throw new Error(
            `ETL configuration not found (configId=${configId ?? 'n/a'}, projectId=${
                projectId ?? 'n/a'
            })`
        );
    }

    /**
     *
     * @param mongoFileId
     * @returns {Promise<string>}
     */
    async downloadFileFromSource_StoreItInCache_CreateMongoFile(
        mongoFileId: string
    ): Promise<string> {
        const mongoFile = await this.fileService.findById(mongoFileId);

        if (!mongoFile) {
            throw new Error(`ETL mongo file not found (mongoFileId=${mongoFileId ?? 'n/a'}`);
        }

        const etlConfig = await this.ensureEtlConfig(mongoFile.configId);

        // the getFileBuffer_TEMP function should be renamed
        const fileBuffer = await this.getFileBuffer(etlConfig, mongoFile.fileOriginId);
        this.logger.debug(`[DOWNLOAD] file: ${mongoFileId}`);
        const fileSize = fileBuffer.length;
        this.logger.debug(`[DOWNLOAD] file length: ${fileSize}`);

        // create entry in cache
        const storedFilename = await this.pdfImageService.storeFile(
            mongoFile.fileName,
            mongoFileId,
            fileBuffer
        );

        // update mongo with cache info
        await this.fileService.updateStorageFilename(mongoFileId, storedFilename, fileSize);

        return storedFilename;
    }

    /**
     *
     * @param {string} fileName
     * @param {string} fileSource
     * @param fileLink
     * @param {string} fileOriginId
     * @param {string} fileMimeType
     * @param {string} configId
     * @param {string} projectId
     * @returns {EtlAnalyzeNextStep}
     */
    async analyzeFile_ReturnNextStep(
        fileName: string,
        fileSource: string,
        fileLink: string,
        fileOriginId: string,
        fileMimeType: string,
        configId: string,
        projectId: string
    ): Promise<EtlAnalyzeResponse> {
        const etlConfig = await this.ensureEtlConfig(configId, projectId);
        const resolvedConfigId = this.getConfigId(etlConfig);
        const resolvedProjectId = etlConfig.projectId;

        this.logger.debug(
            `[ANALYZE FILE] Etl config: ${resolvedConfigId} - projectId: ${resolvedProjectId}`
        );

        let nextStep = EtlAnalyzeNextStep.CHUNK;

        if (!isSupportedMimeType(fileMimeType)) {
            this.logger.debug(
                `[ANALYZE FILE] Unsupported MIME type detected: ${fileMimeType} for file: ${fileName}. Will skip processing.`
            );
            nextStep = EtlAnalyzeNextStep.SKIP;
        }

        const sourceData = { title: fileName, link: fileLink };
        // Find existing file: by (fileOriginId, projectId) or by remoteId (same value at create)
        // so we avoid duplicate key on remoteId / (remoteId, projectId) when reprocessing
        const existingFile = await this.fileService.findByFileOriginIdAndProjectId(
            fileOriginId,
            resolvedProjectId
        );

        let fileDocument: FileDocument;
        let mongoFileId: string;

        if (existingFile) {
            if (existingFile.processingStatus === 'completed') {
                this.logger.debug(
                    `[ANALYZE FILE] File already completed (${fileOriginId}), skipping reprocess`
                );
                return {
                    mongoFileId: existingFile.id,
                    nextStep: EtlAnalyzeNextStep.SKIP,
                };
            }
            await this.fileService.updateFileForAnalyze(existingFile.id, {
                fileName,
                fileOriginId,
                remoteId: fileOriginId,
                fileSource,
                sourceData,
                mimeType: fileMimeType,
            });
            const updated = await this.fileService.findById(existingFile.id);
            if (!updated) {
                throw new EtlException(
                    `[ANALYZE FILE] File not found after upsert: ${existingFile.id}`
                );
            }
            fileDocument = updated;
            mongoFileId = existingFile.id;
            this.logger.debug(`[ANALYZE FILE] Reprocess upsert mongoFileId: ${mongoFileId}`);
        } else {
            fileDocument = await this.fileService.createFile({
                fileName,
                fileOriginId,
                remoteId: fileOriginId,
                fileSource,
                sourceData,
                mimeType: fileMimeType,
                userId: 'sharepoint-sync',
                projectId: resolvedProjectId,
                configId: resolvedConfigId,
                processingStatus: 'created',
                history: [{ action: 'created', timestamp: new Date() }],
            });
            mongoFileId = fileDocument.id;
            this.logger.debug(`[ANALYZE FILE] mongoFileId: ${mongoFileId}`);
        }

        if (fileMimeType === 'application/pdf') {
            nextStep = EtlAnalyzeNextStep.DOWNLOAD;
            fileDocument.processingStrategy = FileProcessingStrategy.PBP_SPLIT_FILE;
            await fileDocument.save();
        }

        return { mongoFileId, nextStep };
    }

    /**
     *
     * @param {string} mongoFileId
     * @returns {Promise<string[]>}
     */
    async splitFileIntoPagesFromMongoFileId(mongoFileId: string): Promise<string[]> {
        const mongoFile = await this.fileService.findById(mongoFileId);

        return this.pdfImageService.splitFileIntoPagesFromFileDocument(mongoFile);
    }

    /**
     *
     * @param {EtlConfigDocument} config
     * @returns {string}
     */
    getConfigId(config: EtlConfigDocument): string {
        return config.id ?? config._id.toString();
    }

    /**
     *
     * @param {string} mongoFileId
     * @param {string} pageFile
     */
    async convertImageFileToMarkdownFromMongoFileId(
        mongoFileId: string,
        pageFile: string
    ): Promise<string> {
        try {
            this.logger.log(`[MARKDOWN CONVERT] - ${mongoFileId} ------- START -----`);
            const mongoFile = await this.fileService.findById(mongoFileId);

            return await this.etlImageMarkdownService.convertImageFileToMarkdownFromFileDocument(
                mongoFile,
                pageFile
            );
        } catch (error) {
            this.logger.log(`[MARKDOWN CREATOR ERROR] - ${error}`);
            throw error;
        } finally {
            this.logger.log(`[MARKDOWN CONVERT] - ${mongoFileId} ------- END -----`);
        }
    }

    /**
     *
     * @param {string} mongoFileId
     * @param {string} pageFile
     */
    async getImageContentFromMongoFile(
        mongoFileId: string,
        pageFile: string
    ): Promise<ImageMarkdownData> {
        try {
            this.logger.debug(`[GET IMAGE CONTENT] - ${mongoFileId} ------- START -----`);
            const mongoFile = await this.fileService.findById(mongoFileId);

            return await this.etlImageMarkdownService.getImageToConvertData(mongoFile, pageFile);
        } catch (error) {
            this.logger.error(`[GET IMAGE CONTENT ERROR] - ${error}`);
            throw error;
        } finally {
            this.logger.debug(`[GET IMAGE CONTENT] - ${mongoFileId} ------- END -----`);
        }
    }

    /**
     *
     * @param {string} mongoFileId
     * @param {string} pageFile
     * @param data
     */
    async getMarkdownFromContent(data: ImageMarkdownData): Promise<string> {
        try {
            this.logger.debug(`[MARKDOWN FROM CONTENT] - ${data.sourceFile} ------- START -----`);

            return await this.etlImageMarkdownService.convertImageContentToMarkdown(data);
        } catch (error) {
            this.logger.error(`[MARKDOWN FROM CONTENT ERROR] ${data.sourceFile} - ${error}`);
            throw error;
        } finally {
            this.logger.debug(`[MARKDOWN FROM CONTENT] - ${data.sourceFile} ------- END -----`);
        }
    }

    /**
     *
     * @param mongoFileId
     * @param markdownFile
     */
    async uploadMarkdownFileAndGetChunks(mongoFileId: string, markdownFile: string): Promise<void> {
        try {
            const mongoFile = await this.fileService.findById(mongoFileId);
            const etlConfig = await this.etlConfigService.findById(mongoFile.configId);

            const folderPath = this.etlSharedService.getFolderFromMongoFileId_WithValidation(
                mongoFile.id
            );

            const sourceFile = this.etlSharedService.getFullfilename_WithValidation(
                folderPath,
                markdownFile
            );

            const fileName = path.parse(sourceFile).name;

            const mimeType = lookup(sourceFile);
            const buffer = await fs.promises.readFile(sourceFile);
            this.logger.log(`[UPLOAD FILE] - upload file ${markdownFile} getting maching token`);
            const accessToken = await this.authApiService.getMachineToken();
            this.logger.verbose(`[UPLOAD FILE] - upload file ${markdownFile} before to upload`);
            const remoteFileId = await this.documentProcessingService.uploadMarkdownFile(
                buffer,
                fileName,
                mimeType,
                accessToken
            );
            const etlFile = await this.fileService.findById(mongoFileId);
            etlFile.remoteId = remoteFileId;
            await this.fileService.updateRemoteId(mongoFileId, remoteFileId);
            this.logger.verbose(
                `[UPLOAD FILE] - upload file ${markdownFile} after to upload - before to chunk`
            );
            const chunkSettings = this.etlSharedService.resolveChunkSettings(etlConfig, etlFile);

            this.logger.verbose(`[UPLOAD FILE] - upload file ${markdownFile} after to chunk`);
            const pageNumber = this.etlSharedService.getPageNumber(
                path.basename(markdownFile),
                'pages',
                'md'
            );

            await this.etlChunkService.processMarkdownChunks(
                etlFile,
                {
                    chunkSize: chunkSettings.chunkSize,
                    overlap: chunkSettings.overlap,
                    projectId: etlConfig.projectId,
                    dataScope: etlConfig.dataScope,
                },
                pageNumber
            );

            this.logger.debug(`[UPLOAD FILE] - upload file ${markdownFile} end without errors`);
        } catch (error) {
            this.logger.error(`[UPLOAD FILE ERROR] - upload file error ${error}`);
            throw error;
        } finally {
            this.logger.verbose(`[UPLOAD FILE] - upload file ${markdownFile} - check for errors`);
        }
    }

    /**
     *
     * @param data
     * @deprecated will be removed, no longer needed, ticket: https://dev.azure.com/mmctech/Mercer-PDE-Commercial-AI/_workitems/edit/2240260
     */
    async uploadMarkdown(data: MarkdownUploadData): Promise<string> {
        try {
            const fileName = path.parse(data.sourceFile).name;

            const mimeType = lookup(data.sourceFile);
            this.logger.debug(
                `[UPLOAD MARKDOWN] - upload file ${data.sourceFile} getting maching token`
            );
            const accessToken = await this.authApiService.getMachineToken();
            this.logger.verbose(
                `[UPLOAD MARKDOWN] - upload file ${data.sourceFile} before to upload`
            );
            const buffer = Buffer.from(data.content, 'utf8');
            const remoteFileId = await this.documentProcessingService.uploadMarkdownFile(
                buffer,
                fileName,
                mimeType,
                accessToken
            );
            this.logger.verbose(
                `[UPLOAD MARKDOWN] - upload file ${data.sourceFile} end without errors`
            );
            return remoteFileId;
        } catch (error) {
            this.logger.error(`[UPLOAD FMARKDOWNILE ERROR] - upload file error ${error}`);
            throw error;
        } finally {
            this.logger.verbose(
                `[UPLOAD MARKDOWN] - upload file ${data.sourceFile} - check for errors`
            );
        }
    }

    /**
     *
     * @param mongoFileId
     * @param markdownFile
     * @param remoteId
     * @param sourceFile
     * @param pageNumber
     * @param data
     * @param etlConfig
     */
    async chunkMarkdown(
        mongoFileId: string,
        remoteId: string,
        data: MarkdownUploadData,
        etlConfig: EtlConfigDocument
    ): Promise<void> {
        try {
            const etlFile = await this.fileService.findById(mongoFileId);
            etlFile.remoteId = remoteId;

            this.logger.debug(`[NEW MARKDOWN CHUNK] - chunking ${data.sourceFile}`);
            const accessToken = await this.authApiService.getMachineToken();
            const chunkSettings = this.etlSharedService.resolveChunkSettings(etlConfig, etlFile);

            await this.etlChunkService.processNewMarkdownChunks(
                etlFile,
                {
                    chunkSize: chunkSettings.chunkSize,
                    overlap: chunkSettings.overlap,
                    projectId: etlConfig.projectId,
                    dataScope: etlConfig.dataScope,
                },
                data,
                accessToken
            );

            this.logger.verbose(
                `[NEW MARKDOWN CHUNK] - chunking ${data.sourceFile} without errors`
            );
        } catch (error) {
            this.logger.error(`[NEW MARKDOWN CHUNK] - chunking ${error}`);
            throw error;
        } finally {
            this.logger.verbose(
                `[NEW MARKDOWN CHUNK] - chunking ${data.sourceFile} - check for errors`
            );
        }
    }

    /**
     *
     * @param mongoFileId
     * @param data
     * @param etlConfig
     */
    async chunkMarkdownLocally(
        mongoFileId: string,
        data: MarkdownUploadData,
        etlConfig: EtlConfigDocument
    ): Promise<void> {
        try {
            const etlFile = await this.fileService.findById(mongoFileId);

            this.logger.log(`[NEW MARKDOWN CHUNK] - chunking ${data.sourceFile}`);
            const chunkSettings = this.etlSharedService.resolveChunkSettings(etlConfig, etlFile);

            await this.etlChunkService.processChunksMarkdownLocally(
                etlFile,
                {
                    chunkSize: chunkSettings.chunkSize,
                    overlap: chunkSettings.overlap,
                    projectId: etlConfig.projectId,
                    dataScope: etlConfig.dataScope,
                },
                data
            );

            this.logger.log(`[NEW MARKDOWN CHUNK] - chunking ${data.sourceFile} without errors`);
        } catch (error) {
            this.logger.log(`[NEW MARKDOWN CHUNK] - chunking ${error}`);
            throw error;
        } finally {
            this.logger.log(
                `[NEW MARKDOWN CHUNK] - chunking ${data.sourceFile} - check for errors`
            );
        }
    }

    /**
     *
     * @param etlConfig
     * @param fileOriginId
     */
    private async getFileBuffer(
        etlConfig: EtlConfigDocument,
        fileOriginId: string
    ): Promise<Buffer> {
        let fileBuffer = null;
        if (etlConfig.dataSource.type === DataSourceType.SharePoint) {
            const sourceConfig = etlConfig.dataSource.config as SharePointConfig;
            fileBuffer = await this.sharepointService.downloadFile(
                sourceConfig.driveId,
                fileOriginId
            );
        } else if (etlConfig.dataSource.type === DataSourceType.Local) {
            const sourceConfig = etlConfig.dataSource.config as LocalConfig;
            const rootPath = path.isAbsolute(sourceConfig.rootPath)
                ? sourceConfig.rootPath
                : path.resolve(process.cwd(), sourceConfig.rootPath);

            const fullPath = path.resolve(rootPath, fileOriginId);
            const rel = path.relative(rootPath, fullPath);
            if (rel.startsWith('..') || path.isAbsolute(rel)) {
                throw new ProcessingException(
                    ` > invalid local fileOriginId path traversal [${fileOriginId}]`
                );
            }

            fileBuffer = await fs.promises.readFile(fullPath);
        } else {
            throw new ProcessingException(
                ` > file source not supported [${etlConfig.dataSource.type}]`
            );
        }
        return fileBuffer;
    }

    /**
     *
     */
    async deltaSyncForAllActiveProjects() {
        return this.sharepointSyncOrchestrator.triggerDeltaSyncForAllActiveProjects();
    }

    /**
     *
     * @param config
     */
    async deltaSyncProject(config: DeltaSyncProjectType) {
        await this.sharepointSyncOrchestrator.deltaSyncProject(config);
    }

    /**
     *
     * @param projectId
     * @param correlationId
     * @param type
     */
    async projectCleanup(projectId: string, correlationId: string, type: 'RESYNC' | 'DELETE') {
        // RESYNC: 10 minutes, DELETE: 24 hours
        const delaySeconds = type === 'RESYNC' ? 10 * 60 : 24 * 60 * 60;

        const job = await this.queueService.queueJob(
            EtlJobType.CLEAR_PROJECT_DATA,
            {
                projectId,
                correlationId,
                type,
            },
            {
                delaySeconds,
            }
        );
        return job;
    }

    /**
     * Deletes the temporary ETL folder associated with the given Mongo file ID.
     * @param mongoFileId Unique identifier of the processed file
     */
    async removeTemporaryEtlFolder(mongoFileId: string): Promise<void> {
        const context = `[CLEANUP TEMP IMAGES] - fileId: ${mongoFileId}`;
        this.logger.log(`${context} - start`);

        try {
            const folderPath =
                this.etlSharedService.getFolderFromMongoFileId_WithValidation(mongoFileId);

            await fs.promises.rm(folderPath, {
                recursive: true,
                force: true,
            });

            this.logger.log(`${context} - folder removed successfully`);
        } catch (error) {
            this.logger.error(`${context} - cleanup failed: ${error.message}`);
        }
    }
}
