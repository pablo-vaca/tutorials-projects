import { Schema } from 'mongoose';

import {
    CRON_JOB_EXECUTION_COLLECTION,
    EXECUTION_HISTORY_RETENTION_DAYS,
} from '../constants/cron-jobs.constants';

/**
 * Execution history schema - one document per execution
 * Uses TTL index for automatic cleanup of old records
 */
export const CronJobExecutionSchema = new Schema(
    {
        jobName: { type: String, required: true, index: true },
        executedAt: { type: Date, required: true, index: true },
        duration: { type: Number, required: true }, // milliseconds
        success: { type: Boolean, required: true, index: true },
        error: {
            message: { type: String },
            stack: { type: String },
        },
        context: {
            previousExecution: { type: Date },
            nextExecution: { type: Date },
        },
        executionCount: { type: Number, required: true }, // Total count at time of execution
        failureCount: { type: Number, required: true }, // Total failures at time of execution
    },
    {
        collection: CRON_JOB_EXECUTION_COLLECTION,
        timestamps: { createdAt: true, updatedAt: false },
    }
);

// Compound indexes for efficient queries
CronJobExecutionSchema.index({ jobName: 1, executedAt: -1 });
CronJobExecutionSchema.index({ jobName: 1, success: 1, executedAt: -1 });
CronJobExecutionSchema.index({ executedAt: -1 });
CronJobExecutionSchema.index({ success: 1, executedAt: -1 });

/**
 * TTL index for automatic cleanup
 * MongoDB will automatically delete documents older than EXECUTION_HISTORY_RETENTION_DAYS
 * The cleanup process runs once every 60 seconds
 */
CronJobExecutionSchema.index(
    { executedAt: 1 },
    {
        expireAfterSeconds: EXECUTION_HISTORY_RETENTION_DAYS * 24 * 60 * 60,
        name: 'ttl_executedAt',
    }
);
