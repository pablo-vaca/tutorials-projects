/**
 * Batch status
 */
export type BatchStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * Progress information for a batch
 */
export interface BatchProgress {
    batchId: string;
    totalJobs: number;
    completedJobs: number;
    failedJobs: number;
    progress: number; // 0-100
    status: BatchStatus;
}

/**
 * Options for creating a batch
 */
export interface CreateBatchOptions {
    /** Optional custom batch ID (auto-generated if not provided) */
    batchId?: string;
    /** Optional metadata to store with the batch */
    metadata?: Record<string, unknown>;
}

/**
 * Abstract interface for batch tracking providers.
 * Implement this interface to create custom batch backends (MongoDB, Redis, PostgreSQL, etc.)
 */
export interface IBatchProvider {
    /**
     * Create a new batch to track a group of jobs
     * @param totalJobs - The total number of jobs in this batch
     * @param options - Optional configuration for the batch
     * @returns The created batch ID
     */
    createBatch(totalJobs: number, options?: CreateBatchOptions): Promise<string>;

    /**
     * Mark a job as completed and update batch progress
     * @param batchId - The batch ID
     * @returns Updated batch progress or null if batch not found
     */
    markJobCompleted(batchId: string): Promise<BatchProgress | null>;

    /**
     * Mark a job as failed and update batch progress
     * @param batchId - The batch ID
     * @returns Updated batch progress or null if batch not found
     */
    markJobFailed(batchId: string): Promise<BatchProgress | null>;

    /**
     * Get batch progress by ID
     * @param batchId - The batch ID
     * @returns Batch progress or null if not found
     */
    getProgress(batchId: string): Promise<BatchProgress | null>;

    /**
     * Update batch metadata
     * @param batchId - The batch ID
     * @param metadata - Metadata to merge with existing metadata
     * @returns Updated batch progress or null if not found
     */
    updateMetadata(
        batchId: string,
        metadata: Record<string, unknown>
    ): Promise<BatchProgress | null>;

    /**
     * Delete a batch by ID
     * @param batchId - The batch ID
     * @returns true if deleted, false if not found
     */
    deleteBatch(batchId: string): Promise<boolean>;

    /**
     * Find batches by status
     * @param status - The status to filter by
     * @param limit - Maximum number of results
     * @returns Array of batch progress objects
     */
    findByStatus(status: BatchStatus, limit?: number): Promise<BatchProgress[]>;

    /**
     * Clean up old completed/failed batches
     * @param olderThanDays - Delete batches older than this many days
     * @returns Number of deleted batches
     */
    cleanupOldBatches(olderThanDays: number): Promise<number>;
}
