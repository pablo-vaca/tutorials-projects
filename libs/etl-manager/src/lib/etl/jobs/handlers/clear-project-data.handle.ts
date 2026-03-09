
import { Injectable, Logger } from '@nestjs/common';

import { QueueJob, IJobResult } from '@deal-insights/shared-nestjs-utils';

import {
    DataSourceType,
    EtlConfig,
    EtlConfigDocument,
    FileDocument,
    SharePointConfig,
} from '../../schemas';
import { ConfigHistoryActions } from '../../services';
import ChunkMongoService from '../../services/chunk-mongo.service';
import EtlConfigService from '../../services/etl-config.service';
import FileService from '../../services/file.service';
import VectorService from '../../services/vector.service';
import { EtlClearProjectJobData, EtlJobData } from '../etl-job.types';
import { ISingleEtlHandler } from '../single-etl-handler.interface';

/**
 * Handler for clearing all project data (files, chunks, and embeddings)
 * Used when a resync is requested to ensure clean slate
 * Implements batched deletions to avoid database locks on large datasets
 */
@Injectable()
export class ClearProjectDataHandler implements ISingleEtlHandler<EtlJobData> {
    private readonly BATCH_SIZE = 1000; // Process deletions in batches to avoid locking

    /**
     * @param fileService Service for managing files
     * @param chunkMongoService Service for managing chunks
     * @param vectorService Service for managing vectors/embeddings
     * @param etlConfigService
     * @param logger Logger instance
     */
    constructor(
        private readonly fileService: FileService,
        private readonly chunkMongoService: ChunkMongoService,
        private readonly vectorService: VectorService,
        private readonly etlConfigService: EtlConfigService,
        protected readonly logger: Logger
    ) {}

    /**
     * Clears all files, chunks, and embeddings for a project
     * @param job The queue job containing project information
     * @param etlConfig The ETL configuration (optional)
     * @returns {Promise<IJobResult>} Result of the operation
     */
    async handle(
        job: QueueJob<EtlClearProjectJobData>,
        etlConfig?: EtlConfigDocument
    ): Promise<IJobResult> {
        const { projectId } = job.payload;

        this.logger.log(`[CLEAR_PROJECT_DATA] Starting data cleanup for project: ${projectId}`);

        try {
            // FIRST: set project as inactive to stop any process to take this etl config
            // Clear delta sync url and set project as inactive to avoid cron sync (just update it back to active when ready to resync)
            if (etlConfig.dataSource.type === DataSourceType.SharePoint) {
                this.logger.debug(' !! Celaring delta link for Sharepoint');
                const spConfig = etlConfig.dataSource.config as SharePointConfig;
                const newSpConfig = { ...spConfig, deltaLink: null };
                const updateData: Partial<EtlConfig> = {
                    dataSource: {
                        type: DataSourceType.SharePoint,
                        config: newSpConfig,
                    },
                    status: 'inactive',
                    errorMessage: null,
                };

                await this.etlConfigService.update(etlConfig.id, updateData);
                this.logger.debug(
                    " > > Delta link set to null and config deactivated to not be reprocessed automatically by cronjob until it's ready to"
                );
            }

            // Get all file IDs for the project (needed for chunk deletion)
            const files = await this.fileService.findByProjectId(projectId);
            const fileIds = files.map((file) => file.id);

            this.logger.debug(
                `Found ${files.length} files to process for project ${projectId} reset`
            );

            // Delete chunks in batches to avoid database locks
            let chunksDeleted = 0;
            if (fileIds.length > 0) {
                chunksDeleted = await this.deleteChunksInBatches(fileIds, projectId);
            }

            // Delete vectors/embeddings for the project
            // Vectors are indexed by projectId, so this should be reasonably fast
            const vectorResult = await this.vectorService.deleteByProjectId(projectId);
            const vectorsDeleted = vectorResult.deletedCount;
            this.logger.debug(`Deleted ${vectorsDeleted} vectors for project ${projectId}`);

            // Delete all files for the project in batches
            const filesDeleted = await this.deleteFilesInBatches(files, projectId);

            this.logger.log(
                `[CLEAR_PROJECT_DATA] Completed cleanup for project ${projectId}: ` +
                    `${filesDeleted} files, ${chunksDeleted} chunks, ${vectorsDeleted} vectors deleted`
            );

            if (job.payload.type === 'DELETE') {
                this.etlConfigService.delete(etlConfig.id);
                this.etlConfigService.addHistoryEntry(
                    etlConfig.id,
                    ConfigHistoryActions.DELETE_PROJECT
                );
            } else {
                this.etlConfigService.addHistoryEntry(
                    etlConfig.id,
                    ConfigHistoryActions.RESYNC_PROJECT
                );
            }

            return {
                success: true,
                data: {
                    message: `Cleared ${filesDeleted} files, ${chunksDeleted} chunks, and ${vectorsDeleted} vectors for project ${projectId}`,
                    projectId,
                    filesDeleted,
                    chunksDeleted,
                    vectorsDeleted,
                },
            };
        } catch (error) {
            this.logger.error(
                `[CLEAR_PROJECT_DATA] Failed to clear data for project ${projectId}`,
                error
            );

            return {
                success: false,
                data: {
                    message: `Failed to clear project data: ${error.message}`,
                },
                error: error.message,
            };
        }
    }

    /**
     * Delete chunks in batches to avoid database locks on large datasets
     * @param fileIds Array of file IDs whose chunks should be deleted
     * @param projectId Project ID for logging
     * @returns Total number of chunks deleted
     */
    private async deleteChunksInBatches(fileIds: string[], projectId: string): Promise<number> {
        const batches = Math.ceil(fileIds.length / this.BATCH_SIZE);

        this.logger.debug(
            `Deleting chunks for ${fileIds.length} files in ${batches} batches for project ${projectId}`
        );

        // Create array of batch operations
        const batchOperations = [];
        for (let i = 0; i < fileIds.length; i += this.BATCH_SIZE) {
            const batch = fileIds.slice(i, i + this.BATCH_SIZE);
            const batchNum = Math.floor(i / this.BATCH_SIZE) + 1;
            batchOperations.push({ batch, batchNum });
        }

        // Execute batches sequentially using reduce
        const totalDeleted = await batchOperations.reduce(
            async (previousPromise, { batch, batchNum }) => {
                const accumulated = await previousPromise;
                const result = await this.chunkMongoService.deleteByFileIds(batch);
                const newTotal = accumulated + result.deletedCount;

                this.logger.debug(
                    `Batch ${batchNum}/${batches}: Deleted ${result.deletedCount} chunks (${newTotal} total)`
                );

                // Small delay between batches to reduce database pressure
                if (batchNum < batches) {
                    await new Promise((resolve) => {
                        setTimeout(resolve, 100);
                    });
                }

                return newTotal;
            },
            Promise.resolve(0)
        );

        this.logger.debug(`Deleted ${totalDeleted} chunks for project ${projectId}`);
        return totalDeleted;
    }

    /**
     * Delete files in batches to avoid database locks on large datasets
     * @param files Array of file documents to delete
     * @param projectId Project ID for logging
     * @returns Total number of files deleted
     */
    private async deleteFilesInBatches(
        files: Array<FileDocument>,
        projectId: string
    ): Promise<number> {
        const batches = Math.ceil(files.length / this.BATCH_SIZE);

        this.logger.debug(
            `Deleting ${files.length} files in ${batches} batches for project ${projectId}`
        );

        // Create array of batch operations
        const batchOperations = [];
        for (let i = 0; i < files.length; i += this.BATCH_SIZE) {
            const batch = files.slice(i, i + this.BATCH_SIZE);
            const batchNum = Math.floor(i / this.BATCH_SIZE) + 1;
            batchOperations.push({ batch, batchNum });
        }

        // Execute batches sequentially using reduce
        const totalDeleted = await batchOperations.reduce(
            async (previousPromise, { batch, batchNum }) => {
                const accumulated = await previousPromise;
                const deletePromises = batch.map((file) => this.fileService.deleteById(file.id));
                await Promise.all(deletePromises);
                const newTotal = accumulated + batch.length;

                this.logger.debug(
                    `Batch ${batchNum}/${batches}: Deleted ${batch.length} files (${newTotal} total)`
                );

                // Small delay between batches to reduce database pressure
                if (batchNum < batches) {
                    await new Promise((resolve) => {
                        setTimeout(resolve, 100);
                    });
                }

                return newTotal;
            },
            Promise.resolve(0)
        );

        this.logger.debug(`Deleted ${totalDeleted} files for project ${projectId}`);
        return totalDeleted;
    }
}
