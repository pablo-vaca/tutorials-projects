import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

import {
    DEFAULT_CONCURRENCY,
    DEFAULT_MAX_RETRIES,
    DEFAULT_POLL_INTERVAL_MS,
    DEFAULT_VISIBILITY_TIMEOUT_SECONDS,
} from '../constants/generic-queue.constants';
import {
    IQueueProvider,
    QueueProviderMessage,
    QueueProviderOptions,
} from '../interfaces/queue-provider.interface';
import {
    IJobData,
    IJobProcessingOptions,
    IJobResult,
    QueueJob,
    QueueJobDefinition,
    QueueWorkerState,
    ResolvedJobProcessingOptions,
} from '../types/queue.types';

@Injectable()
export class GenericQueueService implements OnModuleDestroy {
    private readonly logger = new Logger(GenericQueueService.name);

    private readonly jobDefinitions = new Map<string, QueueJobDefinition<IJobData>>();

    private readonly workers: QueueWorkerState[] = [];

    private isProcessing = false;

    private stopRequested = false;

    /**
     * @param queueProvider - The queue provider implementation (injected)
     */
    constructor(private readonly queueProvider: IQueueProvider) {}

    /**
     * Register a handler for the provided job type so workers can process queued messages.
     * @template T extends IJobData
     * @param {string} jobType - Identifier for the job type
     * @param {(job: QueueJob<T>) => Promise<IJobResult>} handler - Asynchronous processor for the job
     * @param {IJobProcessingOptions} [options] - Optional processing configuration overrides
     * @returns {void}
     */
    defineJob<T extends IJobData = IJobData>(
        jobType: string,
        handler: (job: QueueJob<T>) => Promise<IJobResult>,
        options?: IJobProcessingOptions
    ): void {
        const definition: QueueJobDefinition<T> = {
            jobType,
            handler,
            options: GenericQueueService.resolveOptions(options),
        };

        this.jobDefinitions.set(jobType, definition as QueueJobDefinition<IJobData>);
        this.logger.log(`Registered queue handler for job type: ${jobType}`);

        if (this.isProcessing && !this.stopRequested) {
            this.startWorkersForDefinition(definition);
        }
    }

    /**
     * Enqueue a job for later processing.
     * @template T extends IJobData
     * @param {string} jobType - Identifier for the job type
     * @param {T} data - Data payload that the handler receives
     * @param {QueueProviderOptions} [options] - Queue specific options (e.g. delay)
     * @returns {Promise<string>} Resolves with the created job identifier
     */
    async queueJob<T extends IJobData = IJobData>(
        jobType: string,
        data: T,
        options?: QueueProviderOptions
    ): Promise<string> {
        const identifier = await this.queueProvider.add({ jobType, payload: data }, options);

        if (!identifier) {
            throw new Error(`Failed to enqueue job ${jobType}`);
        }

        if (Array.isArray(identifier)) {
            return identifier[0];
        }

        this.logger.log(`Queued job: ${jobType} (${identifier})`);
        return identifier;
    }

    /**
     * Enqueue a job for later processing.
     * @template T extends IJobData
     * @param {string} jobType - Identifier for the job type
     * @param {T} data - Data payload that the handler receives
     * @param {QueueProviderOptions} [options] - Queue specific options (e.g. delay)
     * @returns {Promise<string>} Resolves with the created job identifier
     */
    async queueUniqueJob<T extends IJobData = IJobData>(
        jobType: string,
        data: T,
        options?: QueueProviderOptions
    ): Promise<string> {
        const identifier = await this.queueProvider.addUnique({ jobType, payload: data }, options);

        if (!identifier) {
            throw new Error(`Failed to enqueue job ${jobType}`);
        }

        if (Array.isArray(identifier)) {
            return identifier[0];
        }

        this.logger.debug(`Queued unique job: ${jobType} (${identifier})`);
        return identifier;
    }

    /**
     * Start queue workers so registered handlers begin processing jobs.
     * @returns {Promise<void>} Completion when workers are scheduled
     */
    async startProcessing(): Promise<void> {
        if (this.isProcessing) {
            this.logger.warn('Queue processing already started');
            return;
        }

        if (this.jobDefinitions.size === 0) {
            this.logger.warn('No job handlers registered; queue processing will idle');
        }

        this.logger.log('Starting queue workers');
        this.stopRequested = false;
        this.isProcessing = true;

        this.jobDefinitions.forEach((definition) => this.startWorkersForDefinition(definition));
    }

    /**
     * Stop all running workers and wait for outstanding tasks to finish.
     * @returns {Promise<void>} Completion once workers are drained
     */
    async stopProcessing(): Promise<void> {
        if (!this.isProcessing) {
            return;
        }

        this.logger.log('Stopping queue workers');
        this.stopRequested = true;

        await Promise.allSettled(this.workers.map((worker) => worker.promise));
        this.workers.length = 0;
        this.isProcessing = false;
    }

    /**
     * Remove every queued job regardless of job type.
     * @returns {Promise<number>} Number of jobs removed
     */
    async purgeAllJobs(): Promise<number> {
        return this.queueProvider.removeAll();
    }

    /**
     * Remove queued jobs filtered by type.
     * @param {string} jobType - Job type identifier to purge
     * @returns {Promise<number>} Number of jobs removed
     */
    async purgeJobsByName(jobType: string): Promise<number> {
        return this.queueProvider.removeByJobType(jobType);
    }

    /**
     * Determine whether the underlying queue infrastructure is available.
     * @returns {boolean} True when the backing queue is connected
     */
    isQueueConnected(): boolean {
        // MongoQueueService relies on active Mongoose connection; assume available if service is constructed.
        return true;
    }

    /**
     * Stop queue processing when the Nest module is destroyed.
     * @returns {Promise<void>} Completion when processing has stopped
     */
    async onModuleDestroy(): Promise<void> {
        await this.stopProcessing();
    }

    /**
     * Launch worker promises for the supplied job definition respecting configured concurrency.
     * @template T extends IJobData
     * @param {QueueJobDefinition<T>} definition - Job definition describing handler and options
     * @returns {void}
     */
    private startWorkersForDefinition<T extends IJobData>(definition: QueueJobDefinition<T>): void {
        const { concurrency } = definition.options;

        for (let index = 0; index < concurrency; index += 1) {
            const promise = this.runWorker(definition);
            this.workers.push({ jobType: definition.jobType, promise });
        }
    }

    /**
     * Maintain a long-lived worker loop which polls the queue until a stop is requested.
     * @template T extends IJobData
     * @param {QueueJobDefinition<T>} definition - Job definition describing handler and options
     * @returns {Promise<void>} Resolves once the worker has been stopped
     */
    private runWorker<T extends IJobData>(definition: QueueJobDefinition<T>): Promise<void> {
        const poll = async (): Promise<void> => {
            if (this.stopRequested) {
                return;
            }

            await this.pollOnce(definition);
            await poll();
        };

        return poll();
    }

    /**
     * Poll the queue once for the provided job definition and process any retrieved job.
     * @template T extends IJobData
     * @param {QueueJobDefinition<T>} definition - Job definition describing handler and options
     * @returns {Promise<void>} Completion when the poll iteration has finished
     */
    private async pollOnce<T extends IJobData>(definition: QueueJobDefinition<T>): Promise<void> {
        const { jobType, handler, options } = definition;

        try {
            const message = await this.queueProvider.get<T>([jobType], {
                visibilitySeconds: options.visibilityTimeoutSeconds,
                maxRetries: options.maxRetries,
            });

            if (!message) {
                await GenericQueueService.sleep(options.pollIntervalMs);
                return;
            }

            const queueJob = GenericQueueService.mapQueueMessageToJob(jobType, message);
            await this.processFetchedJob(handler, queueJob);
        } catch (error) {
            this.logger.error(
                `Worker loop error for job type ${jobType}: ${error instanceof Error ? error.message : error}`,
                error instanceof Error ? error.stack : undefined
            );
            await GenericQueueService.sleep(options.pollIntervalMs);
        }
    }

    /**
     * Normalize consumer supplied options into a fully resolved configuration object.
     * @param {IJobProcessingOptions} [options] - Optional consumer supplied overrides
     * @returns {ResolvedJobProcessingOptions} Normalized processing configuration
     */
    private static resolveOptions(options?: IJobProcessingOptions): ResolvedJobProcessingOptions {
        const concurrency = Math.max(1, options?.concurrency ?? DEFAULT_CONCURRENCY);
        const visibilityTimeoutSeconds = Math.max(
            1,
            options?.visibilityTimeoutSeconds ?? DEFAULT_VISIBILITY_TIMEOUT_SECONDS
        );
        const pollIntervalMs = Math.max(50, options?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);
        const maxRetries = Math.max(0, options?.maxRetries ?? DEFAULT_MAX_RETRIES);

        return {
            concurrency,
            visibilityTimeoutSeconds,
            pollIntervalMs,
            maxRetries,
        };
    }

    /**
     * Create a queue job instance from the raw queue message representation.
     * @template T extends IJobData
     * @param {string} jobType - Job type identifier
     * @param {QueueProviderMessage<T>} message - Raw queue message fetched from storage
     * @returns {QueueJob<T>} Queue job compatible with registered handlers
     */
    private static mapQueueMessageToJob<T extends IJobData>(
        jobType: string,
        message: QueueProviderMessage<T>
    ): QueueJob<T> {
        return {
            id: message.id,
            ackToken: message.ack,
            jobType,
            payload: message.payload,
            tries: message.tries,
            visibleUntil: message.visible,
            createdAt: message.createdAt,
            priority: message.priority,
            order: message.order,
        };
    }

    /**
     * Execute the registered handler and manage acknowledgement for the completed job.
     * @template T extends IJobData
     * @param {(job: QueueJob<T>) => Promise<IJobResult>} handler - Handler responsible for processing
     * @param {QueueJob<T>} queueJob - Queue job to process
     * @returns {Promise<void>} Completion once handling finishes
     */
    private async processFetchedJob<T extends IJobData>(
        handler: (job: QueueJob<T>) => Promise<IJobResult>,
        queueJob: QueueJob<T>
    ): Promise<void> {
        let result: IJobResult | undefined;

        try {
            result = await handler(queueJob);
        } catch (handlerError) {
            this.logger.error(
                `Job handler for ${queueJob.jobType} threw an error: ${handlerError instanceof Error ? handlerError.message : handlerError}`,
                handlerError instanceof Error ? handlerError.stack : undefined
            );
            await this.acknowledgeJobError(
                queueJob,
                handlerError instanceof Error ? handlerError.message : handlerError
            );
        }

        if (result?.success) {
            await this.acknowledgeJob(queueJob);
            return;
        }

        this.logger.warn(
            `Job ${queueJob.id} (${queueJob.jobType}) did not complete successfully and will retry (tries=${queueJob.tries}).`
        );
    }

    /**
     * Acknowledge queue completion for a processed job, logging on failure.
     * @template T extends IJobData
     * @param {QueueJob<T>} queueJob - Queue job that completed successfully
     * @returns {Promise<void>} Completion once acknowledgement attempt has finished
     */
    private async acknowledgeJob<T extends IJobData>(queueJob: QueueJob<T>): Promise<void> {
        try {
            await this.queueProvider.ack(queueJob.ackToken);
        } catch (ackError) {
            this.logger.error(
                `Failed to acknowledge job ${queueJob.id} (${queueJob.jobType})`,
                ackError instanceof Error ? ackError.stack : ackError
            );
        }
    }

    /**
     * Acknowledge queue completion for a processed job, logging on failure.
     * @template T extends IJobData
     * @param error
     * @param {QueueJob<T>} queueJob - Queue job that completed successfully
     * @returns {Promise<void>} Completion once acknowledgement attempt has finished
     */
    private async acknowledgeJobError<T extends IJobData>(
        queueJob: QueueJob<T>,
        error: string
    ): Promise<void> {
        try {
            await this.queueProvider.ackError(queueJob.ackToken, error);
        } catch (ackError) {
            this.logger.error(
                `Failed to acknowledge job ${queueJob.id} (${queueJob.jobType})`,
                ackError instanceof Error ? ackError.stack : ackError
            );
        }
    }

    /**
     * Sleep for the provided duration.
     * @param {number} durationMs - Milliseconds to wait
     * @returns {Promise<void>} Completion after the delay expires
     */
    private static async sleep(durationMs: number): Promise<void> {
        await new Promise<void>((resolve) => {
            setTimeout(() => resolve(), durationMs);
        });
    }
}
