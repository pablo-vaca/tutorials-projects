import { Document } from 'mongoose';

/**
 * Cron Job Configuration Document
 * Stores persistent configuration for registered cron jobs
 */
export interface CronJobConfigDocument extends Document {
    /**
     * Unique name for the cron job
     */
    name: string;

    /**
     * Cron expression (stored as string)
     */
    cronTime: string;

    /**
     * Whether the job is enabled
     */
    enabled: boolean;

    /**
     * Whether to run on initialization
     */
    runOnInit: boolean;

    /**
     * Timezone for the cron job
     */
    timeZone: string;

    /**
     * Last execution timestamp
     */
    lastExecution?: Date | null;

    /**
     * Next scheduled execution
     */
    nextExecution?: Date | null;

    /**
     * Total number of executions
     */
    executionCount: number;

    /**
     * Total number of failures
     */
    failureCount: number;

    /**
     * When the job was first registered
     */
    createdAt: Date;

    /**
     * When the configuration was last updated
     */
    updatedAt: Date;
}
