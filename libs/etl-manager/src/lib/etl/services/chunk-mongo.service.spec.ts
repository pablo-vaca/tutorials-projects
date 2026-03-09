/* eslint-disable max-lines-per-function */
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Model, Types } from 'mongoose';

import ChunkMongoService from './chunk-mongo.service';
import { Chunk, ChunkDocument } from '../schemas/chunk.schema';

describe('ChunkMongoService', () => {
    let service: ChunkMongoService;
    let model: Model<ChunkDocument>;

    const mockFileId = new Types.ObjectId().toHexString();
    const mockChunkId = new Types.ObjectId().toHexString();

    const mockChunk = {
        _id: mockChunkId,
        fileId: mockFileId,
        content: 'test content',
        embedding: [0.1, 0.2],
        // Mock the save method for the instance
        save: jest.fn().mockResolvedValue({ _id: mockChunkId, content: 'test content' }),
    };

    // Create the mock model with all necessary static methods
    const mockChunkModel = {
        // This allows the "new this.ChunkModel()" syntax
        new: jest.fn().mockReturnValue(mockChunk),
        constructor: jest.fn().mockReturnValue(mockChunk),
        find: jest.fn(),
        findByIdAndUpdate: jest.fn(),
        insertMany: jest.fn(),
        deleteMany: jest.fn(),
    };

    /**
     * IMPORTANT: To fix the "new Model()" type issue, we mock the constructor
     * by making the mockChunkModel a function that also has properties.
     */
    const mockModelFactory = jest.fn(() => mockChunk);
    Object.assign(mockModelFactory, mockChunkModel);

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ChunkMongoService,
                {
                    provide: getModelToken(Chunk.name),
                    useValue: mockModelFactory, // Use the factory here
                },
            ],
        }).compile();

        service = module.get<ChunkMongoService>(ChunkMongoService);
        // Cast to unknown then Model to satisfy TS
        model = module.get<Model<ChunkDocument>>(getModelToken(Chunk.name));
        jest.clearAllMocks();
    });

    describe('createChunk', () => {
        it('should create and save a new chunk', async () => {
            const chunkData = { content: 'test content' };

            // Since your service does: const newChunk = new this.ChunkModel(chunkData);
            // We check the factory call
            const result = await service.createChunk(chunkData);

            expect(mockModelFactory).toHaveBeenCalledWith(chunkData);
            expect(mockChunk.save).toHaveBeenCalled();
            // eslint-disable-next-line no-underscore-dangle
            expect(result._id).toEqual(mockChunkId);
        });
    });

    describe('findByFileId', () => {
        it('should find chunks by fileId', async () => {
            const mockResult = [mockChunk];
            (model.find as jest.Mock).mockReturnValue({
                exec: jest.fn().mockResolvedValueOnce(mockResult),
            });

            const result = await service.findByFileId(mockFileId);

            expect(model.find).toHaveBeenCalledWith({
                fileId: expect.any(Types.ObjectId),
            });
            expect(result).toEqual(mockResult);
        });
    });

    describe('updateEmbedding', () => {
        it('should update the embedding', async () => {
            const newEmbedding = [0.5, 0.6];
            (model.findByIdAndUpdate as jest.Mock).mockReturnValue({
                exec: jest.fn().mockResolvedValueOnce({ ...mockChunk, embedding: newEmbedding }),
            });

            const result = await service.updateEmbedding(mockChunkId, newEmbedding);

            expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
                mockChunkId,
                { embedding: newEmbedding },
                { new: true }
            );
            expect(result?.embedding).toEqual(newEmbedding);
        });
    });

    describe('deleteByFileIds', () => {
        it('should handle multi-delete with ObjectId conversion', async () => {
            const ids = [mockFileId];
            (model.deleteMany as jest.Mock).mockReturnValue({
                exec: jest.fn().mockResolvedValueOnce({ deletedCount: 2 }),
            });

            const result = await service.deleteByFileIds(ids);

            expect(model.deleteMany).toHaveBeenCalledWith({
                fileId: { $in: [expect.any(Types.ObjectId)] },
            });
            expect(result.deletedCount).toBe(2);
        });
    });
});
