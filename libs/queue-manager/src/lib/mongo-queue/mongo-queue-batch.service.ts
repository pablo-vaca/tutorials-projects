import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

import { MONGO_QUEUE_BATCH_COLLECTION } from './constants/mongo-queue.constants';
import { BatchDocument } from './schemas/batch.schema';
import {
    IBatchProvider,
    BatchProgress,
    CreateBatchOptions,
    BatchStatus,
} from '../generic-queue/interfaces/batch-provider.interface';

/**
 * MongoDB implementation of the IBatchProvider interface.
 * Provides atomic batch tracking with progress updates using MongoDB.
 */
@Injectable()
export class MongoQueueBatchService implements IBatchProvider {
    private readonly logger = new Logger(MongoQueueBatchService.name);

    /**
     * @param batchCollection - Mongoose model for batch documents
     */
    constructor(
        @InjectModel(MONGO_QUEUE_BATCH_COLLECTION)
        private readonly batchCollection: Model<BatchDocument>
    ) {}

    /**
     * Create a new batch to track a group of jobs (IBatchProvider implementation)
     * @param totalJobs - The total number of jobs in this batch
     * @param options - Optional configuration for the batch
     * @returns The created batch ID
     */
    async createBatch(totalJobs: number, options?: CreateBatchOptions): Promise<string> {
        const batchId = options?.batchId ?? uuidv4();

        await this.batchCollection.create({
            batchId,
            totalJobs,
            completedJobs: 0,
            failedJobs: 0,
            status: totalJobs === 0 ? 'completed' : 'processing',
            metadata: options?.metadata ?? {},
        });

        this.logger.log(`Created batch ${batchId} with ${totalJobs} jobs`);
        return batchId;
    }

    /**
     * Mark a job as completed and update batch progress (IBatchProvider implementation)
     * Uses atomic $inc operation for thread-safety.
     * @param batchId - The batch ID
     * @returns Updated batch progress or null if batch not found
     */
    async markJobCompleted(batchId: string): Promise<BatchProgress | null> {
        const batch = await this.batchCollection.findOneAndUpdate(
            { batchId },
            {
                $inc: { completedJobs: 1 },
            },
            { new: true, lean: true }
        );

        if (!batch) {
            this.logger.warn(`Batch ${batchId} not found when marking job completed`);
            return null;
        }

        // Check if batch is complete and update status atomically
        if (batch.completedJobs + batch.failedJobs >= batch.totalJobs) {
            const finalStatus: BatchStatus = batch.failedJobs > 0 ? 'failed' : 'completed';
            await this.batchCollection.updateOne({ batchId }, { $set: { status: finalStatus } });
            batch.status = finalStatus;
        }

        return this.toBatchProgress(batch as BatchDocument);
    }

    /**
     * Mark a job as failed and update batch progress (IBatchProvider implementation)
     * Uses atomic $inc operation for thread-safety.
     * @param batchId - The batch ID
     * @returns Updated batch progress or null if batch not found
     */
    async markJobFailed(batchId: string): Promise<BatchProgress | null> {
        const batch = await this.batchCollection.findOneAndUpdate(
            { batchId },
            {
                $inc: { failedJobs: 1 },
            },
            { new: true, lean: true }
        );

        if (!batch) {
            this.logger.warn(`Batch ${batchId} not found when marking job failed`);
            return null;
        }

        // Check if batch is complete (even with failures)
        if (batch.completedJobs + batch.failedJobs >= batch.totalJobs) {
            await this.batchCollection.updateOne({ batchId }, { $set: { status: 'failed' } });
            batch.status = 'failed';
        }

        return this.toBatchProgress(batch as BatchDocument);
    }

    /**
     * Get batch progress by ID (IBatchProvider implementation)
     * @param batchId - The batch ID
     * @returns Batch progress or null if not found
     */
    async getProgress(batchId: string): Promise<BatchProgress | null> {
        const batch = await this.batchCollection.findOne({ batchId }).lean();

        if (!batch) {
            return null;
        }

        return this.toBatchProgress(batch as BatchDocument);
    }

    /**
     * Update batch metadata (IBatchProvider implementation)
     * @param batchId - The batch ID
     * @param metadata - Metadata to merge with existing metadata
     * @returns Updated batch progress or null if not found
     */
    async updateMetadata(
        batchId: string,
        metadata: Record<string, unknown>
    ): Promise<BatchProgress | null> {
        const batch = await this.batchCollection.findOneAndUpdate(
            { batchId },
            { $set: { metadata } },
            { new: true, lean: true }
        );

        if (!batch) {
            return null;
        }

        return this.toBatchProgress(batch as BatchDocument);
    }

    /**
     * Delete a batch by ID (IBatchProvider implementation)
     * @param batchId - The batch ID
     * @returns true if deleted, false if not found
     */
    async deleteBatch(batchId: string): Promise<boolean> {
        const result = await this.batchCollection.deleteOne({ batchId });
        return result.deletedCount > 0;
    }

    /**
     * Find batches by status (IBatchProvider implementation)
     * @param status - The status to filter by
     * @param limit - Maximum number of results (default: 100)
     * @returns Array of batch progress objects
     */
    async findByStatus(status: BatchStatus, limit = 100): Promise<BatchProgress[]> {
        const batches = await this.batchCollection.find({ status }).limit(limit).lean();

        return batches.map((b) => this.toBatchProgress(b as BatchDocument));
    }

    /**
     * Clean up old completed/failed batches (IBatchProvider implementation)
     * @param olderThanDays - Delete batches older than this many days
     * @returns Number of deleted batches
     */
    async cleanupOldBatches(olderThanDays: number): Promise<number> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

        const result = await this.batchCollection.deleteMany({
            status: { $in: ['completed', 'failed'] },
            updatedAt: { $lt: cutoffDate },
        });

        if (result.deletedCount > 0) {
            this.logger.log(`Cleaned up ${result.deletedCount} old batches`);
        }

        return result.deletedCount;
    }

    /**
     * Convert a batch document to a BatchProgress object.
     * @param batch - The batch document
     * @returns BatchProgress object with calculated progress percentage
     */
    private toBatchProgress(batch: BatchDocument): BatchProgress {
        const processed = batch.completedJobs + batch.failedJobs;
        const progress =
            batch.totalJobs === 0 ? 100 : Math.floor((processed / batch.totalJobs) * 100);

        return {
            batchId: batch.batchId,
            totalJobs: batch.totalJobs,
            completedJobs: batch.completedJobs,
            failedJobs: batch.failedJobs,
            progress,
            status: batch.status,
        };
    }
}
