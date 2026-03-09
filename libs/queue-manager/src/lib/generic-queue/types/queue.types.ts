import { QueuePriorityEnum } from '../enums/queue-priority-enum';

export interface IJobData {
    [key: string]: unknown;
}

export interface IJobResult {
    success: boolean;
    data?: unknown;
    error?: string;
}

export interface IJobProcessingOptions {
    concurrency?: number;
    visibilityTimeoutSeconds?: number;
    pollIntervalMs?: number;
    maxRetries?: number;
}

/**
 * Enum for standard job types
 */
export enum JobType {
    TEST = 'test',
    HEALTH_CHECK = 'health_check',
}

/**
 * Job status
 */
export enum JobStatus {
    PENDING = 'pending',
    PROCESSING = 'processing',
    COMPLETED = 'completed',
    FAILED = 'failed',
    RETRY = 'retry',
}

export interface QueueJob<TPayload extends IJobData = IJobData> {
    id: string;
    ackToken: string;
    jobType: string;
    payload: TPayload;
    tries: number;
    visibleUntil: Date;
    priority: QueuePriorityEnum;
    createdAt: Date;
    order?: number;
}

export type QueueJobHandler<TPayload extends IJobData = IJobData> = (
    job: QueueJob<TPayload>
) => Promise<IJobResult>;

export interface ResolvedJobProcessingOptions {
    concurrency: number;
    visibilityTimeoutSeconds: number;
    pollIntervalMs: number;
    maxRetries: number;
}

export interface QueueJobDefinition<TPayload extends IJobData = IJobData> {
    jobType: string;
    handler: QueueJobHandler<TPayload>;
    options: ResolvedJobProcessingOptions;
}

export interface QueueWorkerState {
    jobType: string;
    promise: Promise<void>;
}
