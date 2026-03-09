/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable max-lines-per-function */
import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { GenericQueueService, JobType } from '@deal-insights/shared-nestjs-utils';

import EtlQueueController from './etl.queue.controller';

describe('EtlQueueController', () => {
    let controller: EtlQueueController;
    let queueService: jest.Mocked<GenericQueueService>;
    let logger: jest.Mocked<Logger>;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [EtlQueueController],
            providers: [
                {
                    provide: GenericQueueService,
                    useValue: {
                        queueJob: jest.fn(),
                        purgeJobsByName: jest.fn(),
                    },
                },
                {
                    provide: Logger,
                    useValue: {
                        debug: jest.fn(),
                    },
                },
            ],
        }).compile();

        controller = module.get<EtlQueueController>(EtlQueueController);
        queueService = module.get(GenericQueueService);
        logger = module.get(Logger);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });

    describe('queueTestJob', () => {
        it('should queue a successful job when status is "success"', async () => {
            const mockJobId = 'job-123';
            queueService.queueJob.mockResolvedValue(mockJobId as any);

            const result = await controller.queueTestJob('success');

            expect(logger.debug).toHaveBeenCalledWith(' > POST /test-queue-job');
            expect(queueService.queueJob).toHaveBeenCalledWith(JobType.TEST, {
                message: 'This is a successful job',
                status: 'success',
            });
            expect(result).toEqual({
                jobId: mockJobId,
                name: JobType.TEST,
                message: 'This is a successful job',
            });
        });

        it('should queue a failing job when status is "fail"', async () => {
            const mockJobId = 'job-666';
            queueService.queueJob.mockResolvedValue(mockJobId as any);

            const result = await controller.queueTestJob('fail');

            expect(queueService.queueJob).toHaveBeenCalledWith(JobType.TEST, {
                message: 'This job will fail',
                status: 'fail',
            });
            expect(result.message).toBe('This job will fail');
        });
    });

    describe('cleanupTestJobs', () => {
        it('should call purgeJobsByName and return the count of removed jobs', async () => {
            const removedCount = 5;
            queueService.purgeJobsByName.mockResolvedValue(removedCount as any);

            const result = await controller.cleanupTestJobs();

            expect(logger.debug).toHaveBeenCalledWith(' > POST /cleanup-test-jobs');
            expect(queueService.purgeJobsByName).toHaveBeenCalledWith(JobType.TEST);
            expect(result).toEqual({
                message: `Cleaned up ${removedCount} test jobs`,
                removed: removedCount,
            });
        });
    });
});
