import { BaseQueueConsumer, IJobData, IJobResult, JobType, QueueJob } from '../index';

/**
 * Example test job processor
 * Demonstrates basic job processing
 */
export class TestJobProcessor extends BaseQueueConsumer<IJobData> {
    /**
     * Creates a test job processor for demo purposes
     */
    constructor() {
        super('TestJobProcessor');
    }

    /**
     * Processes an inbound queue job
     * @param {QueueJob<IJobData>} job - Queue job containing the payload to process
     * @returns {Promise<IJobResult>} Resolves with processed job result
     */
    async process(job: QueueJob<IJobData>): Promise<IJobResult> {
        try {
            this.logger.log(`Processing test job: ${job.jobType}`);

            switch (job.jobType) {
                case JobType.TEST:
                    return await this.handleTest(job);

                case JobType.HEALTH_CHECK:
                    return await this.handleHealthCheck(job);

                default:
                    return {
                        success: false,
                        error: `Unknown test job: ${job.jobType}`,
                    };
            }
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.logger.error(`Test job failed: ${err.message}`, err.stack);
            // Re-throw the error so Agenda treats it as a failure
            throw err;
        }
    }

    /**
     * Handles the test job variant
     * @param {QueueJob<IJobData>} job - Queue job under processing
     * @returns {Promise<IJobResult>} Result of test job handling
     */
    private async handleTest(job: QueueJob<IJobData>): Promise<IJobResult> {
        this.logger.log('Executing test action');

        // Simulate work
        await new Promise<void>((resolve) => {
            setTimeout(() => resolve(), 1000);
        });

        return {
            success: true,
            data: {
                message: 'Test action completed successfully',
                jobId: job.id,
                timestamp: new Date().toISOString(),
                payload: job.payload,
            },
        };
    }

    /**
     * Handles the health check job variant
     * @param {QueueJob<IJobData>} job - Queue job under processing
     * @returns {Promise<IJobResult>} Result of health check handling
     */
    private async handleHealthCheck(job: QueueJob<IJobData>): Promise<IJobResult> {
        this.logger.log('Executing health check');

        return {
            success: true,
            data: {
                message: 'Health check passed',
                jobId: job.id,
                status: 'healthy',
                timestamp: new Date().toISOString(),
            },
        };
    }
}
