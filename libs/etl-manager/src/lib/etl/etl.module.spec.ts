/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable max-lines-per-function */
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { GenericQueueService, CronJobsService } from '@deal-insights/shared-nestjs-utils';

import EtlModule from './etl.module';
import { EtlJobProcessor, EtlJobType } from './jobs';
import SharepointSyncOrchestrator from './services/sharepoint-sync-orchestrator.service';

describe('EtlModule', () => {
    let etlModule: EtlModule;
    let queueService: jest.Mocked<GenericQueueService>;
    let cronJobsService: jest.Mocked<CronJobsService>;
    let configService: jest.Mocked<ConfigService>;
    let etlJobProcessor: jest.Mocked<EtlJobProcessor>;

    beforeEach(async () => {
        // Create dynamic mocks for dependencies
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                EtlModule,
                {
                    provide: GenericQueueService,
                    useValue: {
                        defineJob: jest.fn(),
                        startProcessing: jest.fn().mockResolvedValue(undefined),
                        queueJob: jest.fn().mockResolvedValue(undefined),
                    },
                },
                {
                    provide: EtlJobProcessor,
                    useValue: {
                        process: jest.fn(),
                    },
                },
                {
                    provide: CronJobsService,
                    useValue: {
                        registerCronJob: jest.fn(),
                    },
                },
                {
                    provide: SharepointSyncOrchestrator,
                    useValue: {},
                },
                {
                    provide: ConfigService,
                    useValue: {
                        get: jest.fn(),
                    },
                },
                {
                    provide: Logger,
                    useValue: {
                        info: jest.fn(),
                    },
                },
            ],
        }).compile();

        etlModule = module.get<EtlModule>(EtlModule);
        queueService = module.get(GenericQueueService);
        cronJobsService = module.get(CronJobsService);
        configService = module.get(ConfigService);
        etlJobProcessor = module.get(EtlJobProcessor);
    });

    it('should be defined', () => {
        expect(etlModule).toBeDefined();
    });

    describe('onModuleInit', () => {
        it('should register all ETL jobs and start the queue processor', async () => {
            configService.get.mockReturnValue('*/5 * * * *'); // Mock cron schedule

            await etlModule.onModuleInit();

            // Verify core jobs are defined
            expect(queueService.defineJob).toHaveBeenCalledWith(
                EtlJobType.ETL_UPLOAD_FILE,
                expect.any(Function),
                expect.objectContaining({ concurrency: 2 })
            );

            expect(queueService.defineJob).toHaveBeenCalledWith(
                EtlJobType.ETL_PROCESS_FULL,
                expect.any(Function),
                expect.objectContaining({ concurrency: 1 })
            );

            // Verify secondary jobs from registerEtlNewProcessor
            expect(queueService.defineJob).toHaveBeenCalledWith(
                EtlJobType.DOWNLOAD_FILE,
                expect.any(Function),
                expect.any(Object)
            );

            // Verify processor start
            expect(queueService.startProcessing).toHaveBeenCalled();
        });

        it('should register the SharePoint delta sync cron job', async () => {
            const mockCron = '0 0 * * *';
            configService.get.mockReturnValue(mockCron);

            await etlModule.onModuleInit();

            expect(cronJobsService.registerCronJob).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'sharepoint-delta-sync',
                    cronTime: mockCron,
                    enabled: true,
                }),
                expect.any(Function)
            );
        });

        it('should fallback to default cron if config is missing', async () => {
            configService.get.mockReturnValue(null); // No config

            await etlModule.onModuleInit();

            expect(cronJobsService.registerCronJob).toHaveBeenCalledWith(
                expect.objectContaining({
                    enabled: false,
                    // Check if fallback from your module (EVERY_5_MINUTES) is used
                    cronTime: expect.any(String),
                }),
                expect.any(Function)
            );
        });
    });

    describe('Job Callbacks', () => {
        it('should route defined jobs to etlJobProcessor.process', async () => {
            await etlModule.onModuleInit();

            // Extract the callback passed to defineJob for a specific type
            const [[, callback]] = queueService.defineJob.mock.calls;
            const mockJob = { id: '123', data: {} } as any;

            await callback(mockJob);

            expect(etlJobProcessor.process).toHaveBeenCalledWith(mockJob);
        });
    });
});
