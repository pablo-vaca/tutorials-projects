import { Injectable, OnModuleInit } from '@nestjs/common';

import { GenericQueueService, JobType } from '../index';
import { DemoJobProcessor, DemoJobPayload } from './demo-job.processor';

@Injectable()
export class DemoQueueLifecycle implements OnModuleInit {
    /**
     *
     * @param queueService
     * @param processor
     */
    constructor(
        private readonly queueService: GenericQueueService,
        private readonly processor: DemoJobProcessor
    ) {}

    /**
     * Wire demo job processing and seed a sample job once the module initializes.
     * @returns {Promise<void>} Completion when demo job is queued
     */
    async onModuleInit(): Promise<void> {
        this.queueService.defineJob<DemoJobPayload>(
            JobType.TEST,
            (job) => this.processor.process(job),
            {
                concurrency: 1,
                visibilityTimeoutSeconds: 60,
            }
        );

        await this.queueService.startProcessing();

        await this.queueService.queueJob(JobType.TEST, {
            message: 'Hello from the Mongo-backed queue!',
        });
    }
}

export default DemoQueueLifecycle;
