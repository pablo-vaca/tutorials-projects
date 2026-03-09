
import { Injectable, Logger } from '@nestjs/common';

import { QueueJob, IJobResult } from '@deal-insights/shared-nestjs-utils';

import { SemaphoreService } from '../../services/semaphore.service';
import { ISingleEtlHandler } from '../single-etl-handler.interface';

@Injectable()
export class TestHandler implements ISingleEtlHandler<any> {
    private readonly logger = new Logger(TestHandler.name);

    /**
     *
     * @param semaphoreService
     * @param logger
     */
    constructor(
        private readonly semaphoreService: SemaphoreService,) {}

    /**
     *
     * @param job
     */
    async handle(job: QueueJob<any>): Promise<IJobResult> {
        this.logger.log(`[TEST] Starting test job: ${job.payload.testName}`);
        const response = await this.semaphoreService.acquire('TEST', 'TEST', job.payload.testName);
        try {
            if (!response.acquired) {
                this.logger.error(`[TEST ERROR] - ${job.payload.testName} - id: ${job.id}`);
                return {
                    success: false,
                    data: {
                        message: 'Test job not executed because the job process is blocked',
                        jobId: job.id,
                        payload: job.payload,
                    },
                };
            }

            this.logger.log(
                `--------------------------- ${job.payload.testName} -------------------------------------`
            );
            this.logger.log(
                `[TEST] - Resource locked, the token is ${response.token} and it expires at ${response.expiresAt}`
            );
            this.logger.log('----------------------------------------------------------------');
            // Your test logic here
            await new Promise((resolve) => {
                setTimeout(resolve, 30000);
            }); // Wait for 30 seconds
            this.logger.log(`[TEST] Test job data: ${JSON.stringify(job.payload)}`);

            if (job.payload.status === 'fail') {
                throw new Error('Intentional failure for testing purposes');
            }
            return {
                success: true,
                data: {
                    message: 'Test job completed successfully',
                    jobId: job.id,
                    payload: job.payload,
                },
            };
        } catch (error) {
            this.logger.error(`[TEST] Job failed: ${error.message}`);
            throw error;
        } finally {
            await this.semaphoreService.release(
                'TEST',
                'TEST',
                job.payload.testName,
                response.token
            );
            this.logger.log(`[TEST] Test job finished: ${job.payload.testName}`);
        }
    }
}
