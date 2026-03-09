/* eslint-disable no-plusplus */
import { Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { Model } from 'mongoose';

import {
    CRON_JOB_CONFIG_COLLECTION,
    CRON_JOB_EXECUTION_COLLECTION,
} from '../constants/cron-jobs.constants';
import { CronJobConfigDocument } from '../schemas/cron-job-config.document';
import { CronJobExecutionDocument } from '../schemas/cron-job-execution.document';
import {
    CronJobConfig,
    CronJobHandler,
    CronJobMetadata,
    CronJobResult,
    CronJobContext,
    TimeZone,
} from '../types/cron-jobs.types';

/**
 * Generic Cron Jobs Service
 * Provides Jobs for managing cron jobs dynamically in NestJS applications
 *
 * Features:
 * - Dynamic cron job registration and management
 * - Persistent storage of job configurations (when MongoDB models are provided)
 * - Execution history tracking (when MongoDB models are provided)
 * - Works without MongoDB (in-memory only mode)
 */
@Injectable()
export class CronJobsService implements OnModuleDestroy {
    private readonly logger = new Logger(CronJobsService.name);

    private readonly jobMetadata = new Map<string, CronJobMetadata>();

    private readonly jobHandlers = new Map<string, CronJobHandler>();

    private readonly persistenceEnabled: boolean;

    /**
     *
     * @param schedulerRegistry
     * @param configModel
     * @param executionModel
     */
    constructor(
        private readonly schedulerRegistry: SchedulerRegistry,
        @Optional()
        @InjectModel(CRON_JOB_CONFIG_COLLECTION)
        private readonly configModel?: Model<CronJobConfigDocument>,
        @Optional()
        @InjectModel(CRON_JOB_EXECUTION_COLLECTION)
        private readonly executionModel?: Model<CronJobExecutionDocument>
    ) {
        this.persistenceEnabled = !!(this.configModel && this.executionModel);
        if (this.persistenceEnabled) {
            this.logger.warn('MongoDB persistence enabled for cron jobs');
        } else {
            this.logger.warn('MongoDB models not provided - running in memory-only mode');
        }
    }

    /**
     * Register a new cron job dynamically
     * @param config - Cron job configuration
     * @param handler - Function to execute when the cron job runs
     * @returns The created CronJob instance
     */
    async registerCronJob<T = unknown>(
        config: CronJobConfig,
        handler: CronJobHandler<T>
    ): Promise<CronJob> {
        const {
            name,
            cronTime,
            runOnInit = false,
            timeZone = TimeZone.AMERICA_NEW_YORK,
            enabled = true,
        } = config;

        // Check if job already exists
        if (this.jobExists(name)) {
            this.logger.warn(`Cron job "${name}" already exists. Removing old job.`);
            await this.removeCronJob(name);
        }

        // Store the handler
        this.jobHandlers.set(name, handler);

        // Initialize metadata
        const metadata: CronJobMetadata = {
            name,
            cronTime: cronTime.toString(),
            enabled,
            runOnInit,
            timeZone,
            executionCount: 0,
            failureCount: 0,
        };
        this.jobMetadata.set(name, metadata);

        // Persist to database if enabled
        if (this.persistenceEnabled && this.configModel) {
            try {
                await this.configModel.findOneAndUpdate(
                    { name },
                    {
                        name,
                        cronTime: cronTime.toString(),
                        enabled,
                        runOnInit,
                        timeZone,
                        executionCount: 0,
                        failureCount: 0,
                    },
                    { upsert: true, new: true }
                );
                const statusStr = enabled ? 'enabled' : 'disabled';
                this.logger.debug(
                    `Persisted cron job config for "${name}" to MongoDB (${statusStr})`
                );
            } catch (error) {
                this.logger.error(`Failed to persist cron job config for "${name}"`);
            }
        }

        const job = new CronJob(
            cronTime,
            async () => {
                await this.executeCronJob(name);
            },
            null,
            false,
            timeZone,
            null,
            false
        );

        // Register the job
        this.schedulerRegistry.addCronJob(name, job);

        // Now start the job if enabled
        if (enabled) {
            job.start();

            // Run immediately if runOnInit is true
            if (runOnInit) {
                // Use setImmediate to ensure registration is complete
                setImmediate(async () => {
                    try {
                        await this.executeCronJob(name);
                    } catch (error) {
                        this.logger.error(`Error in runOnInit execution for "${name}":`, error);
                    }
                });
            }
        }

        const statusStr = enabled ? 'ENABLED' : 'DISABLED';
        this.logger.log(
            `Cron job "${name}" registered: ${statusStr} | Schedule: ${cronTime} | Timezone: ${timeZone}`
        );

        return job;
    }

    /**
     * Execute a cron job manually
     * @param name - Name of the cron job
     * @returns Execution result
     */
    async executeCronJob<T = unknown>(name: string): Promise<CronJobResult<T>> {
        const metadata = this.jobMetadata.get(name);
        const handler = this.jobHandlers.get(name);

        if (!metadata || !handler) {
            throw new Error(`Cron job "${name}" not found`);
        }

        if (!metadata.enabled) {
            this.logger.warn(`Cron job "${name}" is disabled. Skipping execution.`);
            return {
                success: false,
                error: new Error('Job is disabled'),
                context: this.getJobContext(name),
                duration: 0,
            };
        }

        const startTime = Date.now();
        const context = this.getJobContext(name);

        try {
            this.logger.log(`Executing cron job: ${name}`);

            const data = await handler(context);

            const duration = Date.now() - startTime;

            // Update metadata
            metadata.lastExecution = new Date();
            metadata.executionCount++;
            this.updateNextExecution(name);

            // Persist execution to database
            await this.saveExecutionHistory(
                name,
                true,
                duration,
                context,
                metadata.executionCount,
                metadata.failureCount
            );

            // Update config in database
            await this.updateConfigMetadata(name, metadata);

            this.logger.log(`Cron job "${name}" completed successfully in ${duration}ms`);

            return {
                success: true,
                data: data as T,
                context,
                duration,
            };
        } catch (error) {
            const duration = Date.now() - startTime;

            // Update metadata
            metadata.lastExecution = new Date();
            metadata.executionCount++;
            metadata.failureCount++;
            this.updateNextExecution(name);

            // Persist execution to database
            await this.saveExecutionHistory(
                name,
                false,
                duration,
                context,
                metadata.executionCount,
                metadata.failureCount,
                error instanceof Error ? error : new Error(String(error))
            );

            // Update config in database
            await this.updateConfigMetadata(name, metadata);

            this.logger.error(`Cron job "${name}" failed after ${duration}ms`);

            return {
                success: false,
                error: error instanceof Error ? error : new Error(String(error)),
                context,
                duration,
            };
        }
    }

    /**
     * Remove a cron job
     * @param name - Name of the cron job
     */
    async removeCronJob(name: string): Promise<void> {
        if (!this.jobExists(name)) {
            this.logger.warn(`Cron job "${name}" does not exist`);
            return;
        }

        this.schedulerRegistry.deleteCronJob(name);
        this.jobMetadata.delete(name);
        this.jobHandlers.delete(name);

        // Remove from database if persistence is enabled
        if (this.persistenceEnabled && this.configModel) {
            try {
                await this.configModel.deleteOne({ name });
                this.logger.debug(`Removed cron job config for "${name}" from MongoDB`);
            } catch (error) {
                this.logger.error(`Failed to remove cron job config for "${name}" from MongoDB`);
            }
        }

        this.logger.log(`Cron job "${name}" removed`);
    }

    /**
     * Start a cron job
     * @param name - Name of the cron job
     */
    startCronJob(name: string): void {
        const job = this.getCronJob(name);
        const metadata = this.jobMetadata.get(name);

        if (metadata) {
            metadata.enabled = true;
        }

        job.start();
        this.updateNextExecution(name);

        this.logger.log(`Cron job "${name}" started`);
    }

    /**
     * Stop a cron job
     * @param name - Name of the cron job
     */
    stopCronJob(name: string): void {
        const job = this.getCronJob(name);
        const metadata = this.jobMetadata.get(name);

        if (metadata) {
            metadata.enabled = false;
        }

        job.stop();

        this.logger.log(`Cron job "${name}" stopped`);
    }

    /**
     * Get a cron job by name
     * @param name - Name of the cron job
     * @returns The CronJob instance
     */
    getCronJob(name: string) {
        try {
            return this.schedulerRegistry.getCronJob(name);
        } catch (error) {
            throw new Error(`Cron job "${name}" not found`);
        }
    }

    /**
     * Check if a cron job exists
     * @param name - Name of the cron job
     * @returns True if the job exists
     */
    jobExists(name: string): boolean {
        try {
            this.schedulerRegistry.getCronJob(name);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get metadata for a cron job
     * @param name - Name of the cron job
     * @returns Job metadata
     */
    getJobMetadata(name: string): CronJobMetadata | undefined {
        return this.jobMetadata.get(name);
    }

    /**
     * Get metadata for all registered cron jobs
     * @returns Map of job names to metadata
     */
    getAllJobMetadata(): Map<string, CronJobMetadata> {
        return new Map(this.jobMetadata);
    }

    /**
     * Get all registered cron job names
     * @returns Array of job names
     */
    getAllJobNames(): string[] {
        return Array.from(this.jobMetadata.keys());
    }

    /**
     * Enable a cron job
     * @param name - Name of the cron job
     */
    async enableCronJob(name: string): Promise<void> {
        const metadata = this.jobMetadata.get(name);

        if (!metadata) {
            throw new Error(`Cron job "${name}" not found`);
        }

        if (!metadata.enabled) {
            metadata.enabled = true;
            this.startCronJob(name);

            // Persist the enabled state to database
            await this.updateConfigMetadata(name, metadata);
        }
    }

    /**
     * Disable a cron job
     * @param name - Name of the cron job
     */
    async disableCronJob(name: string): Promise<void> {
        const metadata = this.jobMetadata.get(name);

        if (!metadata) {
            throw new Error(`Cron job "${name}" not found`);
        }

        if (metadata.enabled) {
            metadata.enabled = false;
            this.stopCronJob(name);

            // Persist the disabled state to database
            await this.updateConfigMetadata(name, metadata);
        }
    }

    /**
     * Restart a cron job
     * Removes and re-registers the job with its current configuration and handler
     * @param name - Name of the cron job
     */
    async restartCronJob(name: string): Promise<void> {
        const handler = this.jobHandlers.get(name);
        const metadata = this.jobMetadata.get(name);

        if (!handler || !metadata) {
            throw new Error(`Cron job "${name}" not found`);
        }

        this.logger.log(`Restarting cron job "${name}"`);

        const wasEnabled = metadata.enabled;

        // Remove the old job
        await this.removeCronJob(name);

        // Re-register the job with the same configuration
        await this.registerCronJob(
            {
                name,
                cronTime: metadata.cronTime,
                enabled: wasEnabled,
                runOnInit: metadata.runOnInit,
                timeZone: metadata.timeZone,
            },
            handler
        );

        this.logger.log(`Cron job "${name}" restarted successfully`);
    }

    /**
     * Update the cron schedule for a job
     * @param name - Name of the cron job
     * @param newCronTime - New cron expression
     */
    updateCronSchedule(name: string, newCronTime: string): void {
        const handler = this.jobHandlers.get(name);
        const metadata = this.jobMetadata.get(name);

        if (!handler || !metadata) {
            throw new Error(`Cron job "${name}" not found`);
        }

        const wasEnabled = metadata.enabled;

        // Remove the old job
        this.removeCronJob(name);

        // Register a new job with the updated schedule
        this.registerCronJob(
            {
                name,
                cronTime: newCronTime,
                enabled: wasEnabled,
                runOnInit: metadata.runOnInit,
                timeZone: metadata.timeZone,
            },
            handler
        );

        this.logger.log(`Cron job "${name}" schedule updated to: ${newCronTime}`);
    }

    /**
     * Get the next execution time for a cron job
     * @param name - Name of the cron job
     * @returns Next execution date
     */
    getNextExecution(name: string): Date | null {
        const job = this.getCronJob(name);
        return job.nextDate()?.toJSDate() ?? null;
    }

    /**
     * Get the job execution context
     * @param name - Name of the cron job
     * @returns Job context
     */
    private getJobContext(name: string): CronJobContext {
        const metadata = this.jobMetadata.get(name);
        const nextExecution = this.getNextExecution(name);

        return {
            jobName: name,
            executedAt: new Date(),
            previousExecution: metadata?.lastExecution,
            nextExecution: nextExecution ?? undefined,
        };
    }

    /**
     * Update the next execution time in metadata
     * @param name - Name of the cron job
     */
    private updateNextExecution(name: string): void {
        const metadata = this.jobMetadata.get(name);
        const nextExecution = this.getNextExecution(name);

        if (metadata && nextExecution) {
            metadata.nextExecution = nextExecution;
        }
    }

    /**
     * Save execution history to database
     * Creates a new document for each execution
     * TTL index automatically removes old records after retention period
     * @param jobName
     * @param success
     * @param duration
     * @param context
     * @param executionCount
     * @param failureCount
     * @param error
     * @private
     */
    private async saveExecutionHistory(
        jobName: string,
        success: boolean,
        duration: number,
        context: CronJobContext,
        executionCount: number,
        failureCount: number,
        error?: Error
    ): Promise<void> {
        if (!this.persistenceEnabled || !this.executionModel) {
            return;
        }

        try {
            await this.executionModel.create({
                jobName,
                executedAt: context.executedAt,
                duration,
                success,
                error: error
                    ? {
                          message: error.message,
                          stack: error.stack,
                      }
                    : undefined,
                context: {
                    previousExecution: context.previousExecution,
                    nextExecution: context.nextExecution,
                },
                executionCount,
                failureCount,
            });
            this.logger.debug(`Saved execution history for "${jobName}" to MongoDB`);
        } catch (err) {
            this.logger.error(`Failed to save execution history for "${jobName}"`);
        }
    }

    /**
     * Update config metadata in database
     * @param name
     * @param metadata
     * @private
     */
    private async updateConfigMetadata(name: string, metadata: CronJobMetadata): Promise<void> {
        if (!this.persistenceEnabled || !this.configModel) {
            return;
        }

        try {
            await this.configModel.findOneAndUpdate(
                { name },
                {
                    lastExecution: metadata.lastExecution,
                    nextExecution: metadata.nextExecution,
                    executionCount: metadata.executionCount,
                    failureCount: metadata.failureCount,
                    enabled: metadata.enabled,
                }
            );
            this.logger.debug(`Updated config metadata for "${name}" in MongoDB`);
        } catch (error) {
            this.logger.error(`Failed to update config metadata for "${name}"`);
        }
    }

    /**
     * Load job configurations from database
     * This allows you to restore jobs after application restart
     * Note: You still need to re-register handlers after loading configs
     */
    async loadJobConfigsFromDatabase(): Promise<CronJobConfigDocument[]> {
        if (!this.persistenceEnabled || !this.configModel) {
            this.logger.warn('Cannot load configs - persistence not enabled');
            return [];
        }

        try {
            const configs = await this.configModel.find().exec();
            this.logger.log(`Loaded ${configs.length} job configs from MongoDB`);
            return configs;
        } catch (error) {
            this.logger.error('Failed to load job configs from database');
            return [];
        }
    }

    /**
     * Get execution history for a job
     * @param jobName - Name of the job
     * @param limit - Maximum number of records to return
     * @returns Array of execution documents sorted by most recent first
     */
    async getExecutionHistory(jobName: string, limit = 100): Promise<CronJobExecutionDocument[]> {
        if (!this.persistenceEnabled || !this.executionModel) {
            this.logger.warn('Cannot get execution history - persistence not enabled');
            return [];
        }

        try {
            return await this.executionModel
                .find({ jobName })
                .sort({ executedAt: -1 })
                .limit(limit)
                .exec();
        } catch (error) {
            this.logger.error(`Failed to get execution history for "${jobName}"`);
            return [];
        }
    }

    /**
     * Get execution statistics for a job
     * Uses aggregation to calculate stats from execution documents
     * @param jobName - Name of the job
     * @returns Statistics object or null if not found
     */
    async getExecutionStats(jobName: string): Promise<{
        totalExecutions: number;
        successfulExecutions: number;
        failedExecutions: number;
        averageDuration: number;
        lastExecutedAt?: Date;
        lastSuccessAt?: Date;
        lastFailureAt?: Date;
    } | null> {
        if (!this.persistenceEnabled || !this.executionModel) {
            this.logger.warn('Cannot get execution stats - persistence not enabled');
            return null;
        }

        try {
            const stats = await this.executionModel.aggregate([
                { $match: { jobName } },
                {
                    $group: {
                        _id: '$jobName',
                        totalExecutions: { $sum: 1 },
                        successfulExecutions: {
                            $sum: { $cond: ['$success', 1, 0] },
                        },
                        failedExecutions: {
                            $sum: { $cond: ['$success', 0, 1] },
                        },
                        averageDuration: { $avg: '$duration' },
                        lastExecutedAt: { $max: '$executedAt' },
                    },
                },
            ]);

            if (stats.length === 0) {
                return null;
            }

            // Get last success and last failure separately
            const lastSuccess = await this.executionModel
                .findOne({ jobName, success: true })
                .sort({ executedAt: -1 })
                .select('executedAt')
                .exec();

            const lastFailure = await this.executionModel
                .findOne({ jobName, success: false })
                .sort({ executedAt: -1 })
                .select('executedAt')
                .exec();

            return {
                totalExecutions: stats[0].totalExecutions,
                successfulExecutions: stats[0].successfulExecutions,
                failedExecutions: stats[0].failedExecutions,
                averageDuration: Math.round(stats[0].averageDuration),
                lastExecutedAt: stats[0].lastExecutedAt,
                lastSuccessAt: lastSuccess?.executedAt,
                lastFailureAt: lastFailure?.executedAt,
            };
        } catch (error) {
            this.logger.error(`Failed to get execution stats for "${jobName}"`);
            return null;
        }
    }

    /**
     * Cleanup old execution history records
     * Note: TTL index automatically removes records older than EXECUTION_HISTORY_RETENTION_DAYS
     * This method is for manual cleanup or using different retention periods
     * @param jobName - Optional job name to cleanup specific job history
     * @param olderThanDays - Remove records older than this many days
     * @returns Number of documents deleted
     */
    async cleanupExecutionHistory(jobName?: string, olderThanDays = 30): Promise<number> {
        if (!this.persistenceEnabled || !this.executionModel) {
            this.logger.warn('Cannot cleanup execution history - persistence not enabled');
            return 0;
        }

        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

            const query: Record<string, unknown> = {
                executedAt: { $lt: cutoffDate },
            };

            if (jobName) {
                query.jobName = jobName;
            }

            const result = await this.executionModel.deleteMany(query);
            const deletedCount = result.deletedCount ?? 0;

            this.logger.log(
                `Cleaned up ${deletedCount} execution records older than ${olderThanDays} days`
            );

            return deletedCount;
        } catch (error) {
            this.logger.error('Failed to cleanup execution history');
            return 0;
        }
    }

    /**
     * Cleanup on module destroy
     */
    async onModuleDestroy(): Promise<void> {
        const jobNames = this.getAllJobNames();

        // eslint-disable-next-line no-restricted-syntax
        for (const name of jobNames) {
            try {
                // eslint-disable-next-line no-await-in-loop
                await this.removeCronJob(name);
            } catch (error) {
                this.logger.error(`Error removing cron job "${name}" during cleanup`);
            }
        }

        this.logger.log('All cron jobs cleaned up');
    }
}
