import { Injectable } from '@nestjs/common';

import { BaseQueueConsumer, IJobData, IJobResult, QueueJob } from '../index';

export interface DemoJobPayload extends IJobData {
    message: string;
}

@Injectable()
export class DemoJobProcessor extends BaseQueueConsumer<DemoJobPayload> {
    /**
     *
     */
    constructor() {
        super(DemoJobProcessor.name);
    }

    /**
     * Process the incoming demo queue job and capture metadata about the execution.
     * @param {QueueJob<DemoJobPayload>} job - Queue job containing the demo payload
     * @returns {Promise<IJobResult>} Resolved job result with execution metadata
     */
    async process(job: QueueJob<DemoJobPayload>): Promise<IJobResult> {
        this.logger.log(
            `Processing demo job (${job.jobType}) with message: ${job.payload.message}`
        );
        return {
            success: true,
            data: {
                jobId: job.id,
                receivedAt: new Date().toISOString(),
            },
        };
    }
}

export default DemoJobProcessor;
