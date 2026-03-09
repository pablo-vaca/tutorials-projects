
import { Body,
    ClassSerializerInterceptor,
    Controller,
    Get,
    Post,
    Query,
    UseInterceptors, Logger } from '@nestjs/common';

import AllowControllerWithNoBearer from '../../app/common/allowControllerWithNoBearer';
import { SemaphoreService } from '../services/semaphore.service';

@Controller('semaphore')
@UseInterceptors(ClassSerializerInterceptor)
@AllowControllerWithNoBearer()
export default class SemaphoreController {
    private readonly logger = new Logger(SemaphoreController.name);

    /**
     *
     * @param semaphoreService
     * @param logger
     */
    constructor(
        private readonly semaphoreService: SemaphoreService,) {}

    /**
     *
     * @param {string} resource - a resource
     * @param {string} processType - a process type
     */
    @Get('/is-locked')
    async isLocked(@Query('resource') resource: string, @Query('processType') processType: string) {
        this.logger.log(
            `Getting if the resource: ${resource} for the process: ${processType} is locked`
        );
        return this.semaphoreService.isLocked(resource, processType);
    }

    /**
     *
     * @param resource
     * @param processType
     * @param ownerId
     */
    @Post('acquire')
    @UseInterceptors(ClassSerializerInterceptor)
    @AllowControllerWithNoBearer()
    async acquire(
        @Body('resource') resource: string,
        @Body('processType') processType: string,
        @Body('ownerId') ownerId: string
    ) {
        this.logger.log(
            `Acquiring the resource: ${resource} for the process: ${processType} by ${ownerId}`
        );
        return this.semaphoreService.acquire(resource, processType, ownerId);
    }

    /**
     *
     * @param resource
     * @param processType
     * @param ownerId
     * @param token
     */
    @Post('release')
    @UseInterceptors(ClassSerializerInterceptor)
    @AllowControllerWithNoBearer()
    async release(
        @Body('resource') resource: string,
        @Body('processType') processType: string,
        @Body('ownerId') ownerId: string,
        @Body('token') token: string
    ) {
        this.logger.log(
            `Releasing the resource: ${resource} for the process: ${processType} by ${ownerId}`
        );
        return this.semaphoreService.release(resource, processType, ownerId, token);
    }

    /**
     *
     * @param resource
     * @param processType
     * @param ownerId
     * @param token
     */
    @Post('refresh')
    @UseInterceptors(ClassSerializerInterceptor)
    @AllowControllerWithNoBearer()
    async refresh(
        @Body('resource') resource: string,
        @Body('processType') processType: string,
        @Body('ownerId') ownerId: string,
        @Body('token') token: string
    ) {
        this.logger.log(
            `Refreshing the resource: ${resource} for the process: ${processType} by ${ownerId}`
        );
        return this.semaphoreService.refresh(resource, processType, ownerId, token);
    }

    /**
     *
     * @param resource
     * @param processType
     */
    @Post('force-release')
    @UseInterceptors(ClassSerializerInterceptor)
    @AllowControllerWithNoBearer()
    async forceRelease(
        @Body('resource') resource: string,
        @Body('processType') processType: string
    ) {
        this.logger.log(`Refreshing the resource: ${resource} for the process: ${processType}`);
        return this.semaphoreService.forceRelease(resource, processType);
    }
}
