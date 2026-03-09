import { Document } from 'mongoose';

/**
 * Cron Job Execution Document
 * Stores individual execution records for cron jobs
 * Uses TTL index for automatic cleanup of old records
 */
export interface CronJobExecutionDocument extends Document {
    /**
     * Name of the cron job that was executed
     */
    jobName: string;

    /**
     * When the job was executed
     */
    executedAt: Date;

    /**
     * Execution duration in milliseconds
     */
    duration: number;

    /**
     * Whether the execution was successful
     */
    success: boolean;

    /**
     * Error details if execution failed
     */
    error?: {
        message: string;
        stack?: string;
    };

    /**
     * Execution context at time of execution
     */
    context: {
        previousExecution?: Date;
        nextExecution?: Date;
    };

    /**
     * Total execution count at time of execution
     */
    executionCount: number;

    /**
     * Total failure count at time of execution
     */
    failureCount: number;

    /**
     * When this record was created
     */
    createdAt: Date;
}
