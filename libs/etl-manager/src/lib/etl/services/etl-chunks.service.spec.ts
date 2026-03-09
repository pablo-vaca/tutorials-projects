/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable max-lines-per-function */
import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

import ChunkMongoService from './chunk-mongo.service';
import DocumentProcessingClient from './document-processing-client';
import { ProcessingException } from '../exceptions';
import { FileDocument } from '../schemas';
import ChunkProcessorService, { ChunkProcessorConfig } from './etl-chunks.service';

describe('ChunkProcessorService', () => {
    let service: ChunkProcessorService;
    let documentClient: jest.Mocked<DocumentProcessingClient>;
    let chunkMongoService: jest.Mocked<ChunkMongoService>;

    // --- Mock Data ---
    const mockFileId = new Types.ObjectId().toHexString();
    const mockFile = {
        id: mockFileId,
        remoteId: 'remote-123',
        sourceData: { title: 'Test Doc', link: 'https://test.com' },
    } as FileDocument;

    const mockConfig: ChunkProcessorConfig = {
        chunkSize: 1000,
        overlap: 100,
        projectId: 'project-99',
        dataScope: 'global',
    };

    const mockChunksFromApi = ['chunk one content', 'chunk two content'];

    beforeEach(async () => {
        // Create Mock objects
        const mockDocumentClient = {
            getChunks: jest.fn(),
        };
        const mockMongoService = {
            createChunks: jest.fn(),
        };
        const mockLogger = {
            debug: jest.fn(),
            error: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ChunkProcessorService,
                { provide: DocumentProcessingClient, useValue: mockDocumentClient },
                { provide: ChunkMongoService, useValue: mockMongoService },
                { provide: Logger, useValue: mockLogger },
            ],
        }).compile();

        service = module.get<ChunkProcessorService>(ChunkProcessorService);
        documentClient = module.get(DocumentProcessingClient);
        chunkMongoService = module.get(ChunkMongoService);
    });

    describe('validateConfig', () => {
        it('should throw if chunkSize is 0 or negative', () => {
            expect(() =>
                ChunkProcessorService.validateConfig({ ...mockConfig, chunkSize: 0 })
            ).toThrow(ProcessingException);
        });

        it('should throw if overlap is negative', () => {
            expect(() =>
                ChunkProcessorService.validateConfig({ ...mockConfig, overlap: -1 })
            ).toThrow(ProcessingException);
        });

        it('should throw if overlap is >= 1/3 of chunkSize', () => {
            expect(() =>
                ChunkProcessorService.validateConfig({
                    ...mockConfig,
                    chunkSize: 300,
                    overlap: 100,
                })
            ).toThrow(ProcessingException);
        });

        it('should throw if projectId or dataScope is missing', () => {
            expect(() =>
                ChunkProcessorService.validateConfig({ ...mockConfig, projectId: '' })
            ).toThrow('projectId is required');
        });
    });

    describe('processChunks', () => {
        it('should coordinate the end-to-end processing flow', async () => {
            // Setup Mocks
            documentClient.getChunks.mockResolvedValue(mockChunksFromApi);
            chunkMongoService.createChunks.mockResolvedValue(
                mockChunksFromApi.map((c, i) => ({ id: `id-${i}`, content: c }) as any)
            );

            const result = await service.processChunks(mockFile, mockConfig, 'token');

            // Verify Client Call
            expect(documentClient.getChunks).toHaveBeenCalledWith(
                mockFile.remoteId,
                mockConfig.chunkSize,
                mockConfig.overlap,
                'token'
            );

            // Verify Mongo Call
            expect(chunkMongoService.createChunks).toHaveBeenCalled();
            expect(result).toHaveLength(2);
            expect(result[0].content).toBe('chunk one content');
        });
    });

    describe('transformChunks', () => {
        it('should correctly map API strings to Chunk objects', () => {
            const result = ChunkProcessorService.transformChunks(mockFile, ['text'], mockConfig);

            expect(result[0]).toMatchObject({
                content: 'text',
                chunkIndex: 0,
                metadata: {
                    projectId: mockConfig.projectId,
                    fileId: mockFile.id,
                },
            });
            expect(result[0].fileId).toBeInstanceOf(Types.ObjectId);
        });
    });

    describe('processMarkdownChunks', () => {
        it('should include pageNumber in metadata for markdown chunks', async () => {
            documentClient.getChunks.mockResolvedValue(['md content']);
            chunkMongoService.createChunks.mockImplementation(async (data) => data as any);

            const pageNum = 5;
            const result = await service.processMarkdownChunks(mockFile, mockConfig, pageNum);

            expect(result[0].metadata).toHaveProperty('pageNumber', pageNum);
            expect(chunkMongoService.createChunks).toHaveBeenCalled();
        });
    });
});
