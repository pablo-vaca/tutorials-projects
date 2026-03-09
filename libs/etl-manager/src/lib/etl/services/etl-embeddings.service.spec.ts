/* eslint-disable max-lines-per-function */
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import ChunkMongoService from './chunk-mongo.service';
import EmbeddingsService from './embeddings-client';
import { ProcessingException } from '../exceptions';
import { ChunkDocument, EmbeddingSettings } from '../schemas';
import EtlEmbeddingProcessorService from './etl-embeddings-processor.service';

describe('EtlEmbeddingProcessorService', () => {
    let service: EtlEmbeddingProcessorService;
    let embeddingsService: jest.Mocked<EmbeddingsService>;
    let chunkMongoService: jest.Mocked<ChunkMongoService>;
    let configService: jest.Mocked<ConfigService>;
    let mockLogger: {
        info: jest.Mock;
        debug: jest.Mock;
        error: jest.Mock;
        warn: jest.Mock;
        verbose: jest.Mock;
    };

    const mockConfig: EmbeddingSettings = {
        deploymentId: 'dep-123',
        user: 'test-user',
        model: 'text-embedding-3',
    };

    const createMockChunk = (id: string, content: string) =>
        ({
            id,
            content,
        }) as ChunkDocument;

    beforeEach(async () => {
        const mockEmbeddingsService = { createEmbeddings: jest.fn() };
        const mockChunkMongoService = { updateEmbedding: jest.fn() };
        const mockConfigService = { get: jest.fn() };
        mockLogger = {
            info: jest.fn(),
            debug: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            verbose: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                EtlEmbeddingProcessorService,
                { provide: EmbeddingsService, useValue: mockEmbeddingsService },
                { provide: ChunkMongoService, useValue: mockChunkMongoService },
                { provide: ConfigService, useValue: mockConfigService },
                { provide: Logger, useValue: mockLogger },
            ],
        }).compile();

        service = module.get<EtlEmbeddingProcessorService>(EtlEmbeddingProcessorService);
        embeddingsService = module.get(EmbeddingsService);
        chunkMongoService = module.get(ChunkMongoService);
        configService = module.get(ConfigService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('validateConfig', () => {
        it('should throw if deploymentId, user, or model is missing', () => {
            expect(() =>
                EtlEmbeddingProcessorService.validateConfig({ ...mockConfig, deploymentId: '' })
            ).toThrow('deploymentId is required');
        });
    });

    describe('processEmbeddings', () => {
        it('should return early if no chunks are provided', async () => {
            await service.processEmbeddings([], mockConfig);
            expect(embeddingsService.createEmbeddings).not.toHaveBeenCalled();
        });

        it('should process embeddings in batches based on config', async () => {
            // Setup: 5 chunks, batch size 2
            const chunks = [
                createMockChunk('1', 'c1'),
                createMockChunk('2', 'c2'),
                createMockChunk('3', 'c3'),
                createMockChunk('4', 'c4'),
                createMockChunk('5', 'c5'),
            ];

            configService.get.mockReturnValue('2'); // Batch size

            // Mock API returning embeddings for batches
            embeddingsService.createEmbeddings
                .mockResolvedValueOnce([[0.1], [0.2]]) // Batch 1
                .mockResolvedValueOnce([[0.3], [0.4]]) // Batch 2
                .mockResolvedValueOnce([[0.5]]); // Batch 3

            await service.processEmbeddings(chunks, mockConfig);

            // Verify batching logic
            expect(embeddingsService.createEmbeddings).toHaveBeenCalledTimes(3);
            expect(embeddingsService.createEmbeddings).toHaveBeenNthCalledWith(
                1,
                ['c1', 'c2'],
                mockConfig.deploymentId,
                mockConfig.user,
                mockConfig.model
            );

            // Verify DB updates
            expect(chunkMongoService.updateEmbedding).toHaveBeenCalledTimes(5);
            expect(chunkMongoService.updateEmbedding).toHaveBeenCalledWith('1', [0.1]);
            expect(chunkMongoService.updateEmbedding).toHaveBeenCalledWith('5', [0.5]);
        });

        it('should throw ProcessingException if API returns wrong number of embeddings', async () => {
            const chunks = [createMockChunk('1', 'c1')];
            configService.get.mockReturnValue('100');

            // API returns empty array instead of 1 embedding
            embeddingsService.createEmbeddings.mockResolvedValue([]);

            await expect(service.processEmbeddings(chunks, mockConfig)).rejects.toThrow(
                ProcessingException
            );

            expect(chunkMongoService.updateEmbedding).not.toHaveBeenCalled();
        });

        it('should use default batch size of 100 if config is missing', async () => {
            const chunks = Array(10)
                .fill(null)
                .map((_, i) => createMockChunk(`${i}`, 'content'));
            configService.get.mockReturnValue(null); // No config

            embeddingsService.createEmbeddings.mockResolvedValue(Array(10).fill([0.1]));

            await service.processEmbeddings(chunks, mockConfig);

            // Should only call API once because default is 100
            expect(embeddingsService.createEmbeddings).toHaveBeenCalledTimes(1);
        });
    });
});
