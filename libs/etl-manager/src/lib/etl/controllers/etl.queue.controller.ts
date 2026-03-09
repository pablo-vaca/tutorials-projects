
import { ClassSerializerInterceptor,
    Controller,
    Param,
    Post,
    UseInterceptors, Logger } from '@nestjs/common';

import { GenericQueueService, JobType } from '@deal-insights/shared-nestjs-utils';

import AllowControllerWithNoBearer from '../../app/common/allowControllerWithNoBearer';

@Controller('etl')
@UseInterceptors(ClassSerializerInterceptor)
export default class EtlQueueController {
    private readonly logger = new Logger(EtlQueueController.name);

    /**
     *
     * @param queueService
     * @param logger
     */
    constructor(
        private readonly queueService: GenericQueueService,) {}

    /**
     *
     * @param status
     */
    @Post('/test-queue-job/:status')
    @AllowControllerWithNoBearer()
    async queueTestJob(@Param('status') status: 'success' | 'fail'): Promise<any> {
        this.logger.debug(' > POST /test-queue-job');
        const message = status === 'success' ? 'This is a successful job' : 'This job will fail';
        const jobId = await this.queueService.queueJob(JobType.TEST, {
            message,
            status,
        });
        return {
            jobId,
            name: JobType.TEST,
            message,
        };
    }

    /**
     *
     */
    @Post('/cleanup-test-jobs')
    @AllowControllerWithNoBearer()
    async cleanupTestJobs(): Promise<any> {
        this.logger.debug(' > POST /cleanup-test-jobs');
        const removed = await this.queueService.purgeJobsByName(JobType.TEST);
        return {
            message: `Cleaned up ${removed} test jobs`,
            removed,
        };
    }
}
