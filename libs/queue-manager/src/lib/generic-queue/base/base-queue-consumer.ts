import { Logger } from '@nestjs/common';

import { IJobData, IJobResult, QueueJob } from '../types/queue.types';

/**
 * Base class for queue job consumers
 * All processors should extend this class
 */
export abstract class BaseQueueConsumer<T extends IJobData = IJobData> {
    protected readonly logger: Logger;

    /**
     * Creates an instance of BaseQueueConsumer
     * @param {string} context - The context/name for logging
     */
    constructor(context: string) {
        this.logger = new Logger(context);
    }

    /**
     * Abstract process method to be implemented by subclasses
     * @param {QueueJob<T>} job - The job to process with typed data
     * @returns {Promise<IJobResult>} The result of job processing
     */
    abstract process(job: QueueJob<T>): Promise<IJobResult>;

    /**
     * Safely execute job processing with error handling
     * @param {QueueJob<T>} job - The job to process
     * @returns {Promise<IJobResult>} The result with error handling
     */
    async executeJob(job: QueueJob<T>): Promise<IJobResult> {
        try {
            this.logger.debug(`Executing job: ${job.jobType}`);
            return await this.process(job);
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.logger.error(`Job execution failed: ${err.message}`);
            return {
                success: false,
                error: err.message,
            };
        }
    }
}
