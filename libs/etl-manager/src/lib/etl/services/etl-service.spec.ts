/* eslint-disable max-lines */
/* eslint-disable max-lines-per-function */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as fs from 'fs';

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

import { GenericQueueService } from '@deal-insights/shared-nestjs-utils';

import ChunkMongoService from './chunk-mongo.service';
import { DocumentClassifierService } from './document-classification.service';
import DocumentProcessingClient from './document-processing-client';
import ChunkProcessorService from './etl-chunks.service';
import EtlConfigService from './etl-config.service';
import EtlImageMarkdownService from './etl-image-markdown.service';
import EtlSharedService from './etl-shared.service';
import EtlService from './etl.service';
import FileService from './file.service';
import PdfImagesService from './pdf-images.service';
import SharepointSyncOrchestrator from './sharepoint-sync-orchestrator.service';
import SharepointService from './sharepoint.service';
import VectorService from './vector.service';
import AuthApiService from '../../auth/auth-api.service';
import { FeatureFlagService } from '../../feature-flag/feature-flag.service';
import { DataSourceType } from '../schemas';

describe('EtlService', () => {
    let service: EtlService;
    let fileService: jest.Mocked<FileService>;
    let etlConfigService: jest.Mocked<EtlConfigService>;
    let sharepointService: jest.Mocked<SharepointService>;
    let chunkMongoService: jest.Mocked<ChunkMongoService>;
    let vectorService: jest.Mocked<VectorService>;
    let documentProcessingService: jest.Mocked<DocumentProcessingClient>;
    let pdfImageService: jest.Mocked<PdfImagesService>;
    let etlSharedService: jest.Mocked<EtlSharedService>;
    let authApiService: jest.Mocked<AuthApiService>;
    let etlChunkService: jest.Mocked<ChunkProcessorService>;
    let etlImageMarkdownService: jest.Mocked<EtlImageMarkdownService>;
    let sharepointSyncOrchestrator: jest.Mocked<SharepointSyncOrchestrator>;

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
                EtlService,
                {
                    provide: FileService,
                    useValue: {
                        createFile: jest.fn(),
                        findById: jest.fn(),
                        findByFileOriginId: jest.fn(),
                        deleteById: jest.fn(),
                        updateStorageFilename: jest.fn(),
                        updateRemoteId: jest.fn(),
                        addChunks: jest.fn(),
                    },
                },
                { provide: ChunkProcessorService, useValue: { processMarkdownChunks: jest.fn() } },
                {
                    provide: EtlConfigService,
                    useValue: {
                        findByProjectId: jest.fn(),
                        findById: jest.fn(),
                        getDefaultConfig: jest.fn(),
                        create: jest.fn(),
                    },
                },
                {
                    provide: SharepointService,
                    useValue: {
                        getDriveItemFromUrl: jest.fn(),
                        initialize: jest.fn(),
                        downloadFile: jest.fn(),
                    },
                },
                {
                    provide: DocumentProcessingClient,
                    useValue: { uploadFile: jest.fn(), uploadMarkdownFile: jest.fn() },
                },
                {
                    provide: ChunkMongoService,
                    useValue: {
                        findByFileId: jest.fn(),
                        deleteMany: jest.fn(),
                    },
                },
                {
                    provide: VectorService,
                    useValue: {
                        insertVectors: jest.fn(),
                        deleteByFileId: jest.fn(),
                    },
                },
                {
                    provide: PdfImagesService,
                    useValue: {
                        storeFile: jest.fn(),
                        splitFileIntoPagesFromFileDocument: jest.fn(),
                    },
                },
                {
                    provide: EtlImageMarkdownService,
                    useValue: { convertImageFileToMarkdownFromFileDocument: jest.fn() },
                },
                {
                    provide: SharepointSyncOrchestrator,
                    useValue: {
                        triggerDeltaSyncForAllActiveProjects: jest.fn(),
                        deltaSyncProject: jest.fn(),
                    },
                },
                { provide: AuthApiService, useValue: { getMachineToken: jest.fn() } },
                {
                    provide: EtlSharedService,
                    useValue: {
                        resolveChunkSettings: jest.fn(),
                        getFolderFromMongoFileId_WithValidation: jest.fn(),
                        getFullfilename_WithValidation: jest.fn(),
                        getPageNumber: jest.fn(),
                    },
                },
                {
                    provide: GenericQueueService,
                    useValue: {
                        queueJob: jest.fn(),
                    },
                },
                {
                    provide: DocumentClassifierService,
                    useValue: {
                        classifyAndTagFile: jest.fn(),
                    },
                },
                {
                    provide: ConfigService,
                    useValue: {
                        get: jest.fn(),
                    },
                },
                { provide: Logger, useValue: mockLogger },
                {
                    provide: FeatureFlagService,
                    useValue: {
                        isActive: jest.fn(),
                    },
                },
            ],
        }).compile();

        service = module.get<EtlService>(EtlService);
        fileService = module.get(FileService) as any;
        etlConfigService = module.get(EtlConfigService) as any;
        sharepointService = module.get(SharepointService) as any;
        chunkMongoService = module.get(ChunkMongoService) as any;
        vectorService = module.get(VectorService) as any;
        documentProcessingService = module.get(DocumentProcessingClient) as any;
        pdfImageService = module.get(PdfImagesService) as any;
        etlSharedService = module.get(EtlSharedService) as any;
        authApiService = module.get(AuthApiService) as any;
        etlChunkService = module.get(ChunkProcessorService) as any;
        etlImageMarkdownService = module.get(EtlImageMarkdownService) as any;
        sharepointSyncOrchestrator = module.get(SharepointSyncOrchestrator) as any;
        jest.spyOn(fs.promises, 'readFile').mockImplementation();
    });

    afterEach(() => {
        jest.restoreAllMocks(); // Clean up spies
    });

    describe('uploadFileFromBuffer', () => {
        it('should call documentProcessingService.uploadFile', async () => {
            const params = {
                mongoFileId: '1',
                buffer: Buffer.from(''),
                fileName: 'test.txt',
                mimeType: 'text/plain',
            };
            await service.uploadFileFromBuffer(params);
            expect(documentProcessingService.uploadFile).toHaveBeenCalledWith(
                '1',
                params.buffer,
                'test.txt',
                'text/plain'
            );
        });
    });

    describe('moveEmbeddingsToVectorstore', () => {
        it('should map chunks to vectors and insert them', async () => {
            // Generate a valid 24-character hex ID
            const validFileId = new Types.ObjectId().toString();

            const mockFile = {
                id: validFileId,
                fileName: 'test.pdf',
                mimeType: 'application/pdf',
            } as any;

            const mockChunks = [
                {
                    content: 'c1',
                    embedding: [0.1],
                    metadata: { projectId: 'p1', chunkSize: 100, overlap: 10 },
                },
            ];

            chunkMongoService.findByFileId.mockResolvedValue(mockChunks as any);
            vectorService.insertVectors.mockResolvedValue([{ _id: 'vec1' }] as any);

            const result = await service.moveEmbeddingsToVectorstore(mockFile);

            expect(result).toEqual(['vec1']);
            expect(vectorService.insertVectors).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        fileId: new Types.ObjectId(validFileId), // This will now succeed
                        page_content: 'c1',
                    }),
                ])
            );
        });
    });
    describe('upsertFileFromDelta', () => {
        it('should delete existing file data before processing', async () => {
            const validMongoId = new Types.ObjectId().toString(); // Valid hex string
            const change = { id: 'orig123', name: 'test.pdf' } as any;

            fileService.findByFileOriginId.mockResolvedValue({ id: validMongoId } as any);

            await service.upsertFileFromDelta(change, 'drive123');

            expect(chunkMongoService.deleteMany).toHaveBeenCalledWith({
                fileId: new Types.ObjectId(validMongoId),
            });
            expect(vectorService.deleteByFileId).toHaveBeenCalledWith(validMongoId);
            expect(fileService.deleteById).toHaveBeenCalledWith(validMongoId);
        });
    });

    describe('ensureEtlConfig', () => {
        it('should return config by configId if found', async () => {
            etlConfigService.findById.mockResolvedValue({ id: 'c1' } as any);
            const res = await service.ensureEtlConfig('c1');
            expect(res.id).toBe('c1');
        });

        it('should return config by projectId if configId lookup fails', async () => {
            etlConfigService.findById.mockResolvedValue(null);
            etlConfigService.findByProjectId.mockResolvedValue({ id: 'p1' } as any);
            const res = await service.ensureEtlConfig('c1', 'p1');
            expect(res.id).toBe('p1');
        });

        it('should throw error if no config is found', async () => {
            etlConfigService.findById.mockResolvedValue(null);
            etlConfigService.findByProjectId.mockResolvedValue(null);
            await expect(service.ensureEtlConfig('c1', 'p1')).rejects.toThrow(
                /ETL configuration not found/
            );
        });
    });

    describe('downloadFileFromSource_StoreItInCache_CreateMongoFile', () => {
        it('should download, store locally and update mongo', async () => {
            fileService.findById.mockResolvedValue({
                id: 'm1',
                configId: 'c1',
                fileOriginId: 'o1',
                fileName: 'f.pdf',
            } as any);
            etlConfigService.findById.mockResolvedValue({
                dataSource: { type: DataSourceType.SharePoint, config: { driveId: 'd1' } },
            } as any);
            sharepointService.downloadFile.mockResolvedValue(Buffer.from('hello'));
            pdfImageService.storeFile.mockResolvedValue('stored_name');

            const res = await service.downloadFileFromSource_StoreItInCache_CreateMongoFile('m1');

            expect(res).toBe('stored_name');
            expect(fileService.updateStorageFilename).toHaveBeenCalledWith('m1', 'stored_name', 5);
        });

        it('should throw error if mongo file not found', async () => {
            fileService.findById.mockResolvedValue(null);
            await expect(
                service.downloadFileFromSource_StoreItInCache_CreateMongoFile('m1')
            ).rejects.toThrow();
        });

        it('should throw if datasource is not SharePoint', async () => {
            fileService.findById.mockResolvedValue({ id: 'm1', configId: 'c1' } as any);
            etlConfigService.findById.mockResolvedValue({ dataSource: { type: 'OTHER' } } as any);
            await expect(
                service.downloadFileFromSource_StoreItInCache_CreateMongoFile('m1')
            ).rejects.toThrow(/not supported/);
        });
    });

    describe('convertImageFileToMarkdownFromMongoFileId', () => {
        it('should call markdown service', async () => {
            fileService.findById.mockResolvedValue({ id: 'm1' } as any);
            etlImageMarkdownService.convertImageFileToMarkdownFromFileDocument.mockResolvedValue(
                'md content'
            );
            const res = await service.convertImageFileToMarkdownFromMongoFileId('m1', 'page1.png');
            expect(res).toBe('md content');
        });
    });

    describe('uploadMarkdownFileAndGetChunks', () => {
        it('should complete the full markdown to chunk flow', async () => {
            // Arrange
            fileService.findById.mockResolvedValue({ id: 'm1', configId: 'c1' } as any);
            etlConfigService.findById.mockResolvedValue({
                projectId: 'p1',
                dataScope: 's1',
            } as any);
            etlSharedService.getFolderFromMongoFileId_WithValidation.mockReturnValue('/tmp');
            etlSharedService.getFullfilename_WithValidation.mockReturnValue('/tmp/file.md');
            etlSharedService.resolveChunkSettings.mockReturnValue({ chunkSize: 100, overlap: 10 });
            etlSharedService.getPageNumber.mockReturnValue(1);

            // Correct implementation with spyOn
            const readFileSpy = jest
                .spyOn(fs.promises, 'readFile')
                .mockResolvedValue(Buffer.from('content') as any);

            authApiService.getMachineToken.mockResolvedValue('token');
            documentProcessingService.uploadMarkdownFile.mockResolvedValue('remote123');
            etlChunkService.processMarkdownChunks.mockResolvedValue([{ id: 'chunk1' }] as any);

            // Act
            await service.uploadMarkdownFileAndGetChunks('m1', 'file.md');

            // Assert
            expect(readFileSpy).toHaveBeenCalled();
            expect(fileService.updateRemoteId).toHaveBeenCalledWith('m1', 'remote123');
            expect(etlChunkService.processMarkdownChunks).toHaveBeenCalled();
        });
    });

    describe('Helper Methods & Orchestration', () => {
        it('should split file into pages', async () => {
            fileService.findById.mockResolvedValue({ id: 'm1' } as any);
            await service.splitFileIntoPagesFromMongoFileId('m1');
            expect(pdfImageService.splitFileIntoPagesFromFileDocument).toHaveBeenCalled();
        });

        it('should trigger delta sync for all projects', async () => {
            await service.deltaSyncForAllActiveProjects();
            expect(
                sharepointSyncOrchestrator.triggerDeltaSyncForAllActiveProjects
            ).toHaveBeenCalled();
        });

        it('should trigger delta sync for specific project', async () => {
            await service.deltaSyncProject({ projectId: '1' } as any);
            expect(sharepointSyncOrchestrator.deltaSyncProject).toHaveBeenCalledWith({
                projectId: '1',
            });
        });
    });
});
