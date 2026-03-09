import { Schema } from 'mongoose';

import { MONGO_QUEUE_BATCH_COLLECTION } from '../constants/mongo-queue.constants';

/**
 * Batch status enum
 */
export type BatchStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * Batch document interface
 */
export interface BatchDocument {
    _id: string;
    batchId: string;
    totalJobs: number;
    completedJobs: number;
    failedJobs: number;
    status: BatchStatus;
    metadata?: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
}

export const BatchSchema = new Schema(
    {
        batchId: { type: String, required: true, unique: true, index: true },
        totalJobs: { type: Number, required: true, default: 0 },
        completedJobs: { type: Number, required: true, default: 0 },
        failedJobs: { type: Number, required: true, default: 0 },
        status: {
            type: String,
            enum: ['pending', 'processing', 'completed', 'failed'],
            default: 'pending',
        },
        metadata: { type: Schema.Types.Mixed, default: {} },
    },
    {
        collection: MONGO_QUEUE_BATCH_COLLECTION,
        timestamps: true,
    }
);

BatchSchema.index({ status: 1 });
BatchSchema.index({ createdAt: 1 });
