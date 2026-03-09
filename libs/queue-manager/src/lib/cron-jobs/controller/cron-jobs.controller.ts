import {
    ClassSerializerInterceptor,
    Controller,
    Get,
    Logger,
    Post,
    Param,
    UseInterceptors,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';

import { CronJobsService } from '../services/cron-jobs.service';

/**
 * Cron Jobs Management Controller
 * Provides endpoints for managing cron jobs generically using only job names
 * Works with any cron job registered in the system
 *
 * Note: This controller does not include authentication/authorization decorators.
 * Applications should apply their own guards/decorators as needed.
 */
@Controller('cron-jobs')
@UseInterceptors(ClassSerializerInterceptor)
export class CronJobsController {
    /**
     *
     * @param cronUtilsService
     * @param logger
     */
    private readonly logger = new Logger(CronJobsController.name);

    constructor(private readonly cronUtilsService: CronJobsService) {}

    /**
     * Get metadata for a specific cron job
     * @param jobName
     */
    @Get(':jobName')
    async getJobMetadata(@Param('jobName') jobName: string) {
        this.logger.debug(` > GET /cron-jobs/${jobName}`);

        const metadata = this.cronUtilsService.getJobMetadata(jobName);

        if (!metadata) {
            return {
                error: `Cron job "${jobName}" not found`,
                availableJobs: this.cronUtilsService.getAllJobNames(),
            };
        }

        return {
            name: jobName,
            ...metadata,
            successRate:
                metadata.executionCount > 0
                    ? `${(
                          ((metadata.executionCount - metadata.failureCount) /
                              metadata.executionCount) *
                          100
                      ).toFixed(2)}%`
                    : 'N/A',
        };
    }

    /**
     * Manually execute a cron job
     * @param jobName
     */
    @Post(':jobName/execute')
    @HttpCode(HttpStatus.OK)
    async executeJob(@Param('jobName') jobName: string) {
        this.logger.debug(` > POST /cron-jobs/${jobName}/execute`);

        try {
            const result = await this.cronUtilsService.executeCronJob(jobName);

            return {
                jobName,
                success: result.success,
                duration: result.duration,
                executedAt: result.context.executedAt,
                data: result.data,
                error: result.error?.message,
            };
        } catch (error) {
            return {
                jobName,
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * Enable a cron job
     * @param jobName
     */
    @Post(':jobName/enable')
    @HttpCode(HttpStatus.OK)
    async enableJob(@Param('jobName') jobName: string) {
        this.logger.debug(` > POST /cron-jobs/${jobName}/enable`);

        try {
            await this.cronUtilsService.enableCronJob(jobName);
            return {
                jobName,
                enabled: true,
                message: `Cron job "${jobName}" enabled successfully`,
            };
        } catch (error) {
            return {
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * Disable a cron job
     * @param jobName
     */
    @Post(':jobName/disable')
    @HttpCode(HttpStatus.OK)
    async disableJob(@Param('jobName') jobName: string) {
        this.logger.debug(` > POST /cron-jobs/${jobName}/disable`);

        try {
            await this.cronUtilsService.disableCronJob(jobName);
            return {
                jobName,
                enabled: false,
                message: `Cron job "${jobName}" disabled successfully`,
            };
        } catch (error) {
            return {
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * Restart a cron job by name
     * Removes and re-registers the job with its current configuration
     * @param jobName
     */
    @Post(':jobName/restart')
    @HttpCode(HttpStatus.OK)
    async restartJob(@Param('jobName') jobName: string) {
        this.logger.debug(` > POST /cron-jobs/${jobName}/restart`);

        try {
            await this.cronUtilsService.restartCronJob(jobName);

            return {
                jobName,
                message: `Cron job "${jobName}" restarted successfully`,
            };
        } catch (error) {
            return {
                error: error instanceof Error ? error.message : String(error),
                message: 'Failed to restart cron job',
            };
        }
    }
}
