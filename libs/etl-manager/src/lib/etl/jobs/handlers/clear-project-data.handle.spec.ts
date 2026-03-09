/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable max-lines-per-function */
import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ClearProjectDataHandler } from './clear-project-data.handle';
import { DataSourceType } from '../../schemas';
import { ConfigHistoryActions } from '../../services';
import ChunkMongoService from '../../services/chunk-mongo.service';
import EtlConfigService from '../../services/etl-config.service';
import FileService from '../../services/file.service';
import VectorService from '../../services/vector.service';

describe('ClearProjectDataHandler', () => {
    let handler: ClearProjectDataHandler;
    let fileService: jest.Mocked<FileService>;
    let chunkMongoService: jest.Mocked<ChunkMongoService>;
    let vectorService: jest.Mocked<VectorService>;
    let etlConfigService: jest.Mocked<EtlConfigService>;
    let logger: jest.Mocked<Logger>;

    const mockProjectId = 'project-123';
    const mockEtlConfigId = 'config-456';

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ClearProjectDataHandler,
                {
                    provide: FileService,
                    useValue: {
                        findByProjectId: jest.fn(),
                        deleteById: jest.fn(),
                    },
                },
                {
                    provide: ChunkMongoService,
                    useValue: {
                        deleteByFileIds: jest.fn(),
                    },
                },
                {
                    provide: VectorService,
                    useValue: {
                        deleteByProjectId: jest.fn(),
                    },
                },
                {
                    provide: EtlConfigService,
                    useValue: {
                        update: jest.fn(),
                        addHistoryEntry: jest.fn(),
                    },
                },
                {
                    provide: Logger,
                    useValue: {
                        info: jest.fn(),
                        debug: jest.fn(),
                        error: jest.fn(),
                    },
                },
            ],
        }).compile();

        handler = module.get<ClearProjectDataHandler>(ClearProjectDataHandler);
        fileService = module.get(FileService);
        chunkMongoService = module.get(ChunkMongoService);
        vectorService = module.get(VectorService);
        etlConfigService = module.get(EtlConfigService);
        logger = module.get(Logger);
    });

    it('should be defined', () => {
        expect(handler).toBeDefined();
    });

    describe('handle', () => {
        const mockFiles = [{ id: 'file1' }, { id: 'file2' }] as any[];

        const mockJob = {
            payload: { projectId: mockProjectId },
        } as any;

        const mockEtlConfig = {
            id: mockEtlConfigId,
            dataSource: {
                type: DataSourceType.SharePoint,
                config: { deltaLink: 'old-link' },
            },
        } as any;

        it('should successfully clear all data and update SharePoint config', async () => {
            // Setup mocks
            fileService.findByProjectId.mockResolvedValue(mockFiles);
            chunkMongoService.deleteByFileIds.mockResolvedValue({ deletedCount: 10 } as any);
            vectorService.deleteByProjectId.mockResolvedValue({ deletedCount: 5 } as any);
            fileService.deleteById.mockResolvedValue(undefined);

            const result = await handler.handle(mockJob, mockEtlConfig);

            expect(result.success).toBe(true);

            // Use type assertion here to tell TS these properties exist
            const data = result.data as { filesDeleted: number; chunksDeleted: number };
            expect(data.filesDeleted).toBe(2);
            expect(data.chunksDeleted).toBe(10);

            // Verify deletions
            expect(fileService.findByProjectId).toHaveBeenCalledWith(mockProjectId);
            expect(chunkMongoService.deleteByFileIds).toHaveBeenCalledWith(['file1', 'file2']);
            expect(vectorService.deleteByProjectId).toHaveBeenCalledWith(mockProjectId);
            expect(fileService.deleteById).toHaveBeenCalledTimes(2);

            // Verify SharePoint update logic
            expect(etlConfigService.update).toHaveBeenCalledWith(mockEtlConfigId, {
                dataSource: {
                    type: DataSourceType.SharePoint,
                    config: { deltaLink: null },
                },
                status: 'inactive',
                errorMessage: null,
            });

            // Verify History entry
            expect(etlConfigService.addHistoryEntry).toHaveBeenCalledWith(
                mockEtlConfigId,
                ConfigHistoryActions.RESYNC_PROJECT
            );

            expect(result.success).toBe(true);
        });

        it('should handle large datasets using batching logic', async () => {
            // Create 1500 files (Batch size is 1000)
            const largeFileList = Array.from({ length: 1500 }, (_, i) => ({ id: `f${i}` }));
            fileService.findByProjectId.mockResolvedValue(largeFileList as any);
            chunkMongoService.deleteByFileIds.mockResolvedValue({ deletedCount: 1000 } as any);
            vectorService.deleteByProjectId.mockResolvedValue({ deletedCount: 500 } as any);

            await handler.handle(mockJob, mockEtlConfig);

            // Chunks should be called twice (1000 + 500)
            expect(chunkMongoService.deleteByFileIds).toHaveBeenCalledTimes(2);
            // Files should be deleted one by one (1500 calls)
            expect(fileService.deleteById).toHaveBeenCalledTimes(1500);
        });

        it('should not attempt to delete chunks if no files are found', async () => {
            fileService.findByProjectId.mockResolvedValue([]);
            vectorService.deleteByProjectId.mockResolvedValue({ deletedCount: 0 } as any);

            const result = await handler.handle(mockJob, mockEtlConfig);
            const data = result.data as { filesDeleted: number; chunksDeleted: number };
            expect(chunkMongoService.deleteByFileIds).not.toHaveBeenCalled();
            expect(data.filesDeleted).toBe(0);
            expect(result.success).toBe(true);
        });

        it('should return failure if an error occurs during the process', async () => {
            const error = new Error('Database connection failed');
            fileService.findByProjectId.mockRejectedValue(error);

            const result = await handler.handle(mockJob, mockEtlConfig);

            expect(result.success).toBe(false);
            expect(result.error).toBe(error.message);
            expect(logger.error).toHaveBeenCalledWith(
                expect.stringContaining('[CLEAR_PROJECT_DATA] Failed'),
                error
            );
        });

        it('should skip SharePoint specific updates if data source is not SharePoint', async () => {
            const genericConfig = {
                ...mockEtlConfig,
                dataSource: { type: 'OTHER' as any, config: {} },
            };
            fileService.findByProjectId.mockResolvedValue([]);
            vectorService.deleteByProjectId.mockResolvedValue({ deletedCount: 0 } as any);

            await handler.handle(mockJob, genericConfig);

            expect(etlConfigService.update).not.toHaveBeenCalled();
        });
    });
});
