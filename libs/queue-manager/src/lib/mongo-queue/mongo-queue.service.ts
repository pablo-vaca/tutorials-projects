/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable consistent-return */
/* eslint-disable @typescript-eslint/return-await */
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DeleteResult, InsertManyResult } from 'mongodb';
import { Model } from 'mongoose';

import {
    DEFAULT_DELAY_SECONDS,
    DEFAULT_MAX_RETRIES,
    DEFAULT_VISIBILITY_TIMEOUT_SECONDS,
    MONGO_QUEUE_COLLECTION,
} from './constants/mongo-queue.constants';
import { QueuePriorityEnum, QueueStatusEnum } from './enums/queue-priority-enum';
import { MongoQueueUtilsService } from './mongo-queue-utils.service';
import { QueueDocument } from './schemas/queue.document';
import { QueueMessage } from './types/mongo-queue.types';
import {
    IQueueProvider,
    QueueMessagePayload,
    QueueProviderMessage,
    QueueProviderOptions,
} from '../generic-queue/interfaces/queue-provider.interface';

/**
 * MongoDB implementation of the IQueueProvider interface.
 * Provides persistent queue storage using MongoDB with support for
 * visibility timeouts, retries, and atomic operations.
 */
@Injectable()
export class MongoQueueService implements IQueueProvider {
    private readonly logger = new Logger(MongoQueueService.name);

    /**
     *
     * @param utils
     * @param queueCollection
     */
    constructor(
        private readonly utils: MongoQueueUtilsService,
        @InjectModel(MONGO_QUEUE_COLLECTION)
        private readonly queueCollection: Model<QueueDocument>
    ) {}

    /**
     *
     * @param ack
     */
    async ack(ack: string): Promise<string | undefined> {
        try {
            const message = await this.queueCollection.findOneAndUpdate(
                {
                    ack,
                    deleted: null,
                    visible: { $gt: this.utils.now() },
                },
                {
                    $set: {
                        deleted: this.utils.now(),
                        status: QueueStatusEnum.COMPLETED,
                    },
                },
                { new: true, lean: true }
            );

            return message?._id?.toString();
        } catch (error) {
            this.logger.error(
                'Failed to acknowledge queue job',
                error instanceof Error ? error.stack : error
            );
            throw error instanceof Error ? error : new Error(String(error));
        }
    }

    /**
     *
     * @param ack
     */
    async ackFail(ack: string): Promise<string | undefined> {
        try {
            const message = await this.queueCollection.findOneAndUpdate(
                {
                    ack,
                    deleted: null,
                    visible: { $gt: this.utils.now() },
                },
                {
                    $set: {
                        deleted: this.utils.now(),
                        status: QueueStatusEnum.FAILED,
                    },
                },
                { new: true, lean: true }
            );

            return message?._id?.toString();
        } catch (error) {
            this.logger.error(
                'Failed to acknowledge queue job',
                error instanceof Error ? error.stack : error
            );
            throw error instanceof Error ? error : new Error(String(error));
        }
    }

    /**
     *
     * @param ack
     * @param lastError
     */
    async ackError(ack: string, lastError: string): Promise<string | undefined> {
        try {
            const message = await this.queueCollection.findOneAndUpdate(
                {
                    ack,
                    deleted: null,
                    visible: { $gt: this.utils.now() },
                },
                {
                    $set: {
                        lastError,
                    },
                },
                { new: true, lean: true }
            );

            return message?._id?.toString();
        } catch (error) {
            this.logger.error(
                'Failed to acknowledge queue job',
                error instanceof Error ? error.stack : error
            );
            throw error instanceof Error ? error : new Error(String(error));
        }
    }

    /**
     * Add one or more jobs to the queue (IQueueProvider implementation)
     * @param data - Single job or array of jobs to enqueue
     * @param opts - Optional queue configuration
     * @returns The ID(s) of the created job(s)
     */
    async add<TPayload = unknown>(
        data: QueueMessagePayload<TPayload> | QueueMessagePayload<TPayload>[],
        opts?: QueueProviderOptions
    ): Promise<string | string[] | undefined> {
        try {
            const delay = opts?.delaySeconds ?? DEFAULT_DELAY_SECONDS;
            const visibleDate = delay ? this.utils.nowPlusSeconds(delay) : this.utils.now();

            const payloads = Array.isArray(data) ? data : [data];

            if (payloads.length === 0) {
                throw new Error(
                    'MongoQueueService.add(): payload array length must be greater than 0'
                );
            }

            const messages: QueueMessage<TPayload>[] = payloads.map((payload) => ({
                payload,
                priority: opts?.priority ?? QueuePriorityEnum.MEDIUM,
                order: opts?.order ?? 0,
                visible: visibleDate,
                ack: null,
                tries: 0,
                deleted: null,
                status: QueueStatusEnum.PENDING,
                producer: opts?.producer ?? 'not-producer',
            }));

            const result = (await this.queueCollection.insertMany(messages, {
                ordered: true,
                rawResult: true,
            })) as InsertManyResult;

            if (!result) {
                return;
            }

            const insertedIds = Object.values(result.insertedIds).map((value) => value.toString());

            return Array.isArray(data) ? insertedIds : insertedIds[0];
        } catch (error) {
            this.logger.error(
                'Failed to add job(s) to queue',
                error instanceof Error ? error.stack : error
            );
            throw error instanceof Error ? error : new Error(String(error));
        }
    }

    /**
     *
     * @param data
     * @param opts
     */
    async addUnique<TPayload = unknown>(
        data: QueueMessagePayload<TPayload>,
        opts?: QueueProviderOptions
    ): Promise<string | undefined> {
        try {
            const delay = opts?.delaySeconds ?? DEFAULT_DELAY_SECONDS;
            const visibleDate = delay ? this.utils.nowPlusSeconds(delay) : this.utils.now();

            const queueDoc: QueueMessage<TPayload> = {
                payload: data,
                visible: visibleDate,
                priority: opts?.priority,
                ack: null,
                tries: 0,
                deleted: null,
                order: opts?.order ?? 0,
                status: QueueStatusEnum.PENDING,
                producer: opts?.producer ?? 'not-producer',
            };
            const existUnprocessedJob = await this.queueCollection.findOne({
                deleted: null,
                'payload.jobType': data.jobType,
            });
            if (!existUnprocessedJob) {
                const result = await this.queueCollection.insertOne(queueDoc);
                if (!result) {
                    return;
                }
                return result._id as string;
            }
            this.logger.debug(`Add unique job: ${data.jobType}`);
        } catch (error) {
            this.logger.error(
                'Failed to add unique job(s) to queue',
                error instanceof Error ? error.stack : error
            );
            throw error instanceof Error ? error : new Error(String(error));
        }
    }

    /**
     * Fetch a job from the queue for processing (IQueueProvider implementation)
     * @param jobTypes - Array of job types to retrieve
     * @param opts - Optional queue configuration
     * @returns A message if available, undefined otherwise
     */
    async get<TPayload = unknown>(
        jobTypes: string[],
        opts?: QueueProviderOptions
    ): Promise<QueueProviderMessage<TPayload> | undefined> {
        try {
            const message = await this.fetchMessage<TPayload>(jobTypes, opts);

            if (!message) {
                return;
            }

            const maxRetries = opts?.maxRetries ?? DEFAULT_MAX_RETRIES;

            if (message.tries > maxRetries) {
                await this.ackFail(message.ack);
                return this.get(jobTypes, opts);
            }

            return message;
        } catch (error) {
            this.logger.error(
                'Failed to get job from queue',
                error instanceof Error ? error.stack : error
            );
            throw error instanceof Error ? error : new Error(String(error));
        }
    }

    /**
     * NOTE: add control by permissions
     * @param filter
     * @returns Result of the cleanup operation
     */
    async removeByFilter(filter: Record<string, any>): Promise<number> {
        try {
            // Only delete non-deleted jobs to avoid interfering with acknowledged ones
            const result = await this.queueCollection.deleteMany({
                deleted: null,
                ...filter,
            });
            return result?.deletedCount ?? 0;
        } catch (error) {
            this.logger.error('Failed to remove jobs by filter', error);
            throw error;
        }
    }

    /**
     * Clean up deleted/processed jobs
     * @returns Result of the cleanup operation
     */
    async clean(): Promise<DeleteResult | undefined> {
        try {
            const deletedResult = await this.queueCollection.deleteMany({ deleted: { $ne: null } });
            return deletedResult ?? undefined;
        } catch (error) {
            this.logger.error(
                'Failed to clean queue items',
                error instanceof Error ? error.stack : error
            );
            throw error instanceof Error ? error : new Error(String(error));
        }
    }

    /**
     * Remove all jobs of a specific type (IQueueProvider implementation)
     * @param jobType - The job type to remove
     * @returns Number of jobs removed
     */
    async removeByJobType(jobType: string): Promise<number> {
        const result = await this.queueCollection.deleteMany({ 'payload.jobType': jobType });
        return result?.deletedCount ?? 0;
    }

    /**
     * Remove all jobs from the queue (IQueueProvider implementation)
     * @returns Number of jobs removed
     */
    async removeAll(): Promise<number> {
        const result = await this.queueCollection.deleteMany({});
        return result?.deletedCount ?? 0;
    }

    /**
     * Fetch a message from MongoDB with atomic locking
     * @param jobTypes - Array of job types to retrieve
     * @param opts - Optional queue configuration
     * @returns A queue message if available
     * @private
     */
    private async fetchMessage<TPayload = unknown>(
        jobTypes: string[],
        opts?: QueueProviderOptions
    ): Promise<QueueProviderMessage<TPayload> | undefined> {
        const visibilitySeconds = opts?.visibilitySeconds ?? DEFAULT_VISIBILITY_TIMEOUT_SECONDS;

        const result = await this.queueCollection.findOneAndUpdate<QueueDocument<TPayload>>(
            {
                deleted: null,
                visible: { $lte: this.utils.now() },
                'payload.jobType': { $in: jobTypes },
                $or: [
                    { status: { $exists: false } },
                    { status: { $in: [QueueStatusEnum.PENDING, QueueStatusEnum.IN_PROGRESS] } },
                ],
            },
            {
                $inc: { tries: 1 },
                $set: {
                    ack: this.utils.id(),
                    visible: this.utils.nowPlusSeconds(visibilitySeconds),
                    status: QueueStatusEnum.IN_PROGRESS,
                },
            },
            {
                new: true,
                sort: { order: 1, priority: -1 },
                lean: true,
            }
        );

        if (!result) {
            return;
        }

        if (!result.ack) {
            // Defensive guard – ack should always be present after update
            throw new Error('Queue message is missing acknowledgement token');
        }

        return {
            ack: result.ack,
            id: result._id.toString(),
            jobType: result.payload.jobType,
            payload: result.payload.payload as TPayload,
            tries: result.tries,
            visible: result.visible,
            priority: result.priority,
            createdAt: result.createdAt,
            order: result.order ?? 0,
            status: result.status,
            producer: 'not-producer',
        };
    }
}
