import { Injectable, Logger, Optional } from '@nestjs/common';

import {
    BatchProgress,
    CreateBatchOptions,
    IBatchProvider,
    BatchStatus,
} from '../interfaces/batch-provider.interface';

/**
 * Options for batch job operations
 */
export interface BatchJobOptions {
    /** Optional batch ID to associate with the job */
    batchId?: string;
}

/**
 * Generic batch service providing storage-agnostic batch tracking.
 * Delegates actual storage operations to an injected IBatchProvider implementation.
 *
 * This service can work with any batch provider (MongoDB, Redis, PostgreSQL, etc.)
 * as long as it implements the IBatchProvider interface.
 */
@Injectable()
export class GenericBatchService {
    private readonly logger = new Logger(GenericBatchService.name);

    /**
     * @param batchProvider - The batch provider implementation (injected)
     */
    constructor(@Optional() private readonly batchProvider?: IBatchProvider) {
        if (!batchProvider) {
            this.logger.warn('No batch provider configured. Batch features will be disabled.');
        }
    }

    /**
     * Check if batch tracking is available
     * @returns true if a batch provider is configured
     */
    isBatchTrackingEnabled(): boolean {
        return !!this.batchProvider;
    }

    /**
     * Create a new batch to track a group of jobs
     * @param totalJobs - The total number of jobs in this batch
     * @param options - Optional configuration for the batch
     * @returns The created batch ID
     * @throws Error if batch provider is not configured
     */
    async createBatch(totalJobs: number, options?: CreateBatchOptions): Promise<string> {
        this.ensureBatchProvider();

        const batchId = await this.batchProvider!.createBatch(totalJobs, options);
        this.logger.log(`Created batch ${batchId} with ${totalJobs} jobs`);

        return batchId;
    }

    /**
     * Mark a job as completed and update batch progress
     * @param batchId - The batch ID
     * @returns Updated batch progress or null if batch not found
     * @throws Error if batch provider is not configured
     */
    async markJobCompleted(batchId: string): Promise<BatchProgress | null> {
        this.ensureBatchProvider();

        const progress = await this.batchProvider!.markJobCompleted(batchId);

        if (progress && progress.status === 'completed') {
            this.logger.log(
                `Batch ${batchId} completed: ${progress.completedJobs}/${progress.totalJobs} jobs succeeded`
            );
        }

        return progress;
    }

    /**
     * Mark a job as failed and update batch progress
     * @param batchId - The batch ID
     * @returns Updated batch progress or null if batch not found
     * @throws Error if batch provider is not configured
     */
    async markJobFailed(batchId: string): Promise<BatchProgress | null> {
        this.ensureBatchProvider();

        const progress = await this.batchProvider!.markJobFailed(batchId);

        if (progress && progress.status === 'failed') {
            this.logger.warn(`Batch ${batchId} failed: ${progress.failedJobs} failed jobs`);
        }

        return progress;
    }

    /**
     * Get batch progress by ID
     * @param batchId - The batch ID
     * @returns Batch progress or null if not found
     * @throws Error if batch provider is not configured
     */
    async getProgress(batchId: string): Promise<BatchProgress | null> {
        this.ensureBatchProvider();
        return this.batchProvider!.getProgress(batchId);
    }

    /**
     * Update batch metadata
     * @param batchId - The batch ID
     * @param metadata - Metadata to merge with existing metadata
     * @returns Updated batch progress or null if not found
     * @throws Error if batch provider is not configured
     */
    async updateMetadata(
        batchId: string,
        metadata: Record<string, unknown>
    ): Promise<BatchProgress | null> {
        this.ensureBatchProvider();
        return this.batchProvider!.updateMetadata(batchId, metadata);
    }

    /**
     * Delete a batch by ID
     * @param batchId - The batch ID
     * @returns true if deleted, false if not found
     * @throws Error if batch provider is not configured
     */
    async deleteBatch(batchId: string): Promise<boolean> {
        this.ensureBatchProvider();

        const deleted = await this.batchProvider!.deleteBatch(batchId);

        if (deleted) {
            this.logger.log(`Deleted batch ${batchId}`);
        }

        return deleted;
    }

    /**
     * Find batches by status
     * @param status - The status to filter by
     * @param limit - Maximum number of results (default: 100)
     * @returns Array of batch progress objects
     * @throws Error if batch provider is not configured
     */
    async findByStatus(status: BatchStatus, limit = 100): Promise<BatchProgress[]> {
        this.ensureBatchProvider();
        return this.batchProvider!.findByStatus(status, limit);
    }

    /**
     * Clean up old completed/failed batches
     * @param olderThanDays - Delete batches older than this many days
     * @returns Number of deleted batches
     * @throws Error if batch provider is not configured
     */
    async cleanupOldBatches(olderThanDays: number): Promise<number> {
        this.ensureBatchProvider();

        const deletedCount = await this.batchProvider!.cleanupOldBatches(olderThanDays);

        if (deletedCount > 0) {
            this.logger.log(`Cleaned up ${deletedCount} old batches`);
        }

        return deletedCount;
    }

    /**
     * Ensure batch provider is configured, throw error otherwise
     * @private
     */
    private ensureBatchProvider(): void {
        if (!this.batchProvider) {
            throw new Error(
                'Batch provider not configured. Please provide an IBatchProvider implementation.'
            );
        }
    }
}
