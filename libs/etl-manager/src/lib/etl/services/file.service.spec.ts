/* eslint-disable max-lines-per-function */
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Model } from 'mongoose';

import FileService from './file.service';
import { SUPPORTED_MIME_TYPES } from '../../shared/constants/shared.const';
import { Chunk } from '../schemas/chunk.schema';
import { File } from '../schemas/file.schema';

describe('FileService', () => {
    let service: FileService;
    let model: Model<File>;

    // Mock data setup
    const mockFile = {
        _id: '60d5ecb8b392d5001f8e97a1',
        originalName: 'test.pdf',
        processingStatus: 'pending',
        projectId: 'project-123',
        save: jest.fn().mockResolvedValue({ _id: 'mockId', originalName: 'test.pdf' }),
    };

    const mockFileModel = {
        new: jest.fn().mockResolvedValue(mockFile),
        constructor: jest.fn().mockReturnValue(mockFile),
        findById: jest.fn(),
        findOne: jest.fn(),
        find: jest.fn(),
        findByIdAndUpdate: jest.fn(),
        findByIdAndDelete: jest.fn(),
        deleteMany: jest.fn(),
        aggregate: jest.fn(),
        countDocuments: jest.fn(),
    };

    const mockChunkModel = {
        find: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                FileService,
                {
                    provide: getModelToken(File.name),
                    useValue: mockFileModel,
                },
                {
                    provide: getModelToken(Chunk.name),
                    useValue: mockChunkModel,
                },
            ],
        }).compile();

        service = module.get<FileService>(FileService);
        model = module.get<Model<File>>(getModelToken(File.name));
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('findById', () => {
        it('should find a file by ID', async () => {
            mockFileModel.findById.mockReturnValue({
                exec: jest.fn().mockResolvedValue(mockFile),
            });

            const result = await service.findById('some-id');
            expect(model.findById).toHaveBeenCalledWith('some-id');
            expect(result).toEqual(mockFile);
        });
    });

    describe('updateStatus', () => {
        it('should update file status and push to history', async () => {
            mockFileModel.findByIdAndUpdate.mockReturnValue({
                exec: jest.fn().mockResolvedValue({ ...mockFile, processingStatus: 'completed' }),
            });

            const result = await service.updateStatus('id123', 'completed', 'No errors');

            expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
                'id123',
                expect.objectContaining({
                    processingStatus: 'completed',
                    errorMessage: 'No errors',
                    $push: expect.any(Object),
                }),
                { new: true }
            );
            expect(result.processingStatus).toBe('completed');
        });
    });

    describe('syncChunks', () => {
        it('should query chunks by fileId and $set the file chunks array', async () => {
            const validFileId = '60d5ecb8b392d5001f8e97a1';
            const mockChunks = [{ _id: 'chunk1' }, { _id: 'chunk2' }];

            mockChunkModel.find.mockReturnValue({
                exec: jest.fn().mockResolvedValue(mockChunks),
            });

            mockFileModel.findByIdAndUpdate.mockReturnValue({
                exec: jest.fn().mockResolvedValue(mockFile),
            });

            await service.syncChunks(validFileId);

            expect(mockChunkModel.find).toHaveBeenCalledWith(
                { fileId: expect.any(Object) },
                { _id: 1 }
            );

            expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
                validFileId,
                {
                    $set: { chunks: ['chunk1', 'chunk2'] },
                    $push: { history: expect.any(Object) },
                },
                { new: true }
            );
        });
    });

    describe('countCompletedDocumentsByProjectId', () => {
        it('should count documents with specific filters', async () => {
            mockFileModel.countDocuments.mockReturnValue({
                exec: jest.fn().mockResolvedValue(5),
            });

            const count = await service.countCompletedDocumentsByProjectId('project-1');

            expect(model.countDocuments).toHaveBeenCalledWith({
                projectId: 'project-1',
                processingStatus: 'completed',
                mimeType: { $in: SUPPORTED_MIME_TYPES },
            });
            expect(count).toBe(5);
        });
    });

    describe('countAllDocumentsByProjectId', () => {
        it('should count all documents for a project', async () => {
            mockFileModel.countDocuments.mockReturnValue({
                exec: jest.fn().mockResolvedValue(10),
            });

            const count = await service.countAllDocumentsByProjectId('project-1');

            expect(model.countDocuments).toHaveBeenCalledWith({
                projectId: 'project-1',
            });
            expect(count).toBe(10);
        });
    });

    describe('deleteByProjectId', () => {
        it('should return deleted count', async () => {
            mockFileModel.deleteMany.mockReturnValue({
                exec: jest.fn().mockResolvedValue({ deletedCount: 3 }),
            });

            const result = await service.deleteByProjectId('project-1');
            expect(result.deletedCount).toBe(3);
        });

        it('should return 0 if deletedCount is undefined', async () => {
            mockFileModel.deleteMany.mockReturnValue({
                exec: jest.fn().mockResolvedValue({}),
            });

            const result = await service.deleteByProjectId('project-1');
            expect(result.deletedCount).toBe(0);
        });
    });

    describe('getStatusCounts', () => {
        it('should call aggregate with group stage', async () => {
            const mockAggResult = [{ _id: 'pending', count: 2 }];
            mockFileModel.aggregate.mockReturnValue({
                exec: jest.fn().mockResolvedValue(mockAggResult),
            });

            const result = await service.getStatusCounts();
            expect(model.aggregate).toHaveBeenCalled();
            expect(result).toEqual(mockAggResult);
        });
    });
});
