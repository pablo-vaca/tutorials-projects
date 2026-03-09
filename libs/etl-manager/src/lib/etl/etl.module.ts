/* eslint-disable max-lines-per-function */

import { HttpModule } from '@nestjs/axios';
import { Module, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { v4 as uuidv4 } from 'uuid';

import {
    CronJobsModule,
    CronJobsService,
    CronTimeExpression,
    GenericQueueModule,
    GenericQueueService,
    JobType,
    TimeZone,
} from '@deal-insights/shared-nestjs-utils';

import { DocumentClassificationController } from './controllers/document-classification.controller';
import EtlController from './controllers/etl.controller';
import EtlQueueController from './controllers/etl.queue.controller';
import SemaphoreController from './controllers/semaphore.controller';
import {
    EtlDeltaSyncForAllActiveProjectsJobData,
    EtlJobData,
    EtlJobProcessor,
    EtlJobType,
} from './jobs';
import { ClearProjectDataHandler } from './jobs/handlers/clear-project-data.handle';
import { TestHandler } from './jobs/handlers/test.handler';
import {
    S3DataSource,
    S3DataSourceSchema,
    SharePointDataSource,
    SharePointDataSourceSchema,
} from './schemas';
import { Chunk, ChunkSchema } from './schemas/chunk.schema';
import { EtlConfig, EtlConfigSchema } from './schemas/etl-config.schema';
import { File, FileSchema } from './schemas/file.schema';
import { GlobalCounter, GlobalCounterSchema } from './schemas/global-counter.schema';
import { PdfFile, PdfFileSchema } from './schemas/pdffile.schema';
import { Semaphore, SemaphoreSchema } from './schemas/semaphore.schema';
import { Vector, VectorSchema } from './schemas/vector.schema';
import ChunkMongoService from './services/chunk-mongo.service';
import { DocumentClassifierService } from './services/document-classification.service';
import DocumentProcessingClient from './services/document-processing-client';
import EmbeddingsClient from './services/embeddings-client';
import ChunkProcessorService from './services/etl-chunks.service';
import EtlConfigService from './services/etl-config.service';
import EtlEmbeddingProcessorService from './services/etl-embeddings-processor.service';
import EtlImageMarkdownService from './services/etl-image-markdown.service';
import EtlSharedService from './services/etl-shared.service';
import EtlService from './services/etl.service';
import FileService from './services/file.service';
import PdfFileService from './services/pdf-file.service';
import PdfImagesService from './services/pdf-images.service';
import { SemaphoreService } from './services/semaphore.service';
import SharepointSyncOrchestrator from './services/sharepoint-sync-orchestrator.service';
import SharepointService from './services/sharepoint.service';
import VectorService from './services/vector.service';
import LLMModule from '../LLM/llm.module';
import AuthApiService from '../auth/auth-api.service';
import { FeatureFlagModule } from '../feature-flag/feature-flag.module';
import { MastraModule } from '../mastra/mastra.module';

@Module({
    imports: [
        CronJobsModule.forRoot({ enablePersistence: true }),
        FeatureFlagModule,
        GenericQueueModule.forRoot(),
        HttpModule,
        LLMModule,
        MastraModule,
        FeatureFlagModule,
        MongooseModule.forFeature([
            { name: Chunk.name, schema: ChunkSchema },
            {
                name: EtlConfig.name,
                schema: EtlConfigSchema,
                discriminators: [
                    { name: S3DataSource.name, schema: S3DataSourceSchema },
                    { name: SharePointDataSource.name, schema: SharePointDataSourceSchema },
                ],
            },
            { name: File.name, schema: FileSchema },
            { name: PdfFile.name, schema: PdfFileSchema },
            { name: Semaphore.name, schema: SemaphoreSchema },
            { name: Vector.name, schema: VectorSchema },
            { name: GlobalCounter.name, schema: GlobalCounterSchema },
        ]),
    ],
    controllers: [
        EtlController,
        EtlQueueController,
        SemaphoreController,
        DocumentClassificationController,
    ],
    providers: [
        AuthApiService,
        ChunkMongoService,
        ChunkProcessorService,
        DocumentClassifierService,
        DocumentProcessingClient,
        EtlEmbeddingProcessorService,
        EmbeddingsClient,
        EtlConfigService,
        EtlImageMarkdownService,
        EtlJobProcessor,
        EtlService,
        EtlSharedService,
        FileService,
        Logger,
        PdfFileService,
        PdfImagesService,
        SemaphoreService,
        SharepointService,
        SharepointSyncOrchestrator,
        VectorService,
        TestHandler,
        ClearProjectDataHandler,
    ],
    exports: [
        EtlConfigService,
        EtlService,
        FileService,
        SharepointService,
        SharepointSyncOrchestrator,
        PdfImagesService,
        PdfFileService,
        Logger,
        EtlSharedService,
        SemaphoreService,
        TestHandler,
        ClearProjectDataHandler,
    ],
})
export default class EtlModule {
    private readonly logger = new Logger(EtlModule.name);

    /**
     *
     * @param queueService
     * @param etlJobProcessor
     * @param cronJobsService
     * @param configService
     */
    constructor(
        private readonly queueService: GenericQueueService,
        private readonly etlJobProcessor: EtlJobProcessor,
        private readonly cronJobsService: CronJobsService,
        private readonly configService: ConfigService
    ) {}

    /**
     *
     */
    private registerEtlNewProcessor() {
        const jobTypes = [
            EtlJobType.DOWNLOAD_FILE,
            EtlJobType.ANALYZE_FILE,
            EtlJobType.SPLIT_PAGES,
            EtlJobType.GENERATE_MARKDOWNS,
            EtlJobType.MARKDOWN_TO_CHUNKS,
            EtlJobType.SHAREPOINT_DELTA_SYNC_PROJECT,
        ];

        jobTypes.forEach((jobType) =>
            this.queueService.defineJob<EtlJobData>(
                jobType,
                (job) => this.etlJobProcessor.process(job),
                {
                    concurrency: 1,
                    visibilityTimeoutSeconds: 5 * 60,
                }
            )
        );
    }

    /**
     *
     */
    async onModuleInit() {
        // Register job processors
        this.queueService.defineJob<EtlJobData>(
            EtlJobType.ETL_UPLOAD_FILE,
            (job) => this.etlJobProcessor.process(job),
            {
                concurrency: 2,
                visibilityTimeoutSeconds: 5 * 60,
            }
        );

        this.queueService.defineJob<EtlJobData>(
            EtlJobType.ETL_CREATE_CHUNKS,
            (job) => this.etlJobProcessor.process(job),
            {
                concurrency: 3,
                visibilityTimeoutSeconds: 10 * 60,
            }
        );

        this.queueService.defineJob<EtlJobData>(
            EtlJobType.ETL_CREATE_EMBEDDINGS,
            (job) => this.etlJobProcessor.process(job),
            {
                concurrency: 1,
                visibilityTimeoutSeconds: 10 * 60,
            }
        );

        this.queueService.defineJob<EtlJobData>(
            EtlJobType.ETL_MOVE_TO_VECTORSTORE,
            (job) => this.etlJobProcessor.process(job),
            {
                concurrency: 2,
                visibilityTimeoutSeconds: 5 * 60,
            }
        );

        this.queueService.defineJob<EtlJobData>(
            EtlJobType.ETL_PROCESS_FULL,
            (job) => this.etlJobProcessor.process(job),
            {
                concurrency: 1,
                visibilityTimeoutSeconds: 60 * 60,
            }
        );

        this.queueService.defineJob<EtlJobData>(
            EtlJobType.ETL_PROCESS_SHAREPOINT_FILE,
            (job) => this.etlJobProcessor.process(job),
            {
                concurrency: 2,
                visibilityTimeoutSeconds: 30 * 60,
            }
        );

        this.queueService.defineJob<EtlJobData>(
            EtlJobType.ETL_SHAREPOINT_DELTA_DELETE,
            (job) => this.etlJobProcessor.process(job),
            {
                concurrency: 1,
                visibilityTimeoutSeconds: 10 * 60,
            }
        );

        this.queueService.defineJob<EtlJobData>(
            EtlJobType.ETL_SHAREPOINT_DELTA_UPSERT,
            (job) => this.etlJobProcessor.process(job),
            {
                concurrency: 1,
                visibilityTimeoutSeconds: 5 * 60,
            }
        );

        this.queueService.defineJob<EtlDeltaSyncForAllActiveProjectsJobData>(
            EtlJobType.SHAREPOINT_DELTA_SYNC,
            (job) => this.etlJobProcessor.processSyncAllProjects(job),
            {
                concurrency: 1,
                visibilityTimeoutSeconds: 5 * 60,
            }
        );

        this.queueService.defineJob<EtlJobData>(
            EtlJobType.FULL_MARKDOWN_PROCESS,
            (job) => this.etlJobProcessor.process(job),
            {
                concurrency: 1,
                visibilityTimeoutSeconds: 120 * 60,
            }
        );

        this.queueService.defineJob<EtlJobData>(
            EtlJobType.PDF_DOWNLOAD_AND_SPLIT,
            (job) => this.etlJobProcessor.process(job),
            {
                concurrency: 5,
                visibilityTimeoutSeconds: 2 * 60,
            }
        );

        this.queueService.defineJob<EtlJobData>(
            EtlJobType.PDF_MARKDOWN_PROCESS,
            (job) => this.etlJobProcessor.process(job),
            {
                concurrency: 5,
                visibilityTimeoutSeconds: 5 * 60,
            }
        );

        this.queueService.defineJob<EtlJobData>(
            EtlJobType.PDF_UPLOAD_PROCESS,
            (job) => this.etlJobProcessor.process(job),
            {
                concurrency: 5,
                visibilityTimeoutSeconds: 10 * 60,
            }
        );

        this.queueService.defineJob<EtlJobData>(
            EtlJobType.PDF_CHUNK_PROCESS,
            (job) => this.etlJobProcessor.process(job),
            {
                concurrency: 5,
                visibilityTimeoutSeconds: 1 * 60,
            }
        );

        this.queueService.defineJob<EtlJobData>(
            EtlJobType.PDF_LOCAL_CHUNK_PROCESS,
            (job) => this.etlJobProcessor.process(job),
            {
                concurrency: 20,
                visibilityTimeoutSeconds: 2 * 60,
            }
        );

        this.queueService.defineJob<EtlJobData>(
            EtlJobType.CLEAR_PROJECT_DATA,
            (job) => this.etlJobProcessor.process(job),
            {
                concurrency: 1,
                visibilityTimeoutSeconds: 10 * 60,
            }
        );

        this.queueService.defineJob<EtlJobData>(
            JobType.TEST,
            (job) => this.etlJobProcessor.process(job),
            {
                concurrency: 1,
                visibilityTimeoutSeconds: 5 * 60,
            }
        );

        this.registerEtlNewProcessor();

        // Start queue processor
        await this.queueService.startProcessing();

        const cronSchedule = this.configService.get<string>('SHAREPOINT_DELTA_SYNC_CRON');
        const isEnabled = !!cronSchedule;
        const ownerId = uuidv4();

        this.logger.debug(`[PROCESS] OwnerId: ${ownerId}`);

        if (isEnabled) {
            this.logger.debug(`SharePoint Delta Sync Cron: ENABLED (Schedule: ${cronSchedule})`);
        } else {
            this.logger.warn('SharePoint Delta Sync Cron: DISABLED');
        }

        await this.cronJobsService.registerCronJob(
            {
                name: 'sharepoint-delta-sync',
                cronTime: cronSchedule || CronTimeExpression.EVERY_5_MINUTES, // Fallback for registration
                runOnInit: true,
                enabled: isEnabled,
                timeZone: TimeZone.AMERICA_NEW_YORK,
            },
            async (context) => {
                await this.queueService.queueUniqueJob<EtlDeltaSyncForAllActiveProjectsJobData>(
                    EtlJobType.SHAREPOINT_DELTA_SYNC,
                    {
                        ownerId,
                    }
                );

                return { message: 'Delta sync queued', executedAt: context.executedAt };
            }
        );
    }
}
