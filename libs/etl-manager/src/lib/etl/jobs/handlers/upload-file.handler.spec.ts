/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable max-lines-per-function */
import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { GenericQueueService } from '@deal-insights/shared-nestjs-utils';

import { UploadFileHandler } from './upload-file.handler'; // Adjust path
import { ProcessingException } from '../../exceptions';
import { DataSourceType } from '../../schemas';
import EtlSharedService from '../../services/etl-shared.service';
import EtlService from '../../services/etl.service';
import FileService from '../../services/file.service';
import SharepointService from '../../services/sharepoint.service';

describe('UploadFileHandler', () => {
    let handler: UploadFileHandler;
    let fileService: FileService;
    let etlService: EtlService;
    let etlSharedService: EtlSharedService;
    let sharepointService: SharepointService;
    let queueService: GenericQueueService;

    const mockLogger = {
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                UploadFileHandler,
                {
                    provide: FileService,
                    useValue: {
                        findById: jest.fn(),
                        updateProjectId: jest.fn(),
                        updateStatus: jest.fn(),
                    },
                },
                {
                    provide: EtlService,
                    useValue: { getConfigId: jest.fn(), uploadFileFromBuffer: jest.fn() },
                },
                {
                    provide: EtlSharedService,
                    useValue: { resolveChunkSettings: jest.fn() },
                },
                {
                    provide: SharepointService,
                    useValue: { initialize: jest.fn(), downloadFile: jest.fn() },
                },
                {
                    provide: GenericQueueService,
                    useValue: { queueJob: jest.fn() },
                },
                {
                    provide: Logger,
                    useValue: mockLogger,
                },
            ],
        }).compile();

        handler = module.get<UploadFileHandler>(UploadFileHandler);
        fileService = module.get<FileService>(FileService);
        etlService = module.get<EtlService>(EtlService);
        etlSharedService = module.get<EtlSharedService>(EtlSharedService);
        sharepointService = module.get<SharepointService>(SharepointService);
        queueService = module.get<GenericQueueService>(GenericQueueService);
    });

    const mockEtlConfig = {
        projectId: 'proj_123',
        correlationId: 'corr_456',
        dataSource: { config: { driveId: 'drive_999' } },
    } as any;

    const mockJob = {
        id: 'job_1',
        payload: { mongoFileId: 'file_001' },
    } as any;

    describe('handle', () => {
        it('should successfully upload a SharePoint file and queue the next job', async () => {
            const mockFile = {
                id: 'file_001',
                fileName: 'test.pdf',
                fileOriginId: 'origin_1',
                fileSource: DataSourceType.SharePoint,
                mimeType: 'application/pdf',
            };
            const mockBuffer = Buffer.from('hello world');

            (fileService.findById as jest.Mock).mockResolvedValue(mockFile);
            (etlService.getConfigId as jest.Mock).mockReturnValue('conf_abc');
            (etlSharedService.resolveChunkSettings as jest.Mock).mockReturnValue({
                chunkSize: 1000,
            });
            (sharepointService.downloadFile as jest.Mock).mockResolvedValue(mockBuffer);
            (queueService.queueJob as jest.Mock).mockResolvedValue('next_job_id');

            const result = await handler.handle(mockJob, mockEtlConfig);

            expect(sharepointService.initialize).toHaveBeenCalledWith(mockEtlConfig);
            expect(etlService.uploadFileFromBuffer).toHaveBeenCalledWith(
                expect.objectContaining({
                    mongoFileId: 'file_001',
                    buffer: mockBuffer,
                })
            );
            expect(fileService.updateStatus).toHaveBeenCalledWith('file_001', 'processing');
            expect(result.success).toBe(true);
        });

        it('should throw an error if the mongo file is not found', async () => {
            (fileService.findById as jest.Mock).mockResolvedValue(null);

            await expect(handler.handle(mockJob, mockEtlConfig)).rejects.toThrow(
                'ETL mongo file not found'
            );
        });

        it('should throw ProcessingException if file source is not supported', async () => {
            const mockFile = {
                id: 'file_001',
                fileSource: 'INVALID_SOURCE',
            };
            (fileService.findById as jest.Mock).mockResolvedValue(mockFile);

            await expect(handler.handle(mockJob, mockEtlConfig)).rejects.toThrow(
                ProcessingException
            );
        });

        it('should update file status to "failed" and re-throw if an error occurs during upload', async () => {
            const mockFile = {
                id: 'file_001',
                fileSource: DataSourceType.SharePoint,
                fileOriginId: 'origin_1',
            };
            (fileService.findById as jest.Mock).mockResolvedValue(mockFile);
            (sharepointService.downloadFile as jest.Mock).mockResolvedValue(Buffer.from('data'));
            (etlService.uploadFileFromBuffer as jest.Mock).mockRejectedValue(
                new Error('S3 Upload Failed')
            );

            await expect(handler.handle(mockJob, mockEtlConfig)).rejects.toThrow(
                'S3 Upload Failed'
            );

            expect(fileService.updateStatus).toHaveBeenCalledWith(
                'file_001',
                'failed',
                'S3 Upload Failed'
            );
        });
    });
});
