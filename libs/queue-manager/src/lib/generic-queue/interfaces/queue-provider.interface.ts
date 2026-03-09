import { QueuePriorityEnum, QueueStatusEnum } from '../enums/queue-priority-enum';

/**
 * Base options for queue operations
 */
export interface QueueProviderOptions {
    /** Delay before the job becomes visible (seconds) */
    delaySeconds?: number;
    /** How long the job is hidden after being fetched (seconds) */
    visibilitySeconds?: number;
    /** Maximum number of retry attempts */
    maxRetries?: number;
    /** Sorting priority */
    priority?: QueuePriorityEnum;
    /** External injected order */
    order?: number;
    //* * The Job producer (owner) */
    producer?: string;
}

/**
 * Message payload structure
 */
export interface QueueMessagePayload<TPayload = unknown> {
    jobType: string;
    payload: TPayload;
}

/**
 * Message returned from the queue
 */
export interface QueueProviderMessage<TPayload = unknown> {
    /** Unique message identifier */
    id: string;
    /** Acknowledgement token for deleting the message */
    ack: string;
    /** Job type identifier */
    jobType: string;
    /** The actual job payload */
    payload: TPayload;
    /** Number of times this job has been attempted */
    tries: number;
    /** When this message will become visible again */
    visible: Date;
    /**
     * When the job was originally created.
     * Providers that do not persist this value should return the current time
     * (i.e. `new Date()`) as a reasonable fallback.
     */
    createdAt: Date;
    /** Priority level for job fetching order */
    priority: QueuePriorityEnum;
    /** External injected order for job fetching */
    order: number;
    /** Current status of the job in the queue */
    status: QueueStatusEnum;
    /** Service or component that produced this job */
    producer: string;
}

/**
 * Abstract interface for queue storage providers.
 * Implement this interface to create custom queue backends (MongoDB, Redis, SQS, etc.)
 */
export interface IQueueProvider {
    /**
     * Add one or more jobs to the queue
     * @param data - Single job or array of jobs to enqueue
     * @param options - Optional queue configuration
     * @returns The ID(s) of the created job(s)
     */
    add<TPayload = unknown>(
        data: QueueMessagePayload<TPayload> | QueueMessagePayload<TPayload>[],
        options?: QueueProviderOptions
    ): Promise<string | string[] | undefined>;

    /**
     * Add a unique job to the queue (by QueueMessagePayload.jobType)
     * @param data - Single job or array of jobs to enqueue
     * @param options - Optional queue configuration
     * @returns The ID(s) of the created job(s)
     */
    addUnique<TPayload = unknown>(
        data: QueueMessagePayload<TPayload> | QueueMessagePayload<TPayload>[],
        options?: QueueProviderOptions
    ): Promise<string | string[] | undefined>;

    /**
     * Fetch a job from the queue for processing
     * @param jobTypes - Array of job types to retrieve
     * @param options - Optional queue configuration
     * @returns A message if available, undefined otherwise
     */
    get<TPayload = unknown>(
        jobTypes: string[],
        options?: QueueProviderOptions
    ): Promise<QueueProviderMessage<TPayload> | undefined>;

    /**
     * Acknowledge successful processing and remove job from queue
     * @param ack - Acknowledgement token from the fetched message
     * @returns The ID of the acknowledged job
     */
    ack(ack: string): Promise<string | undefined>;

    /**
     * Acknowledge successful processing and remove job from queue
     * @param ack - Acknowledgement token from the fetched message
     * @returns The ID of the acknowledged job
     */
    ackError(ack: string, error: string): Promise<string | undefined>;

    /**
     * Remove all jobs of a specific type
     * @param jobType - The job type to remove
     * @returns Number of jobs removed
     */
    removeByJobType(jobType: string): Promise<number>;

    /**
     * Remove all jobs from the queue
     * @returns Number of jobs removed
     */
    removeAll(): Promise<number>;

    /**
     * Clean up deleted/processed jobs (implementation-specific)
     * @returns Result of the cleanup operation
     */
    clean(): Promise<unknown>;
}
