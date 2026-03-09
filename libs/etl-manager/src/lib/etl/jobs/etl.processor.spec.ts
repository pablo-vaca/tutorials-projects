/* eslint-disable max-lines */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable max-lines-per-function */
import { Test, TestingModule } from '@nestjs/testing';

import {
    GenericQueueService,
    JobType,
    QueuePriorityEnum,
} from '@deal-insights/shared-nestjs-utils';

import { EtlJobType } from './etl-job.types';
import { EtlJobProcessor } from './etl.processor';
import { FeatureFlagEnum } from '../../feature-flag/enums/feature-flag.enum';
import { FeatureFlagService } from '../../feature-flag/feature-flag.service';
import { DataSourceType } from '../schemas';
import ChunkMongoService from '../services/chunk-mongo.service';
import ChunkProcessorService from '../services/etl-chunks.service';
import EtlConfigService from '../services/etl-config.service';
import EtlSharedService, { EtlAnalyzeNextStep } from '../services/etl-shared.service';
import EtlService from '../services/etl.service';
import FileService from '../services/file.service';
import { SemaphoreService } from '../services/semaphore.service';
import SharepointService from '../services/sharepoint.service';
import VectorService from '../services/vector.service';
import { ClearProjectDataHandler } from './handlers/clear-project-data.handle';
import { TestHandler } from './handlers/test.handler';
import EtlEmbeddingProcessorService from '../services/etl-embeddings-processor.service';

describe('EtlJobProcessor', () => {
    let processor: EtlJobProcessor;
    let etlService: EtlService;
    let queueService: GenericQueueService;
    let semaphoreService: SemaphoreService;
    let fileService: FileService;
    let etlSharedService: EtlSharedService;
    let chunkMongoService: ChunkMongoService;
    let chunkProcessorService: ChunkProcessorService;
    let sharepointService: SharepointService;
    let featureFlagService: FeatureFlagService;

    let mockLogger: {
        info: jest.Mock;
        debug: jest.Mock;
        error: jest.Mock;
        warn: jest.Mock;
        verbose: jest.Mock;
    };

    beforeEach(async () => {
        mockLogger = {
            info: jest.fn(),
            debug: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            verbose: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                EtlJobProcessor,
                {
                    provide: EtlService,
                    useValue: {
                        ensureEtlConfig: jest.fn(),
                        getConfigId: jest.fn(),
                        deltaSyncForAllActiveProjects: jest.fn(),
                        splitFileIntoPagesFromMongoFileId: jest.fn(),
                        convertImageFileToMarkdownFromMongoFileId: jest.fn(),
                        analyzeFile_ReturnNextStep: jest.fn(),
                        moveEmbeddingsToVectorstore: jest.fn(),
                        deleteFileByOriginId: jest.fn(),
                        uploadMarkdownFileAndGetChunks: jest.fn(),
                        downloadFileFromSource_StoreItInCache_CreateMongoFile: jest.fn(),
                        getImageContentFromMongoFile: jest.fn(),
                        uploadFileFromBuffer: jest.fn(),
                        deleteFileById: jest.fn(),
                        getMarkdownFromContent: jest.fn(),
                        removeTemporaryEtlFolder: jest.fn(),
                    },
                },
                { provide: EtlConfigService, useValue: { findById: jest.fn() } },
                {
                    provide: FileService,
                    useValue: {
                        findById: jest.fn(),
                        updateStatus: jest.fn(),
                        updateProjectId: jest.fn(),
                        findByFileOriginId: jest.fn(),
                        syncChunks: jest.fn(),
                        markEmbeddingsStored: jest.fn(),
                        updatePagesToProcess: jest.fn(),
                        findByFileOriginIdAndProjectId: jest.fn(),
                    },
                },
                {
                    provide: ChunkMongoService,
                    useValue: {
                        findByFileId: jest.fn(),
                        deleteByFileIds: jest.fn(),
                    },
                },
                { provide: VectorService, useValue: { deleteByFileId: jest.fn() } },
                { provide: GenericQueueService, useValue: { queueJob: jest.fn() } },
                { provide: ChunkProcessorService, useValue: { processChunks: jest.fn() } },
                {
                    provide: EtlEmbeddingProcessorService,
                    useValue: { processEmbeddings: jest.fn() },
                },
                {
                    provide: EtlSharedService,
                    useValue: {
                        resolveChunkSettings: jest.fn(),
                        resolveEmbeddingSettings: jest.fn(),
                    },
                },
                { provide: SemaphoreService, useValue: { acquire: jest.fn(), release: jest.fn() } },
                { provide: TestHandler, useValue: { handle: jest.fn() } },
                { provide: ClearProjectDataHandler, useValue: { handle: jest.fn() } },
                {
                    provide: SharepointService,
                    useValue: { initialize: jest.fn(), downloadFile: jest.fn() },
                },
                {
                    provide: FeatureFlagService,
                    useValue: {
                        isActive: jest.fn(),
                    },
                },
            ],
        }).compile();
        fileService = module.get<FileService>(FileService);
        processor = module.get<EtlJobProcessor>(EtlJobProcessor);
        etlService = module.get<EtlService>(EtlService);
        etlSharedService = module.get<EtlSharedService>(EtlSharedService);
        queueService = module.get<GenericQueueService>(GenericQueueService);
        semaphoreService = module.get<SemaphoreService>(SemaphoreService);
        chunkMongoService = module.get<ChunkMongoService>(ChunkMongoService);
        chunkProcessorService = module.get<ChunkProcessorService>(ChunkProcessorService);
        sharepointService = module.get<SharepointService>(SharepointService);
        featureFlagService = module.get<FeatureFlagService>(FeatureFlagService);

        // Inject mock logger into the processor (base class uses this.logger)
        (processor as any).logger = mockLogger;
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // --- 1. CORE DISPATCHER & EXPIRATION LOGIC ---
    describe('Core Logic', () => {
        it('should return failure if the job is expired (correlationId mismatch)', async () => {
            const job = {
                payload: { correlationId: 'OLD_ID' },
                jobType: EtlJobType.ETL_UPLOAD_FILE,
            };
            const mockConfig = { correlationId: 'NEW_ID' };

            jest.spyOn(processor as any, 'loadConfigForJob').mockResolvedValue(mockConfig);

            const result = await processor.process(job as any);

            expect(result.success).toBe(false);

            expect(mockLogger.warn).toHaveBeenCalled();
        });

        it('should use a strategy handler if registered', async () => {
            const job = { jobType: JobType.TEST, payload: { correlationId: 'abc' } };
            const mockConfig = { correlationId: 'abc' };

            jest.spyOn(processor as any, 'loadConfigForJob').mockResolvedValue(mockConfig);
            const handlerSpy = jest
                .spyOn((processor as any).handlers[JobType.TEST], 'handle')
                .mockResolvedValue({ success: true });

            await processor.process(job as any);
            expect(handlerSpy).toHaveBeenCalled();
        });
    });

    // --- 2. SEMAPHORE & CONCURRENCY ---
    describe('handleDeltaSyncForAllActiveProjects', () => {
        const mockJob = { id: 'job_sync', payload: { ownerId: 'user_1', testName: 'sync-test' } };

        it('should execute and release semaphore on success', async () => {
            (semaphoreService.acquire as any).mockResolvedValue({
                acquired: true,
                token: 'tkn',
            });
            (etlService.deltaSyncForAllActiveProjects as any).mockResolvedValue([]);

            await (processor as any).handleDeltaSyncForAllActiveProjects(mockJob);

            expect(semaphoreService.acquire).toHaveBeenCalled();
            expect(semaphoreService.release).toHaveBeenCalledWith(
                'DELTA_SYNC',
                'DELTA_SYNC',
                'user_1',
                'tkn'
            );
        });

        it('should release semaphore even if processing fails', async () => {
            (semaphoreService.acquire as any).mockResolvedValue({
                acquired: true,
                token: 'err-tkn',
            });
            (etlService.deltaSyncForAllActiveProjects as any).mockRejectedValue(new Error('Fatal'));

            await expect(
                (processor as any).handleDeltaSyncForAllActiveProjects(mockJob)
            ).rejects.toThrow('Fatal');

            expect(semaphoreService.release).toHaveBeenCalled();
        });
    });

    // --- 3. PAGE SPLITTING & ITERATIVE MARKDOWN ---
    describe('Iterative Processing (Split -> Markdown)', () => {
        const mockConfig = { projectId: 'p1', correlationId: 'c1' };

        it('should split file and initialize page queue', async () => {
            const mockJob = { payload: { mongoFileId: 'f1' } };
            (etlService.splitFileIntoPagesFromMongoFileId as any).mockResolvedValue([
                'p1.png',
                'p2.png',
            ]);

            await (processor as any).handleSplitFileIntoPages(mockJob, mockConfig);

            expect(queueService.queueJob).toHaveBeenCalledWith(
                EtlJobType.GENERATE_MARKDOWNS,
                expect.objectContaining({ iterationQueue: ['p1.png', 'p2.png'] }),
                undefined
            );
        });

        it('should process one page and re-queue remaining pages', async () => {
            const mockJob = {
                payload: {
                    mongoFileId: 'f1',
                    iterationQueue: ['page1.png', 'page2.png'],
                    processed: [],
                },
            };

            (etlService.convertImageFileToMarkdownFromMongoFileId as any).mockResolvedValue('md_1');

            await (processor as any).handleGenerateMarkdownsFromPages(mockJob, mockConfig);

            // Should remove page1 and queue page2
            expect(queueService.queueJob).toHaveBeenCalledWith(
                EtlJobType.GENERATE_MARKDOWNS,
                expect.objectContaining({
                    iterationQueue: ['page2.png'],
                    processed: ['md_1'],
                }),
                undefined
            );
        });

        it('should transition to CHUNKS when the page queue is empty', async () => {
            const mockJob = {
                payload: {
                    mongoFileId: 'f1',
                    iterationQueue: ['last_page.png'],
                    processed: ['prev_md'],
                },
            };

            (etlService.convertImageFileToMarkdownFromMongoFileId as any).mockResolvedValue(
                'last_md'
            );

            await (processor as any).handleGenerateMarkdownsFromPages(mockJob, mockConfig);

            expect(queueService.queueJob).toHaveBeenCalledWith(
                EtlJobType.MARKDOWN_TO_CHUNKS,
                expect.objectContaining({
                    iterationQueue: ['prev_md', 'last_md'],
                }),
                undefined
            );
        });
    });

    describe('Job Dispatching (Switch Cases)', () => {
        const mockConfig = { id: 'conf1', projectId: 'p1', correlationId: 'c1' };

        beforeEach(() => {
            jest.spyOn(processor as any, 'loadConfigForJob').mockResolvedValue(mockConfig);
        });

        it('should dispatch to handleUploadFile', async () => {
            const spy = jest
                .spyOn(processor as any, 'handleUploadFile')
                .mockResolvedValue({ success: true });
            await processor.process({
                jobType: EtlJobType.ETL_UPLOAD_FILE,
                payload: { correlationId: 'c1' },
            } as any);
            expect(spy).toHaveBeenCalled();
        });

        it('should dispatch to handleCreateChunks', async () => {
            const spy = jest
                .spyOn(processor as any, 'handleCreateChunks')
                .mockResolvedValue({ success: true });
            await processor.process({
                jobType: EtlJobType.ETL_CREATE_CHUNKS,
                payload: { correlationId: 'c1' },
            } as any);
            expect(spy).toHaveBeenCalled();
        });

        it('should throw error for unknown job type', async () => {
            await expect(
                processor.process({
                    jobType: 'INVALID_TYPE',
                    payload: { correlationId: 'c1' },
                } as any)
            ).rejects.toThrow('Unknown ETL job type: INVALID_TYPE');
        });
    });

    describe('handleMoveToVectorstore', () => {
        it('should delete existing vectors if job.tries > 1 and call moveEmbeddings', async () => {
            const mockJob = {
                id: 'j1',
                tries: 2,
                payload: { mongoFileId: 'f1', configId: 'c1', projectId: 'p1' },
            };
            (fileService.findById as jest.Mock).mockResolvedValue({ id: 'f1' });
            (etlService.ensureEtlConfig as jest.Mock).mockResolvedValue({});
            (etlService.moveEmbeddingsToVectorstore as jest.Mock).mockResolvedValue(undefined);

            await (processor as any).handleMoveToVectorstore(mockJob);

            expect(etlService.moveEmbeddingsToVectorstore).toHaveBeenCalled();
            expect(fileService.updateStatus).toHaveBeenCalledWith('f1', 'completed');
        });
    });

    describe('SharePoint Delta Handlers', () => {
        it('should handle SharePoint delta delete', async () => {
            const job = { payload: { fileOriginId: 'sp_123' }, id: 'j1' };
            (etlService.deleteFileByOriginId as jest.Mock).mockResolvedValue(undefined);

            const result = await (processor as any).handleSharePointDeltaDelete(job);

            expect(result.success).toBe(true);
            expect(etlService.deleteFileByOriginId).toHaveBeenCalledWith('sp_123');
        });

        it('should handle SharePoint delta upsert and delete old version if exists', async () => {
            const job = {
                id: 'j1',
                payload: {
                    change: {
                        name: 'test.pdf',
                        id: 'sp_1',
                        webUrl: 'https://...',
                        file: { mimeType: 'application/pdf' },
                    },
                    configId: 'c1',
                    projectId: 'p1',
                },
            };
            const mockConfig = { correlationId: 'corr_1' };

            (fileService.findByFileOriginIdAndProjectId as jest.Mock).mockResolvedValue({
                id: 'old_file',
            });
            (etlService.deleteFileById as jest.Mock).mockResolvedValue(undefined);

            await (processor as any).handleSharePointDeltaUpsert(job, mockConfig);

            expect(etlService.deleteFileById).toHaveBeenCalledWith('old_file');
            expect(queueService.queueJob).toHaveBeenCalledWith(
                EtlJobType.ANALYZE_FILE,
                expect.objectContaining({ fileName: 'test.pdf' }),
                undefined
            );
        });
    });

    describe('handleAnalyzeFile', () => {
        it('should queue PDF_DOWNLOAD_AND_SPLIT when next step is DOWNLOAD', async () => {
            const mockConfig = { projectId: 'p1', correlationId: 'c1' };
            const mockPayload = { fileName: 'test.pdf', configId: 'c1', projectId: 'p1' };

            (etlService.analyzeFile_ReturnNextStep as jest.Mock).mockResolvedValue({
                nextStep: EtlAnalyzeNextStep.DOWNLOAD, // Use the Enum here
                mongoFileId: 'm1',
            });

            await (processor as any).handleAnalyzeFile(
                { payload: mockPayload, id: 'j1' },
                mockConfig
            );

            expect(queueService.queueJob).toHaveBeenCalledWith(
                EtlJobType.PDF_DOWNLOAD_AND_SPLIT,
                expect.objectContaining({
                    correlationId: 'c1',
                    mongoFileId: 'm1',
                    projectId: 'p1',
                }),
                { priority: QueuePriorityEnum.MEDIUM }
            );
        });
    });

    it('should execute full markdown process with retries', async () => {
        const mockJob = { payload: { mongoFileId: 'f1' }, id: 'j1' };
        const mockConfig = { projectId: 'p1', correlationId: 'c1', id: { toString: () => 'c1' } };

        (
            etlService.downloadFileFromSource_StoreItInCache_CreateMongoFile as jest.Mock
        ).mockResolvedValue(undefined);
        (etlService.splitFileIntoPagesFromMongoFileId as jest.Mock).mockResolvedValue([
            'page1.png',
        ]);
        (etlService.convertImageFileToMarkdownFromMongoFileId as jest.Mock).mockResolvedValue(
            'md1'
        );

        await (processor as any).handleFullMarkdownProcess(mockJob, mockConfig);

        expect(etlService.convertImageFileToMarkdownFromMongoFileId).toHaveBeenCalled();
        expect(etlService.uploadMarkdownFileAndGetChunks).toHaveBeenCalled();
        expect(fileService.updateStatus).toHaveBeenCalledWith('f1', 'markdown-created');
    });

    describe('handleDownloadAndSplit', () => {
        it('should download and split file and initialize page queue', async () => {
            const mockJob = {
                payload: { mongoFileId: 'f1', projectId: 'p1', correlationId: 'c1' },
            };
            const mockConfig = {
                projectId: 'p1',
                correlationId: 'c1',
                mongoFileId: 'f1',
            };

            const pages = ['p1.png', 'p2.png'];

            (etlService.splitFileIntoPagesFromMongoFileId as any).mockResolvedValue(pages);

            const imageContent1 = {
                sourceFile: '/optimized/p1.png',
                content: 'image-string-format-1',
                pageNumber: 1,
            };

            const imageContent2 = {
                sourceFile: '/optimized/p2.png',
                content: 'image-string-format-2',
                pageNumber: 2,
            };

            (etlService.getImageContentFromMongoFile as jest.Mock)
                .mockResolvedValueOnce(imageContent1)
                .mockResolvedValueOnce(imageContent2);

            await (processor as any).handleDownloadAndSplit(mockJob, mockConfig);

            expect(queueService.queueJob).toHaveBeenCalledTimes(pages.length);

            expect(etlService.getImageContentFromMongoFile).toHaveBeenCalledTimes(2);

            expect(etlService.getImageContentFromMongoFile).toHaveBeenCalledWith('f1', 'p1.png');

            expect(queueService.queueJob).toHaveBeenNthCalledWith(
                1,
                EtlJobType.PDF_MARKDOWN_PROCESS,
                expect.objectContaining({
                    data: expect.objectContaining({
                        pageNumber: 1,
                        content: 'image-string-format-1',
                        sourceFile: '/optimized/p1.png',
                    }),
                }),
                undefined
            );

            expect(queueService.queueJob).toHaveBeenNthCalledWith(
                2,
                EtlJobType.PDF_MARKDOWN_PROCESS,
                expect.objectContaining({
                    data: expect.objectContaining({
                        pageNumber: 2,
                        content: 'image-string-format-2',
                        sourceFile: '/optimized/p2.png',
                    }),
                }),
                undefined
            );
        });

        it('should enqueue PDF_CHUNK_PROCESS job after markdown generation', async () => {
            const mockJob = {
                id: 'job-2',
                payload: {
                    mongoFileId: 'f1',
                    projectId: 'p1',
                    correlationId: 'c1',
                    data: {
                        sourceFile: '/optimized/p1.png',
                        pageNumber: 1,
                        content: 'raw-content',
                    },
                },
            } as any;

            // make retryAsync succeed on first attempt
            jest.spyOn(etlService, 'getMarkdownFromContent').mockResolvedValue('# markdown result');

            jest.spyOn(featureFlagService, 'isActive').mockResolvedValue(true);

            const queueNextJobSpy = jest
                .spyOn(processor as any, 'queueNextJob')
                .mockResolvedValue('next-job-id');

            const result = await (processor as any).handleMarkdownBuilder(mockJob);

            expect(featureFlagService.isActive).toHaveBeenCalledWith(
                FeatureFlagEnum.USE_LOCAL_CHUNKING
            );

            expect(queueNextJobSpy).toHaveBeenCalledWith(
                EtlJobType.PDF_LOCAL_CHUNK_PROCESS,
                expect.objectContaining({
                    projectId: 'p1',
                    correlationId: 'c1',
                    mongoFileId: 'f1',
                    data: {
                        sourceFile: '/optimized/p1.png',
                        pageNumber: 1,
                        content: '# markdown result',
                    },
                })
            );

            expect(result.success).toBe(true);
        });

        it('should enqueue USE_LOCAL_CHUNKING job after markdown generation', async () => {
            const mockJob = {
                id: 'job-2',
                payload: {
                    mongoFileId: 'f1',
                    projectId: 'p1',
                    correlationId: 'c1',
                    data: {
                        sourceFile: '/optimized/p1.png',
                        pageNumber: 1,
                        content: 'raw-content',
                    },
                },
            } as any;

            // make retryAsync succeed on first attempt
            jest.spyOn(etlService, 'getMarkdownFromContent').mockResolvedValue('# markdown result');

            jest.spyOn(featureFlagService, 'isActive').mockResolvedValue(false);

            const queueNextJobSpy = jest
                .spyOn(processor as any, 'queueNextJob')
                .mockResolvedValue('next-job-id');

            const result = await (processor as any).handleMarkdownBuilder(mockJob);

            expect(featureFlagService.isActive).toHaveBeenCalledWith(
                FeatureFlagEnum.USE_LOCAL_CHUNKING
            );

            expect(queueNextJobSpy).toHaveBeenCalledWith(
                EtlJobType.PDF_UPLOAD_PROCESS,
                expect.objectContaining({
                    projectId: 'p1',
                    correlationId: 'c1',
                    mongoFileId: 'f1',
                    data: {
                        sourceFile: '/optimized/p1.png',
                        pageNumber: 1,
                        content: '# markdown result',
                    },
                })
            );

            expect(result.success).toBe(true);
        });

        it('should upload markdown and enqueue chunk job', async () => {
            const mockJob = {
                id: 'job-1',
                payload: {
                    mongoFileId: 'f1',
                    projectId: 'p1',
                    correlationId: 'c1',
                    data: {
                        sourceFile: '/optimized/p1.png',
                        pageNumber: 1,
                        content: 'markdown-content',
                    },
                },
            } as any;

            etlService.uploadMarkdown = jest.fn().mockResolvedValue('remote-file-id');

            const result = await (processor as any).handleUploadMarkdown(mockJob);

            expect(etlService.uploadMarkdown).toHaveBeenCalledWith(mockJob.payload.data);

            expect(queueService.queueJob).toHaveBeenCalledWith(
                EtlJobType.PDF_CHUNK_PROCESS,
                {
                    projectId: 'p1',
                    correlationId: 'c1',
                    mongoFileId: 'f1',
                    remoteId: 'remote-file-id',
                    data: {
                        sourceFile: '/optimized/p1.png',
                        pageNumber: 1,
                        content: 'markdown-content',
                    },
                },
                { priority: QueuePriorityEnum.HIGHEST }
            );

            expect(result).toEqual(
                expect.objectContaining({
                    success: true,
                    data: expect.objectContaining({
                        message: 'Upload was successfully',
                        jobId: 'job-1',
                        mongoFileId: 'f1',
                    }),
                })
            );
        });

        it('should update status and enqueue next job when all pages processed', async () => {
            const mockJob = {
                id: 'job-2',
                payload: {
                    mongoFileId: 'f2',
                    projectId: 'p1',
                    correlationId: 'c1',
                    remoteId: 'r2',
                    data: {
                        sourceFile: '/optimized/p2.png',
                        pageNumber: 2,
                        content: 'markdown-content',
                    },
                },
            } as any;

            const mockConfig = {
                id: 'config-1',
                projectId: 'p1',
                correlationId: 'c1',
            } as any;

            // All pages are processed
            fileService.updateTotalPagesProcessed = jest.fn().mockResolvedValue({
                pagesToProcess: { total: 2, processed: 2 },
            });

            fileService.updateStatus = jest.fn().mockResolvedValue(undefined);
            etlService.chunkMarkdown = jest.fn().mockResolvedValue(undefined);

            const result = await (processor as any).handleChunkMarkdown(mockJob, mockConfig);

            // Status updated to "chunked"
            expect(fileService.updateStatus).toHaveBeenCalledWith('f2', 'chunked');

            // queueNextJob called
            expect(queueService.queueJob).toHaveBeenCalledWith(
                EtlJobType.ETL_CREATE_EMBEDDINGS,
                {
                    projectId: 'p1',
                    correlationId: 'c1',
                    mongoFileId: 'f2',
                    configId: 'config-1',
                },
                undefined
            );

            expect(result).toMatchObject({
                success: true,
                data: {
                    message: 'Chunking was successfully',
                    jobId: 'job-2',
                    mongoFileId: 'f2',
                },
            });
        });

        it('should generate embeddings successfully and enqueue next job', async () => {
            const mockJob = {
                id: 'job-1',
                payload: {
                    mongoFileId: 'f1',
                },
            } as any;

            const mockConfig = {
                id: 'config-1',
                projectId: 'p1',
                correlationId: 'c1',
                dataScope: 'all',
            } as any;

            etlSharedService.resolveEmbeddingSettings = jest.fn().mockReturnValue({
                model: 'text-embedding-3-small',
                dimensions: 1536,
            });

            chunkMongoService.findByFileId = jest.fn().mockResolvedValue([
                { id: 'chunk1', content: 'abc' },
                { id: 'chunk2', content: 'def' },
            ]);

            fileService.markEmbeddingsStored = jest.fn().mockResolvedValue(undefined);
            fileService.updateStatus = jest.fn().mockResolvedValue(undefined);
            fileService.syncChunks = jest.fn().mockResolvedValue(undefined);

            const result = await (processor as any).handleCreateEmbeddings(mockJob, mockConfig);

            expect(etlService.getConfigId).toHaveBeenCalledWith(mockConfig);
            expect(fileService.syncChunks).toHaveBeenCalledWith('f1');
            expect(fileService.markEmbeddingsStored).toHaveBeenCalledWith('f1');
            expect(fileService.updateStatus).toHaveBeenCalledWith('f1', 'embeddings-created');

            expect(queueService.queueJob).toHaveBeenCalledWith(
                EtlJobType.ETL_MOVE_TO_VECTORSTORE,
                expect.objectContaining({
                    projectId: 'p1',
                    correlationId: 'c1',
                    mongoFileId: 'f1',
                    dataScope: 'all',
                }),
                undefined
            );

            expect(result).toMatchObject({
                success: true,
                data: {
                    message: 'Embeddings generated',
                    jobId: 'job-1',
                    processedChunks: 2,
                },
            });
        });
    });

    it('should create chunks and enqueue embeddings job', async () => {
        const job = {
            payload: { mongoFileId: 'f1' },
        };

        const etlConfig = {
            id: 'cfg1',
            projectId: 'p1',
            correlationId: 'c1',
            dataScope: 'project',
        } as any;

        const file = { id: 'f1' };
        const chunks = [{ id: 'c1' }, { id: 'c2' }];

        jest.spyOn(fileService, 'findById').mockResolvedValue(file as any);
        jest.spyOn(etlService, 'getConfigId').mockReturnValue('cfg1');

        jest.spyOn(etlSharedService, 'resolveChunkSettings').mockReturnValue({
            chunkSize: 500,
            overlap: 50,
        });

        jest.spyOn(chunkMongoService, 'findByFileId').mockResolvedValue([]);
        jest.spyOn(chunkProcessorService, 'processChunks').mockResolvedValue(chunks as any);

        jest.spyOn(fileService, 'updateStatus').mockResolvedValue(undefined);

        jest.spyOn(etlSharedService, 'resolveEmbeddingSettings').mockReturnValue({
            deploymentId: 'd-1',
            user: 'user-test',
            model: 'test-model',
        });

        jest.spyOn(processor as any, 'queueNextJob').mockResolvedValue('job-2');

        const result = await (processor as any).handleCreateChunks(job, etlConfig);

        expect(chunkProcessorService.processChunks).toHaveBeenCalled();

        expect(result.success).toBe(true);
        expect(result.data.chunkCount).toBe(2);
    });

    it('should download file, update status, and enqueue split pages job', async () => {
        const job = {
            payload: { mongoFileId: 'f1' },
        };

        const etlConfig = {
            projectId: 'p1',
            correlationId: 'c1',
        };

        jest.spyOn(
            etlService,
            'downloadFileFromSource_StoreItInCache_CreateMongoFile'
        ).mockResolvedValue(undefined);

        jest.spyOn(fileService, 'updateStatus').mockResolvedValue(undefined);

        jest.spyOn(processor as any, 'queueNextJob').mockResolvedValue('job-2');

        const result = await (processor as any).handleDownloadFile(job, etlConfig);

        expect(
            etlService.downloadFileFromSource_StoreItInCache_CreateMongoFile
        ).toHaveBeenCalledWith('f1');

        expect(fileService.updateStatus).toHaveBeenCalledWith('f1', 'downloaded');

        expect(result.success).toBe(true);
        expect(result.data.mongoFileId).toBe('f1');
    });

    it('should upload SharePoint file and enqueue chunk job', async () => {
        const job = {
            payload: { mongoFileId: 'f1' },
        };

        const etlConfig = {
            id: 'cfg1',
            projectId: 'p1',
            correlationId: 'c1',
            dataSource: {
                type: DataSourceType.SharePoint,
                config: { driveId: 'drive-1' },
            },
        } as any;

        const mongoFile = {
            id: 'f1',
            fileName: 'doc.pdf',
            fileOriginId: 'sp-file-id',
            fileSource: DataSourceType.SharePoint,
            mimeType: 'application/pdf',
        };

        jest.spyOn(fileService, 'findById').mockResolvedValue(mongoFile as any);
        jest.spyOn(etlService, 'getConfigId').mockReturnValue('cfg1');
        jest.spyOn(etlSharedService, 'resolveChunkSettings').mockReturnValue({
            chunkSize: 500,
            overlap: 50,
        });

        jest.spyOn(sharepointService, 'initialize').mockResolvedValue(undefined);
        jest.spyOn(sharepointService, 'downloadFile').mockResolvedValue(Buffer.from('file'));

        jest.spyOn(etlService, 'uploadFileFromBuffer').mockResolvedValue(undefined);
        jest.spyOn(fileService, 'updateProjectId').mockResolvedValue(undefined);
        jest.spyOn(fileService, 'updateStatus').mockResolvedValue(undefined);

        jest.spyOn(processor as any, 'queueNextJob').mockResolvedValue('job-2');

        const result = await (processor as any).handleUploadFile(job, etlConfig);

        expect(sharepointService.downloadFile).toHaveBeenCalledWith('drive-1', 'sp-file-id');

        expect(etlService.uploadFileFromBuffer).toHaveBeenCalledWith(
            expect.objectContaining({
                mongoFileId: 'f1',
                fileName: 'doc.pdf',
            })
        );

        expect(result.success).toBe(true);
    });

    it('should process markdown and enqueue next job if iterationQueue has items', async () => {
        const job = {
            payload: {
                mongoFileId: 'f1',
                iterationQueue: ['page1.md', 'page2.md'],
                processed: [],
            },
        };

        const etlConfig = {
            id: 'cfg1',
            projectId: 'p1',
            correlationId: 'c1',
        };

        const result = await (processor as any).handleMarkdownToChunks(job, etlConfig);

        expect(etlService.uploadMarkdownFileAndGetChunks).toHaveBeenCalledWith('f1', 'page1.md');
        expect(job.payload.processed).toEqual(['page1.md']); // markdown added to processed
        expect(fileService.updateStatus).toHaveBeenCalledWith('f1', 'markdown-creating');

        expect(result.success).toBe(true);
        expect(result.data.mongoFileId).toBe('f1');
    });
});
