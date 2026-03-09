import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';

import { Chunk, ChunkDocument } from '../schemas/chunk.schema';

@Injectable()
export default class ChunkMongoService {
    /**
     * @param ChunkModel - The Mongoose model for chunks.
     */
    constructor(@InjectModel(Chunk.name) private readonly ChunkModel: Model<ChunkDocument>) {}

    /**
     * Creates a new chunk document
     * @param chunkData - The chunk data to create
     * @returns {Promise<ChunkDocument>} The created chunk document
     */
    async createChunk(chunkData: Partial<Chunk>): Promise<ChunkDocument> {
        const newChunk = new this.ChunkModel(chunkData);
        return newChunk.save();
    }

    /**
     * Finds all chunks for a specific file
     * @param fileId - The file ID to find chunks for
     * @returns {Promise<ChunkDocument[]>} Array of chunk documents
     */
    async findByFileId(fileId: string): Promise<ChunkDocument[]> {
        return this.ChunkModel.find({ fileId: new Types.ObjectId(fileId) }).exec();
    }

    /**
     * Updates the embedding for a specific chunk
     * @param chunkId - The chunk ID to update
     * @param embedding - The new embedding array
     * @returns {Promise<ChunkDocument | null>} The updated chunk document or null
     */
    async updateEmbedding(chunkId: string, embedding: number[]): Promise<ChunkDocument | null> {
        return this.ChunkModel.findByIdAndUpdate(chunkId, { embedding }, { new: true }).exec();
    }

    /**
     * Creates multiple chunk documents in batch
     * @param chunksData - Array of chunk data to create
     * @returns {Promise<ChunkDocument[]>} Array of created chunk documents
     */
    async createChunks(chunksData: Partial<Chunk>[]): Promise<ChunkDocument[]> {
        return this.ChunkModel.insertMany(chunksData) as unknown as ChunkDocument[];
    }

    /**
     * Deletes multiple chunk documents in batch
     * @param query - The query to match documents to delete
     * @returns {Promise<{ deletedCount: number }>} The number of deleted documents
     */
    async deleteMany(query: FilterQuery<ChunkDocument>): Promise<{ deletedCount: number }> {
        const result = await this.ChunkModel.deleteMany(query).exec();
        return { deletedCount: result.deletedCount || 0 };
    }

    /**
     * Deletes all chunks for files belonging to a specific project
     * @param fileIds - Array of file IDs to delete chunks for
     * @returns {Promise<{ deletedCount: number }>} The number of deleted chunks
     */
    async deleteByFileIds(fileIds: string[]): Promise<{ deletedCount: number }> {
        const objectIds = fileIds.map((id) => new Types.ObjectId(id));
        const result = await this.ChunkModel.deleteMany({ fileId: { $in: objectIds } }).exec();
        return { deletedCount: result.deletedCount || 0 };
    }

    /**
     * Gets all chunks for a specific file, sorted by chunk index
     * @param fileId - The file ID to get chunks for
     * @returns {Promise<ChunkDocument[]>} Array of chunk documents sorted by chunkIndex
     */
    async getChunksByFileId(fileId: string): Promise<ChunkDocument[]> {
        return this.ChunkModel.find({ fileId: new Types.ObjectId(fileId) })
            .sort({ chunkIndex: 1 })
            .exec();
    }

    /**
     * Updates all chunks for a specific file with provided data
     * @param fileId - The file ID to update chunks for
     * @param updateData - The data to update
     * @returns {Promise<{ modifiedCount: number }>} The number of modified chunks
     */
    async updateChunksByFileId(
        fileId: string,
        updateData: Record<string, any>
    ): Promise<{ modifiedCount: number }> {
        const result = await this.ChunkModel.updateMany(
            { fileId: new Types.ObjectId(fileId) },
            { $set: updateData },
            { upsert: false }
        ).exec();

        return { modifiedCount: result.modifiedCount || 0 };
    }
}
